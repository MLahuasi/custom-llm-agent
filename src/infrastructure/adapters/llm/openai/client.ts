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

export class OpenAiClient {
  public constructor(
    private readonly client: OpenAI,
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
      providerRequests += 1;
      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;

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

function isFunctionToolCall(
  item: Response['output'][number],
): item is ResponseFunctionToolCall {
  return item.type === 'function_call';
}
