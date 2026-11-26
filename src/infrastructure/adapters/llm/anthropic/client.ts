import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  Message,
} from '@anthropic-ai/sdk/resources/messages.js';
import { AppError } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { mapMessages, mapTools } from './mappers.js';

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

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
        messages: mappedMessages.messages,
        ...(mappedMessages.system !== undefined
          ? { system: mappedMessages.system }
          : {}),
        ...(tools.length > 0 ? { tools } : {}),
      });

      return normalizeMessage(message);
    } catch {
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
    const callbackPromises: Promise<void>[] = [];

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

      return normalizeMessage(message);
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

function normalizeMessage(message: Message): LlmResponse {
  const textBlocks = message.content.filter(isTextBlock);
  const toolCalls = message.content.filter(isToolUseBlock);

  return {
    text: textBlocks.map((block) => block.text).join(''),
    usage: {
      providerRequests: 1,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    toolsUsed: toolCalls.map((call) => call.name),
    toolCallCount: toolCalls.length,
  };
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
