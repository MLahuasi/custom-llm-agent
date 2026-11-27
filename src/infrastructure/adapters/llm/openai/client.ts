import OpenAI from 'openai';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems.js';
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInput,
} from 'openai/resources/responses/responses.js';
import { AppError } from '../../../../shared/index.js';
import { getLlmDefaults } from '../../../../shared/index.js';
import type {
  EmbeddingClient,
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { executeToolCalls } from '../tool-executor.js';
import {
  mapMessages,
  mapToolCall,
  mapToolResult,
  mapTools,
} from './mappers.js';

const PROVIDER_ERROR_CODE = 'LLM_PROVIDER_ERROR';

export class OpenAiClient implements LlmClient, EmbeddingClient {
  public constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly embeddingModel: string,
    private readonly defaultMaxTokens = 1024,
  ) {}

  public async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  public async generateEmbeddings(
    texts: readonly string[],
  ): Promise<number[][]> {
    validateEmbeddingInputs(texts);

    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: [...texts],
      });
      if (!Array.isArray(response.data)) {
        throw new AppError(
          'The embedding provider returned an invalid response.',
          'EMBEDDING_INVALID_RESPONSE',
        );
      }
      const data = [...response.data].sort((left, right) => left.index - right.index);

      if (data.length !== texts.length || data.some((item, index) => item.index !== index)) {
        throw new AppError(
          'The embedding provider returned an invalid response.',
          'EMBEDDING_INVALID_RESPONSE',
        );
      }

      return data.map((item) => {
        if (!isNumberVector(item.embedding)) {
          throw new AppError(
            'The embedding provider returned an invalid vector.',
            'EMBEDDING_INVALID_RESPONSE',
          );
        }

        return item.embedding;
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'The embedding provider request failed.',
        'EMBEDDING_PROVIDER_ERROR',
      );
    }
  }

  public async ask(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const input: ResponseInput = [...mappedMessages.input];
    const llmDefaults = getLlmDefaults();
    const maxIterations = normalizeLimit(
      request.maxIterations,
      llmDefaults.maxIterations,
      'maxIterations',
    );
    const maxToolCalls = normalizeLimit(
      request.maxToolCalls,
      llmDefaults.maxToolCalls,
      'maxToolCalls',
    );
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await this.createResponse(
        input,
        mappedMessages.instructions,
        tools,
        request.maxTokens,
      );
      validateResponse(response);
      providerRequests += 1;
      const usage = normalizeUsage(response);
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;

      const responseText = normalizeText(response.output_text);
      if (responseText.length > 0) {
        textParts.push(responseText);
      }

      const toolCalls = response.output.filter(isFunctionToolCall);
      toolCallCount += toolCalls.length;
      toolCalls.forEach((call) => toolsUsed.add(call.name));

      if (toolCalls.length === 0) {
        const text = normalizeText(textParts.join(' '));
        if (text.length === 0) {
          throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
        }

        return {
          text,
          usage: {
            provider: 'openai',
            model: this.model,
            providerRequests,
            inputTokens,
            outputTokens,
          },
          toolsUsed: [...toolsUsed],
          toolCallCount,
        };
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

      input.push(...toResponseInputItems(response.output));
      const results = await executeToolCalls(
        toolCalls.map(mapToolCall),
        request.tools ?? [],
        request.toolExecutor,
        seenToolCalls,
      );
      input.push(...results.map(mapToolResult));
    }

    throw new AppError(
      'The maximum number of LLM iterations was exceeded.',
      'LLM_MAX_ITERATIONS_EXCEEDED',
    );
  }

  public async stream(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const input: ResponseInput = [...mappedMessages.input];
    const llmDefaults = getLlmDefaults();
    const maxIterations = normalizeLimit(
      request.maxIterations,
      llmDefaults.maxIterations,
      'maxIterations',
    );
    const maxToolCalls = normalizeLimit(
      request.maxToolCalls,
      llmDefaults.maxToolCalls,
      'maxToolCalls',
    );
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const streamed = await this.consumeStream(
        input,
        mappedMessages.instructions,
        tools,
        request.maxTokens,
        request.onChunk,
      );
      const response = streamed.response;
      validateResponse(response);
      providerRequests += 1;
      const usage = normalizeUsage(response);
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;

      const responseText = normalizeText(
        streamed.text.length > 0 ? streamed.text : response.output_text,
      );
      if (responseText.length > 0) {
        textParts.push(responseText);
      }

      const toolCalls = response.output.filter(isFunctionToolCall);
      const resolvedToolCalls = toolCalls.length > 0
        ? toolCalls
        : streamed.toolCalls;
      toolCallCount += resolvedToolCalls.length;
      resolvedToolCalls.forEach((call) => toolsUsed.add(call.name));

      if (resolvedToolCalls.length === 0) {
        const text = normalizeText(textParts.join(' '));
        if (text.length === 0) {
          throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
        }

        return {
          text,
          usage: {
            provider: 'openai',
            model: this.model,
            providerRequests,
            inputTokens,
            outputTokens,
          },
          toolsUsed: [...toolsUsed],
          toolCallCount,
        };
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

      input.push(...toResponseInputItems(response.output));
      const results = await executeToolCalls(
        resolvedToolCalls.map(mapToolCall),
        request.tools ?? [],
        request.toolExecutor,
        seenToolCalls,
      );
      input.push(...results.map(mapToolResult));
    }

    throw new AppError(
      'The maximum number of LLM iterations was exceeded.',
      'LLM_MAX_ITERATIONS_EXCEEDED',
    );
  }

  private async createResponse(
    input: ResponseInput,
    instructions: string | undefined,
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
  ): Promise<Response> {
    try {
      return await this.client.responses.create({
        model: this.model,
        input,
        max_output_tokens: maxTokens ?? this.defaultMaxTokens,
        ...(instructions !== undefined ? { instructions } : {}),
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
    input: ResponseInput,
    instructions: string | undefined,
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
    onChunk: LlmRequest['onChunk'],
  ): Promise<StreamResult> {
    try {
      const stream = await this.client.responses.create({
        model: this.model,
        input,
        max_output_tokens: maxTokens ?? this.defaultMaxTokens,
        stream: true,
        ...(instructions !== undefined ? { instructions } : {}),
        ...(tools.length > 0 ? { tools } : {}),
      });
      const callbackPromises: Promise<unknown>[] = [];
      const toolCalls = new Map<number, ResponseFunctionToolCall>();
      let text = '';
      let response: Response | undefined;

      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          text += event.delta;
          if (onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(onChunk(event.delta)));
          }
          continue;
        }

        if (event.type === 'response.output_item.added' && isFunctionToolCall(event.item)) {
          toolCalls.set(event.output_index, event.item);
          continue;
        }

        if (event.type === 'response.function_call_arguments.delta') {
          const call = toolCalls.get(event.output_index);
          if (call !== undefined) {
            call.arguments += event.delta;
          }
          continue;
        }

        if (event.type === 'response.output_item.done' && isFunctionToolCall(event.item)) {
          toolCalls.set(event.output_index, event.item);
          continue;
        }

        if (event.type === 'response.completed') {
          response = event.response;
          continue;
        }

        if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') {
          throw new AppError(
            'The LLM provider stream failed.',
            'LLM_STREAM_PROVIDER_ERROR',
          );
        }
      }

      await Promise.all(callbackPromises);

      if (response === undefined || response.status !== 'completed') {
        throw new AppError(
          'The LLM provider stream failed.',
          'LLM_STREAM_PROVIDER_ERROR',
        );
      }

      return {
        response,
        text,
        toolCalls: [...toolCalls.values()],
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

interface StreamResult {
  response: Response;
  text: string;
  toolCalls: ResponseFunctionToolCall[];
}

function normalizeLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return limit;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function validateResponse(response: Response): void {
  if (response.status !== undefined && response.status !== 'completed') {
    throw new AppError(
      'The LLM provider returned an incomplete response.',
      'LLM_PROVIDER_ERROR',
    );
  }

  if (!Array.isArray(response.output) || typeof response.output_text !== 'string') {
    throw new AppError(
      'The LLM provider returned an invalid response.',
      'LLM_INVALID_RESPONSE',
    );
  }
}

function normalizeUsage(response: Response): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = response.usage;
  if (usage === undefined || usage === null) {
    return { inputTokens: 0, outputTokens: 0 };
  }

  if (!isNonNegativeInteger(usage.input_tokens) || !isNonNegativeInteger(usage.output_tokens)) {
    throw new AppError(
      'The LLM provider returned invalid usage metrics.',
      'LLM_INVALID_RESPONSE',
    );
  }

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateEmbeddingInputs(texts: readonly string[]): void {
  if (texts.length === 0) {
    throw new AppError(
      'At least one text is required for embeddings.',
      'EMBEDDING_INVALID_INPUT',
    );
  }

  if (texts.some((text) => text.trim().length === 0)) {
    throw new AppError(
      'Embedding texts must not be empty.',
      'EMBEDDING_INVALID_INPUT',
    );
  }
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

function isFunctionToolCall(
  item: Response['output'][number],
): item is ResponseFunctionToolCall {
  return item.type === 'function_call';
}
