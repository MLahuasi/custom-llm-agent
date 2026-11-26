import Groq from 'groq-sdk';
import type { ChatCompletion } from 'groq-sdk/resources/chat/completions.js';
import { AppError } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { mapMessages, mapToolCalls, mapTools } from './mappers.js';

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

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: mappedMessages.messages,
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
        ...(tools.length > 0 ? { tools } : {}),
      });

      return normalizeResponse(response);
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

  public async stream(_request: LlmRequest): Promise<LlmResponse> {
    throw new AppError(
      'Groq streaming is implemented in a later step.',
      'LLM_STREAM_NOT_IMPLEMENTED',
    );
  }
}

function normalizeResponse(response: ChatCompletion): LlmResponse {
  const choice = response.choices[0];
  if (choice === undefined) {
    throw new AppError(
      'The LLM provider returned an invalid response.',
      'LLM_INVALID_RESPONSE',
    );
  }

  const toolCalls = choice.message.tool_calls ?? [];
  const mappedCalls = mapToolCalls(toolCalls);
  const text = normalizeText(choice.message.content ?? '');

  if (text.length === 0 && mappedCalls.length === 0) {
    throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
  }

  return {
    text,
    usage: {
      providerRequests: 1,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
    toolsUsed: mappedCalls.map((call) => call.name),
    toolCallCount: mappedCalls.length,
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
