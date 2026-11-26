import { Ollama } from 'ollama';
import type { ChatResponse, Fetch, Options, ToolCall } from 'ollama';
import { AppError } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { mapMessages, mapToolCalls, mapTools } from './mappers.js';

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

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: mappedMessages.messages,
        stream: false,
        ...(tools.length > 0 ? { tools } : {}),
        options: this.buildOptions(request.maxTokens),
      });

      validateResponse(response);
      const toolCalls = response.message.tool_calls ?? [];
      const mappedCalls = mapToolCalls(toolCalls);
      const text = normalizeText(response.message.content);

      if (text.length === 0 && mappedCalls.length === 0) {
        throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
      }

      return {
        text,
        usage: {
          providerRequests: 1,
          inputTokens: normalizeTokenCount(
            response.prompt_eval_count,
            'prompt_eval_count',
          ),
          outputTokens: normalizeTokenCount(response.eval_count, 'eval_count'),
        },
        toolsUsed: [...new Set(mappedCalls.map((call) => call.name))],
        toolCallCount: mappedCalls.length,
      };
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
    const textParts: string[] = [];
    const toolCalls = new Map<number, ToolCall>();
    const callbackPromises: Promise<unknown>[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: mappedMessages.messages,
        stream: true,
        ...(tools.length > 0 ? { tools } : {}),
        options: this.buildOptions(request.maxTokens),
      });

      for await (const chunk of response) {
        validateResponse(chunk);

        const text = chunk.message.content;
        if (text.length > 0) {
          textParts.push(text);
          if (request.onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(request.onChunk(text)));
          }
        }

        for (const [index, toolCall] of (chunk.message.tool_calls ?? []).entries()) {
          const previous = toolCalls.get(index);
          toolCalls.set(index, mergeToolCall(previous, toolCall));
        }

        if (chunk.prompt_eval_count !== undefined) {
          inputTokens = normalizeTokenCount(
            chunk.prompt_eval_count,
            'prompt_eval_count',
          );
        }
        if (chunk.eval_count !== undefined) {
          outputTokens = normalizeTokenCount(chunk.eval_count, 'eval_count');
        }
      }

      await Promise.all(callbackPromises);

      const mappedCalls = mapToolCalls([...toolCalls.values()]);
      const text = normalizeText(textParts.join(''));
      if (text.length === 0 && mappedCalls.length === 0) {
        throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
      }

      return {
        text,
        usage: { providerRequests: 1, inputTokens, outputTokens },
        toolsUsed: [...new Set(mappedCalls.map((call) => call.name))],
        toolCallCount: mappedCalls.length,
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
