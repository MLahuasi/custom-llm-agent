import { Ollama } from 'ollama';
import type { ChatResponse, Fetch, Message, Options, ToolCall } from 'ollama';
import { AppError, getLlmDefaults } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import {
  mapMessages,
  mapToolCalls,
  mapToolResult,
  mapTools,
} from './mappers.js';
import { executeToolCalls } from '../tool-executor.js';

const PROVIDER_ERROR_CODE = 'LLM_PROVIDER_ERROR';

export class OllamaClient implements LlmClient {
  private readonly client: Ollama;

  public constructor(
    host: string,
    private readonly model: string,
    private readonly defaultOptions: Partial<Options> = {},
    fetchImplementation: Fetch = fetch,
  ) {
    this.client = new Ollama({ host, fetch: fetchImplementation });
  }

  public async ask(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const defaults = getLlmDefaults();
    const maxIterations = normalizeLimit(request.maxIterations, defaults.maxIterations, 'maxIterations');
    const maxToolCalls = normalizeLimit(request.maxToolCalls, defaults.maxToolCalls, 'maxToolCalls');
    const messages: Message[] = [...mappedMessages.messages];
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const response = await this.client.chat({
          model: this.model,
          messages,
          stream: false,
          ...(tools.length > 0 ? { tools } : {}),
          options: this.buildOptions(request.maxTokens),
        });

        validateResponse(response);
        providerRequests += 1;
        inputTokens += normalizeTokenCount(response.prompt_eval_count, 'prompt_eval_count');
        outputTokens += normalizeTokenCount(response.eval_count, 'eval_count');

        if (response.message.content.length > 0) {
          textParts.push(response.message.content);
        }

        const toolCalls = response.message.tool_calls ?? [];
        const mappedCalls = mapToolCalls(toolCalls);
        toolCallCount += mappedCalls.length;
        mappedCalls.forEach((call) => toolsUsed.add(call.name));

        if (mappedCalls.length === 0) {
          return createResponse(
            textParts,
            providerRequests,
            inputTokens,
            outputTokens,
            toolsUsed,
            toolCallCount,
          );
        }

        if (toolCallCount > maxToolCalls) {
          throw new AppError(
            'The maximum number of tool calls was exceeded.',
            'LLM_MAX_TOOL_CALLS_EXCEEDED',
          );
        }
        if (iteration === maxIterations - 1) {
          throw new AppError(
            'The maximum number of LLM iterations was exceeded.',
            'LLM_MAX_ITERATIONS_EXCEEDED',
          );
        }

        messages.push({
          role: 'assistant',
          content: response.message.content,
          tool_calls: toolCalls,
        });
        const results = await executeToolCalls(
          mappedCalls,
          request.tools ?? [],
          request.toolExecutor,
          seenToolCalls,
        );
        messages.push(...results.map(mapToolResult));
      }

