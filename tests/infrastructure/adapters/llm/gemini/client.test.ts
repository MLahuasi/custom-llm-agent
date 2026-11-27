import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { GeminiClient } from '../../../../../src/infrastructure/adapters/llm/gemini/client.js';

function createSdkMock() {
  return {
    models: {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    },
  } as unknown as GoogleGenAI & {
    models: {
      generateContent: ReturnType<typeof vi.fn>;
      generateContentStream: ReturnType<typeof vi.fn>;
    };
  };
}

function response(
  text: string,
  inputTokens = 2,
  outputTokens = 3,
  functionCalls: unknown[] = [],
) {
  return {
    text,
    functionCalls,
    candidates: functionCalls.length > 0
      ? [{ content: { role: 'model', parts: functionCalls.map((functionCall) => ({ functionCall })) } }]
      : undefined,
    usageMetadata: {
      promptTokenCount: inputTokens,
      candidatesTokenCount: outputTokens,
    },
  };
}

async function* streamChunks(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('GeminiClient', () => {
  it('maps history, system instruction, tools, and normalizes a response', async () => {
    const sdk = createSdkMock();
    sdk.models.generateContent.mockResolvedValue(response(' Hello\nworld ', 7, 4));
    const client = new GeminiClient(sdk, 'gemini-test', 512);

    const result = await client.ask({
      prompt: 'Final question',
      systemPrompt: 'Current system',
      history: [
        { role: 'system', content: 'Historical system' },
        { role: 'user', content: 'Previous question' },
      ],
      tools: [{
        name: 'weather',
        description: 'Read weather',
        inputSchema: { type: 'object' },
      }],
    });

    expect(result).toEqual({
      text: 'Hello world',
      usage: { provider: 'gemini', model: 'gemini-test', providerRequests: 1, inputTokens: 7, outputTokens: 4 },
      toolsUsed: [],
      toolCallCount: 0,
    });
    expect(sdk.models.generateContent).toHaveBeenCalledWith({
      model: 'gemini-test',
      contents: [
        { role: 'user', parts: [{ text: 'Previous question' }] },
        { role: 'user', parts: [{ text: 'Final question' }] },
      ],
      config: {
        systemInstruction: {
          role: 'user',
          parts: [{ text: 'Historical system\n\nCurrent system' }],
        },
        maxOutputTokens: 512,
        tools: [{ functionDeclarations: [{
          name: 'weather',
          description: 'Read weather',
          parametersJsonSchema: { type: 'object' },
        }] }],
      },
    });
  });

  it('executes function calls and reconstructs Gemini contents', async () => {
    const sdk = createSdkMock();
    sdk.models.generateContent
      .mockResolvedValueOnce(response(
        'I will check. ',
        5,
        6,
        [{ id: 'call_1', name: 'weather', args: { city: 'Madrid' } }],
      ))
      .mockResolvedValueOnce(response('It is sunny.', 8, 2));
    const execute = vi.fn().mockResolvedValue({ temperature: 24 });
    const client = new GeminiClient(sdk, 'gemini-test');

    const result = await client.ask({
      prompt: 'Weather?',
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      toolExecutor: { execute },
      maxIterations: 2,
      maxToolCalls: 1,
    });

    expect(execute).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'weather',
      arguments: { city: 'Madrid' },
    });
    expect(result).toEqual({
      text: 'I will check. It is sunny.',
      usage: { provider: 'gemini', model: 'gemini-test', providerRequests: 2, inputTokens: 13, outputTokens: 8 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });
    expect(sdk.models.generateContent.mock.calls[1][0].contents.at(-2)).toEqual({
      role: 'model',
      parts: [{ functionCall: { id: 'call_1', name: 'weather', args: { city: 'Madrid' } } }],
    });
    expect(sdk.models.generateContent.mock.calls[1][0].contents.at(-1)).toEqual({
      role: 'user',
      parts: [{
        functionResponse: {
          id: 'call_1',
          name: 'weather',
          response: { output: '{"temperature":24}' },
        },
      }],
    });
  });

  it('delivers streamed text deltas and returns the final response', async () => {
    const sdk = createSdkMock();
    sdk.models.generateContentStream.mockResolvedValue(streamChunks([
      { text: 'Hello', usageMetadata: { promptTokenCount: 2 } },
      { text: ' world', usageMetadata: { candidatesTokenCount: 3 } },
    ]));
    const chunks: string[] = [];
    const client = new GeminiClient(sdk, 'gemini-test');

    const result = await client.stream({
      prompt: 'Say hello',
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['Hello', ' world']);
    expect(result).toEqual({
      text: 'Hello world',
      usage: { provider: 'gemini', model: 'gemini-test', providerRequests: 1, inputTokens: 2, outputTokens: 3 },
      toolsUsed: [],
      toolCallCount: 0,
    });
  });

  it('converts provider failures, empty responses, and invalid usage safely', async () => {
    const sdk = createSdkMock();
    const client = new GeminiClient(sdk, 'gemini-test');

    sdk.models.generateContent.mockRejectedValue(new Error('secret payload'));
    const providerError = client.ask({ prompt: 'Hello' });
    await expect(providerError).rejects.toMatchObject({ code: 'LLM_PROVIDER_ERROR' });
    await expect(providerError).rejects.not.toThrow('secret payload');

    sdk.models.generateContent.mockResolvedValue(response(''));
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
    });

    sdk.models.generateContent.mockResolvedValue({
      text: 'Hello',
      usageMetadata: { promptTokenCount: -1 },
    });
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
    });
  });

  it('applies iteration and tool-call limits', async () => {
    const sdk = createSdkMock();
    sdk.models.generateContent.mockResolvedValue(response('', 1, 1, [
      { id: 'call_1', name: 'tool', args: {} },
    ]));
    const client = new GeminiClient(sdk, 'gemini-test');

    await expect(client.ask({
      prompt: 'Loop',
      tools: [{ name: 'tool', inputSchema: { type: 'object' } }],
      maxIterations: 1,
    })).rejects.toMatchObject({ code: 'LLM_MAX_ITERATIONS_EXCEEDED' });

    await expect(client.ask({
      prompt: 'Too many',
      tools: [{ name: 'tool', inputSchema: { type: 'object' } }],
      maxToolCalls: 0,
    })).rejects.toMatchObject({ code: 'LLM_INVALID_LIMIT' });
  });
});
