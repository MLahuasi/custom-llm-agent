import Groq from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  ChatCompletionMessageParam,
} from 'groq-sdk/resources/chat/completions.js';
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

export class GroqClient implements LlmClient {
  public constructor(
    private readonly client: Groq,
    private readonly model: string,
    private readonly defaultMaxTokens = 1024,
  ) {}

  public async ask(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const messages: ChatCompletionMessageParam[] = [...mappedMessages.messages];
    const maxTokens = normalizeOptionalLimit(request.maxTokens, 'maxTokens');
    const defaults = getLlmDefaults();
    const maxIterations = normalizeLimit(
      request.maxIterations,
      defaults.maxIterations,
      'maxIterations',
    );
    const maxToolCalls = normalizeLimit(
      request.maxToolCalls,
      defaults.maxToolCalls,
      'maxToolCalls',
    );
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const response = await this.createCompletion(
          messages,
          tools,
          maxTokens,
        );
        validateCompletion(response);
        providerRequests += 1;
        const usage = normalizeUsage(response.usage);
        inputTokens += usage.inputTokens;
        outputTokens += usage.outputTokens;

        const choice = response.choices[0];
        if (choice === undefined) {
          throw new AppError(
            'The LLM provider returned an invalid response.',
            'LLM_INVALID_RESPONSE',
          );
        }

        const responseText = choice.message.content ?? '';
        if (responseText.length > 0) {
          textParts.push(responseText);
        }

        const toolCalls = choice.message.tool_calls ?? [];
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
          content: choice.message.content,
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

      throw new AppError(
        'The LLM provider request failed.',
        PROVIDER_ERROR_CODE,
      );
    }
  }

  public async stream(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const messages: ChatCompletionMessageParam[] = [...mappedMessages.messages];
    const maxTokens = normalizeOptionalLimit(request.maxTokens, 'maxTokens');
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();
    const defaults = getLlmDefaults();
    const maxIterations = normalizeLimit(
      request.maxIterations,
      defaults.maxIterations,
      'maxIterations',
    );
    const maxToolCalls = normalizeLimit(
      request.maxToolCalls,
      defaults.maxToolCalls,
      'maxToolCalls',
    );
    let providerRequests = 0;
    let toolCallCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const streamed = await this.consumeStream(
          messages,
          tools,
          maxTokens,
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
          content: streamed.text.length > 0 ? streamed.text : null,
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

      throw new AppError(
        'The LLM provider stream failed.',
        'LLM_STREAM_PROVIDER_ERROR',
      );
    }
  }

  private async createCompletion(
    messages: ChatCompletionMessageParam[],
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
  ): Promise<ChatCompletion> {
    try {
      return await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: maxTokens ?? this.defaultMaxTokens,
        ...(tools.length > 0 ? { tools } : {}),
      });
    } catch {
      throw new AppError(
        'The LLM provider request failed.',
        PROVIDER_ERROR_CODE,
      );
    }
  }

  private async consumeStream(
    messages: ChatCompletionMessageParam[],
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
    onChunk: LlmRequest['onChunk'],
  ): Promise<StreamResult> {
    const callbackPromises: Promise<unknown>[] = [];
    const textParts: string[] = [];
    const toolCalls = new Map<number, ToolCallAccumulator>();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: maxTokens ?? this.defaultMaxTokens,
        stream: true,
        ...(tools.length > 0 ? { tools } : {}),
      });

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (choice === undefined) {
          continue;
        }

        const text = choice.delta.content ?? '';
        if (text.length > 0) {
          textParts.push(text);
          if (onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(onChunk(text)));
          }
        }

        for (const toolCall of choice.delta.tool_calls ?? []) {
          const current = toolCalls.get(toolCall.index) ?? { arguments: '' };
          toolCalls.set(toolCall.index, {
            ...(toolCall.id !== undefined ? { id: toolCall.id } : {}),
            ...(toolCall.function?.name !== undefined
              ? { name: toolCall.function.name }
              : {}),
            arguments: `${current.arguments}${toolCall.function?.arguments ?? ''}`,
          });
        }

        const usage = readUsage(chunk);
        if (usage !== undefined) {
          inputTokens = usage.inputTokens;
          outputTokens = usage.outputTokens;
        }
      }

      await Promise.all(callbackPromises);

      return {
        text: textParts.join(''),
        toolCalls: [...toolCalls.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, call]) => completeToolCall(call)),
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'The LLM provider stream failed.',
        'LLM_STREAM_PROVIDER_ERROR',
      );
    }
  }
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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function completeToolCall(
  call: ToolCallAccumulator,
): ChatCompletionMessageToolCall {
  if (
    typeof call.id !== 'string'
    || typeof call.name !== 'string'
  ) {
    throw new AppError(
      'The LLM provider returned an incomplete tool call.',
      'LLM_INVALID_RESPONSE',
    );
  }

  return {
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: call.arguments,
    },
  };
}

interface ToolCallAccumulator {
  id?: string;
  name?: string;
  arguments: string;
}

interface StreamResult {
  text: string;
  toolCalls: ChatCompletionMessageToolCall[];
  inputTokens: number;
  outputTokens: number;
}

function normalizeLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return limit;
}

function readUsage(
  chunk: unknown,
): { inputTokens: number; outputTokens: number } | undefined {
  if (chunk === null || typeof chunk !== 'object') {
    return undefined;
  }

  if (!('usage' in chunk)) {
    return undefined;
  }

  const usage = (chunk as { usage?: unknown }).usage;
  if (usage === undefined || usage === null) {
    return undefined;
  }
  if (typeof usage !== 'object') {
    throw new AppError(
      'The LLM provider returned invalid usage metadata.',
      'LLM_INVALID_RESPONSE',
    );
  }

  const promptTokens = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completionTokens = (usage as { completion_tokens?: unknown }).completion_tokens;

  return {
    inputTokens: normalizeTokenCount(promptTokens, 'prompt_tokens'),
    outputTokens: normalizeTokenCount(completionTokens, 'completion_tokens'),
  };
}

function validateCompletion(response: ChatCompletion): void {
  if (response === null || typeof response !== 'object' || !Array.isArray(response.choices)) {
    throw new AppError(
      'The LLM provider returned an invalid response.',
      'LLM_INVALID_RESPONSE',
    );
  }

  const choice = response.choices[0];
  if (choice === undefined || choice.message === null || typeof choice.message !== 'object') {
    throw new AppError(
      'The LLM provider returned an invalid response.',
      'LLM_INVALID_RESPONSE',
    );
  }

  const content = choice.message.content;
  if (content !== undefined && content !== null && typeof content !== 'string') {
    throw new AppError(
      'The LLM provider returned invalid response text.',
      'LLM_INVALID_RESPONSE',
    );
  }

  if (choice.message.tool_calls !== undefined && !Array.isArray(choice.message.tool_calls)) {
    throw new AppError(
      'The LLM provider returned invalid tool calls.',
      'LLM_INVALID_RESPONSE',
    );
  }
}

function normalizeUsage(
  usage: ChatCompletion['usage'],
): { inputTokens: number; outputTokens: number } {
  if (usage === undefined || usage === null) {
    return { inputTokens: 0, outputTokens: 0 };
  }

  return {
    inputTokens: normalizeTokenCount(usage.prompt_tokens, 'prompt_tokens'),
    outputTokens: normalizeTokenCount(usage.completion_tokens, 'completion_tokens'),
  };
}

function normalizeTokenCount(value: unknown, name: string): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new AppError(
    `The LLM provider returned invalid ${name}.`,
    'LLM_INVALID_RESPONSE',
  );
}

function normalizeOptionalLimit(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return value;
}