      throw new AppError(
        'The maximum number of LLM iterations was exceeded.',
        'LLM_MAX_ITERATIONS_EXCEEDED',
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('The LLM provider request failed.', PROVIDER_ERROR_CODE);
    }
  }

  public async stream(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const defaults = getLlmDefaults();
    const maxIterations = normalizeLimit(request.maxIterations, defaults.maxIterations, 'maxIterations');
    const maxToolCalls = normalizeLimit(request.maxToolCalls, defaults.maxToolCalls, 'maxToolCalls');
    const messages: Message[] = [...mappedMessages.messages];
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const streamed = await this.consumeStream(
          messages,
          tools,
          request.maxTokens,
          request.onChunk,
        );
        providerRequests += 1;
        inputTokens += streamed.inputTokens;
        outputTokens += streamed.outputTokens;
        if (streamed.text.length > 0) {
          textParts.push(streamed.text);
        }

        const mappedCalls = mapToolCalls(streamed.toolCalls);
        toolCallCount += mappedCalls.length;
        mappedCalls.forEach((call) => toolsUsed.add(call.name));

        if (mappedCalls.length === 0) {
          return createResponse(
            textParts,
            providerRequests,
            inputTokens,
            outputTokens,
            toolsUsed,
            toolCallCount,
          );
        }

        if (toolCallCount > maxToolCalls) {
          throw new AppError(
            'The maximum number of tool calls was exceeded.',
            'LLM_MAX_TOOL_CALLS_EXCEEDED',
          );
        }
        if (iteration === maxIterations - 1) {
          throw new AppError(
            'The maximum number of LLM iterations was exceeded.',
            'LLM_MAX_ITERATIONS_EXCEEDED',
          );
        }

        messages.push({
          role: 'assistant',
          content: streamed.text,
          tool_calls: streamed.toolCalls,
        });
        const results = await executeToolCalls(
          mappedCalls,
          request.tools ?? [],
          request.toolExecutor,
          seenToolCalls,
        );
        messages.push(...results.map(mapToolResult));
      }

      throw new AppError(
        'The maximum number of LLM iterations was exceeded.',
        'LLM_MAX_ITERATIONS_EXCEEDED',
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('The LLM provider stream failed.', 'LLM_STREAM_PROVIDER_ERROR');
    }
  }

  private async consumeStream(
    messages: Message[],
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
    onChunk: LlmRequest['onChunk'],
  ): Promise<StreamResult> {
    const textParts: string[] = [];
    const toolCalls = new Map<number, ToolCall>();
    const callbackPromises: Promise<unknown>[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages,
        stream: true,
        ...(tools.length > 0 ? { tools } : {}),
        options: this.buildOptions(maxTokens),
      });

      for await (const chunk of response) {
        validateResponse(chunk);
        if (chunk.message.content.length > 0) {
          textParts.push(chunk.message.content);
          if (onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(onChunk(chunk.message.content)));
          }
        }

        for (const [index, toolCall] of (chunk.message.tool_calls ?? []).entries()) {
          toolCalls.set(index, mergeToolCall(toolCalls.get(index), toolCall));
        }
        if (chunk.prompt_eval_count !== undefined) {
          inputTokens = normalizeTokenCount(chunk.prompt_eval_count, 'prompt_eval_count');
        }
        if (chunk.eval_count !== undefined) {
          outputTokens = normalizeTokenCount(chunk.eval_count, 'eval_count');
        }
      }

      await Promise.all(callbackPromises);
      return {
        text: normalizeText(textParts.join('')),
        toolCalls: [...toolCalls.values()],
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('The LLM provider stream failed.', 'LLM_STREAM_PROVIDER_ERROR');
    }
  }

  private buildOptions(maxTokens: number | undefined): Partial<Options> {
    return {
      ...this.defaultOptions,
      ...(maxTokens !== undefined ? { num_predict: maxTokens } : {}),
    };
  }
}

interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

function createResponse(
  textParts: readonly string[],
  providerRequests: number,
  inputTokens: number,
  outputTokens: number,
  toolsUsed: ReadonlySet<string>,
  toolCallCount: number,
): LlmResponse {
  const text = normalizeText(textParts.join(' '));
  if (text.length === 0 && toolCallCount === 0) {
    throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
  }

  return {
    text,
    usage: { providerRequests, inputTokens, outputTokens },
    toolsUsed: [...toolsUsed],
    toolCallCount,
  };
}

function validateResponse(response: ChatResponse): void {
  if (
    response === null
    || typeof response !== 'object'
    || response.message === null
    || typeof response.message !== 'object'
  ) {
    throw new AppError(
      'The LLM provider returned an invalid response.',
      'LLM_INVALID_RESPONSE',
    );
  }
}

function normalizeTokenCount(value: number | undefined, name: string): number {
  if (value === undefined) {
    return 0;
  }

  if (Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new AppError(
    `The LLM provider returned invalid ${name}.`,
    'LLM_INVALID_RESPONSE',
  );
}

function normalizeLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return limit;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function mergeToolCall(previous: ToolCall | undefined, current: ToolCall): ToolCall {
  if (previous === undefined) {
    return current;
  }

  return {
    function: {
      name: current.function.name || previous.function.name,
      arguments: {
        ...previous.function.arguments,
        ...current.function.arguments,
      },
    },
  };
}
