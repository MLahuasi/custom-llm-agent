import Groq from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
} from 'groq-sdk/resources/chat/completions.js';
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

  public async stream(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const callbackPromises: Promise<unknown>[] = [];
    const textParts: string[] = [];
    const toolCalls = new Map<number, ToolCallAccumulator>();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: mappedMessages.messages,
        max_tokens: request.maxTokens ?? this.defaultMaxTokens,
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
          if (request.onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(request.onChunk(text)));
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

      const mappedCalls = mapToolCalls([...toolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => completeToolCall(call)));
      const text = normalizeText(textParts.join(''));

      if (text.length === 0 && mappedCalls.length === 0) {
        throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
      }

      return {
        text,
        usage: { providerRequests: 1, inputTokens, outputTokens },
        toolsUsed: mappedCalls.map((call) => call.name),
        toolCallCount: mappedCalls.length,
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

function readUsage(
  chunk: unknown,
): { inputTokens: number; outputTokens: number } | undefined {
  if (chunk === null || typeof chunk !== 'object') {
    return undefined;
  }

  const usage = (chunk as { usage?: unknown }).usage;
  if (usage === null || typeof usage !== 'object') {
    return undefined;
  }

  const promptTokens = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completionTokens = (usage as { completion_tokens?: unknown }).completion_tokens;
  if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') {
    return undefined;
  }

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
  };
}
