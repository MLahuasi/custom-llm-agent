import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
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

    // Validate shared limits at the adapter boundary before entering the loop.
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

    const contents = [...mappedMessages.contents];
    const textParts: string[] = [];
    const toolsUsed = new Set<string>();
    const seenToolCalls = new Set<string>();
    let providerRequests = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallCount = 0;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await this.generateContent(
        contents,
        mappedMessages.systemInstruction,
        tools,
        request.maxTokens,
      );
      providerRequests += 1;
      inputTokens += normalizeTokenCount(response.usageMetadata?.promptTokenCount);
      outputTokens += normalizeTokenCount(response.usageMetadata?.candidatesTokenCount);

      const responseText = normalizeText(response.text ?? '');
      if (responseText.length > 0) {
        textParts.push(responseText);
      }

      const functionCalls = response.functionCalls ?? [];
      const mappedCalls = mapToolCalls(functionCalls);
      toolCallCount += mappedCalls.length;
      mappedCalls.forEach((call) => toolsUsed.add(call.name));

      if (mappedCalls.length === 0) {
        const text = normalizeText(textParts.join(' '));
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

      contents.push(modelContent(response, functionCalls));
      const results = await executeToolCalls(
        mappedCalls,
        request.tools ?? [],
        request.toolExecutor,
        seenToolCalls,
      );
      contents.push({ role: 'user', parts: results.map(mapToolResult) });
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

    try {
      const contents = [...mappedMessages.contents];
      const textParts: string[] = [];
      const toolsUsed = new Set<string>();
      const seenToolCalls = new Set<string>();
      let providerRequests = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let toolCallCount = 0;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const stream = await this.generateContentStream(
          contents,
          mappedMessages.systemInstruction,
          tools,
          request.maxTokens,
        );
        const callbackPromises: Promise<unknown>[] = [];
        const functionCalls = [] as NonNullable<GenerateContentResponse['functionCalls']>;
        const modelParts: NonNullable<Content['parts']> = [];

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

          const chunkParts = chunk.candidates?.[0]?.content?.parts;
          if (chunkParts !== undefined) {
            modelParts.push(...chunkParts);
          }

          if (chunk.usageMetadata?.promptTokenCount !== undefined) {
            inputTokens = normalizeTokenCount(chunk.usageMetadata.promptTokenCount);
          }
          if (chunk.usageMetadata?.candidatesTokenCount !== undefined) {
            outputTokens = normalizeTokenCount(chunk.usageMetadata.candidatesTokenCount);
          }
        }

        await Promise.all(callbackPromises);
        providerRequests += 1;
        const mappedCalls = mapToolCalls(functionCalls);
        toolCallCount += mappedCalls.length;
        mappedCalls.forEach((call) => toolsUsed.add(call.name));

        if (mappedCalls.length === 0) {
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

        contents.push({
          role: 'model',
          parts: modelParts.length > 0
            ? modelParts
            : functionCalls.map((functionCall) => ({ functionCall })),
        });
        const results = await executeToolCalls(
          mappedCalls,
          request.tools ?? [],
          request.toolExecutor,
          seenToolCalls,
        );
        contents.push({ role: 'user', parts: results.map(mapToolResult) });
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

function modelContent(
  response: GenerateContentResponse,
  functionCalls: NonNullable<GenerateContentResponse['functionCalls']>,
): Content {
  const responseContent = response.candidates?.[0]?.content;
  if (responseContent?.parts !== undefined && responseContent.parts.length > 0) {
    return { role: 'model', parts: responseContent.parts };
  }

  return {
    role: 'model',
    parts: functionCalls.map((functionCall) => ({ functionCall })),
  };
}

function normalizeTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
