import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import { AppError, getLlmDefaults } from '../../../../shared/index.js';
import type {
  LlmClient,
  LlmRequest,
  LlmResponse,
} from '../../../../application/index.js';
import { mapMessages, mapToolCalls, mapTools } from './mappers.js';

const PROVIDER_ERROR_CODE = 'LLM_PROVIDER_ERROR';

export class GeminiClient implements LlmClient {
  public constructor(
    private readonly client: GoogleGenAI,
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

    // Validate shared limits at the adapter boundary even before iterative tool
    // continuation is added in the following implementation step.
    const defaults = getLlmDefaults();
    normalizeLimit(request.maxIterations, defaults.maxIterations, 'maxIterations');
    normalizeLimit(request.maxToolCalls, defaults.maxToolCalls, 'maxToolCalls');

    const response = await this.generateContent(
      mappedMessages.contents,
      mappedMessages.systemInstruction,
      tools,
      request.maxTokens,
    );
    const text = normalizeText(response.text ?? '');
    const functionCalls = response.functionCalls ?? [];
    const mappedCalls = mapToolCalls(functionCalls);

    if (text.length === 0 && mappedCalls.length === 0) {
      throw new AppError('The LLM returned an empty response.', 'LLM_EMPTY_RESPONSE');
    }

    return {
      text,
      usage: {
        providerRequests: 1,
        inputTokens: normalizeTokenCount(response.usageMetadata?.promptTokenCount),
        outputTokens: normalizeTokenCount(response.usageMetadata?.candidatesTokenCount),
      },
      toolsUsed: mappedCalls.map((call) => call.name),
      toolCallCount: mappedCalls.length,
    };
  }

  public async stream(request: LlmRequest): Promise<LlmResponse> {
    const mappedMessages = mapMessages(
      request.history,
      request.prompt,
      request.systemPrompt,
    );
    const tools = mapTools(request.tools);
    const defaults = getLlmDefaults();
    normalizeLimit(request.maxIterations, defaults.maxIterations, 'maxIterations');
    normalizeLimit(request.maxToolCalls, defaults.maxToolCalls, 'maxToolCalls');

    try {
      const stream = await this.generateContentStream(
        mappedMessages.contents,
        mappedMessages.systemInstruction,
        tools,
        request.maxTokens,
      );
      const callbackPromises: Promise<unknown>[] = [];
      const textParts: string[] = [];
      const functionCalls = [] as NonNullable<GenerateContentResponse['functionCalls']>;
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const text = chunk.text ?? '';
        if (text.length > 0) {
          textParts.push(text);
          if (request.onChunk !== undefined) {
            callbackPromises.push(Promise.resolve(request.onChunk(text)));
          }
        }

        if (chunk.functionCalls !== undefined) {
          functionCalls.push(...chunk.functionCalls);
        }

        inputTokens = normalizeTokenCount(chunk.usageMetadata?.promptTokenCount);
        outputTokens = normalizeTokenCount(chunk.usageMetadata?.candidatesTokenCount);
      }

      await Promise.all(callbackPromises);

      const text = normalizeText(textParts.join(''));
      const mappedCalls = mapToolCalls(functionCalls);
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

  private async generateContent(
    contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
    systemInstruction: Content | undefined,
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
  ): Promise<GenerateContentResponse> {
    try {
      return await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          ...(systemInstruction !== undefined ? { systemInstruction } : {}),
          ...(maxTokens !== undefined
            ? { maxOutputTokens: maxTokens }
            : { maxOutputTokens: this.defaultMaxTokens }),
          ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      });
    } catch {
      throw new AppError(
        'The LLM provider request failed.',
        PROVIDER_ERROR_CODE,
      );
    }
  }

  private async generateContentStream(
    contents: Parameters<GoogleGenAI['models']['generateContentStream']>[0]['contents'],
    systemInstruction: Content | undefined,
    tools: ReturnType<typeof mapTools>,
    maxTokens: number | undefined,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      return await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          ...(systemInstruction !== undefined ? { systemInstruction } : {}),
          ...(maxTokens !== undefined
            ? { maxOutputTokens: maxTokens }
            : { maxOutputTokens: this.defaultMaxTokens }),
          ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      });
    } catch {
      throw new AppError(
        'The LLM provider stream failed.',
        'LLM_STREAM_PROVIDER_ERROR',
      );
    }
  }
}

function normalizeLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(`The ${name} limit is invalid.`, 'LLM_INVALID_LIMIT');
  }

  return limit;
}

function normalizeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
