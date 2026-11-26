import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  Message,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages.js';
import { AppError } from '../../../../shared/index.js';
import { getLlmDefaults } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { mapMessages, mapTools } from './mappers.js';
import { executeToolCalls } from '../tool-executor.js';

const PROVIDER_ERROR_CODE = 'LLM_PROVIDER_ERROR';

export class AnthropicClient implements LlmClient {
  public constructor(
    private readonly client: Anthropic,
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
    const messages: MessageParam[] = [...mappedMessages.messages];
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
      const message = await this.createMessage(
        messages,
        mappedMessages.system,
        tools,
        request.maxTokens,
      );
      providerRequests += 1;
      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;

      const responseText = extractText(message);
      if (responseText.length > 0) {
        textParts.push(responseText);
      }

      const toolCalls = message.content.filter(isToolUseBlock);
      toolCallCount += toolCalls.length;
      toolCalls.forEach((call) => toolsUsed.add(call.name));

      if (toolCalls.length === 0) {
        const text = normalizeText(textParts.join(''));
        if (text.length === 0) {
          throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
        }

        return {
          text,
          usage: { providerRequests, inputTokens, outputTokens },
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

      messages.push({ role: 'assistant', content: message.content });
      const results = await executeToolCalls(
        toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: toArguments(call.input),
        })),
        request.tools ?? [],
        request.toolExecutor,
        seenToolCalls,
      );
      messages.push({
        role: 'user',
        content: results.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      });
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
    const callbackPromises: Promise<unknown>[] = [];

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
        messages: mappedMessages.messages,
        ...(mappedMessages.system !== undefined
          ? { system: mappedMessages.system }
          : {}),
        ...(tools.length > 0 ? { tools } : {}),
      });

      stream.on('text', (delta) => {
        if (request.onChunk !== undefined) {
          callbackPromises.push(Promise.resolve(request.onChunk(delta)));
        }
      });

      const message = await stream.finalMessage();
      await Promise.all(callbackPromises);

      const normalized = normalizeMessage(message);
      if (normalized.text.length === 0 && normalized.toolCallCount === 0) {
        throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
      }

      return normalized;
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

  private async createMessage(
    messages: MessageParam[],
    system: string | undefined,
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
  ): Promise<Message> {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens ?? this.defaultMaxTokens,
        messages,
        ...(system !== undefined ? { system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
      });
    } catch {
      throw new AppError(
        'The LLM provider request failed.',
        PROVIDER_ERROR_CODE,
      );
    }
  }
}

function normalizeMessage(message: Message): LlmResponse {
  const text = normalizeText(extractText(message));
  const toolCalls = message.content.filter(isToolUseBlock);

  return {
    text,
    usage: {
      providerRequests: 1,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    toolsUsed: toolCalls.map((call) => call.name),
    toolCallCount: toolCalls.length,
  };
}

function extractText(message: Message): string {
  return message.content.filter(isTextBlock).map((block) => block.text).join('');
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return limit;
}

function toArguments(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : input as Record<string, unknown>;
}

function isTextBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: 'text' }> {
  return block.type === 'text';
}

function isToolUseBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: 'tool_use' }> {
  return block.type === 'tool_use';
}
