import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiClient } from '../../../../../src/infrastructure/adapters/llm/openai/client.js';

function createSdkMock() {
  return {
    responses: {
      create: vi.fn(),
    },
    embeddings: {
      create: vi.fn(),
    },
  } as unknown as OpenAI & {
    responses: { create: ReturnType<typeof vi.fn> };
    embeddings: { create: ReturnType<typeof vi.fn> };
  };
}

function response(
  output: unknown[],
  outputText: string,
  inputTokens = 2,
  outputTokens = 3,
) {
  return {
    id: 'resp_test',
    status: 'completed',
    output,
    output_text: outputText,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

function functionCall(
  callId: string,
  name: string,
  argumentsValue: string,
) {
  return {
    id: `fc_${callId}`,
    type: 'function_call',
    status: 'completed',
    call_id: callId,
    name,
    arguments: argumentsValue,
  };
}

async function* streamEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

describe('OpenAiClient', () => {
  it('maps history and normalizes a complete response', async () => {
    const sdk = createSdkMock();
    sdk.responses.create.mockResolvedValue(
      response([], ' Hello\nworld ', 7, 4),
    );
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test', 512);

    const result = await client.ask({
      prompt: 'Final question',
      systemPrompt: 'Current system',
      history: [
        { role: 'system', content: 'Historical system' },
        { role: 'user', content: 'Previous question' },
      ],
    });

    expect(result).toEqual({
      text: 'Hello world',
      usage: { provider: 'openai', model: 'gpt-test', providerRequests: 1, inputTokens: 7, outputTokens: 4 },
      toolsUsed: [],
      toolCallCount: 0,
    });
    expect(sdk.responses.create).toHaveBeenCalledWith({
      model: 'gpt-test',
      max_output_tokens: 512,
      instructions: 'Historical system\n\nCurrent system',
      input: [
        { role: 'user', content: 'Previous question' },
        { role: 'user', content: 'Final question' },
      ],
    });
  });

  it('executes tools iteratively and associates outputs by call_id', async () => {
    const sdk = createSdkMock();
    sdk.responses.create
      .mockResolvedValueOnce(
        response(
          [functionCall('call_1', 'weather', '{"city":"Madrid"}')],
          'I will check. ',
          5,
          6,
        ),
      )
      .mockResolvedValueOnce(response([], 'It is sunny.', 8, 2));
    const execute = vi.fn().mockResolvedValue({ temperature: 24 });
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test');

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
      usage: { provider: 'openai', model: 'gpt-test', providerRequests: 2, inputTokens: 13, outputTokens: 8 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });
    expect(sdk.responses.create.mock.calls[1][0].input).toEqual([
      { role: 'user', content: 'Weather?' },
      expect.objectContaining({
        type: 'function_call',
        call_id: 'call_1',
      }),
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"temperature":24}',
      },
    ]);
  });

  it('delivers streamed text deltas and returns the final response', async () => {
    const sdk = createSdkMock();
    sdk.responses.create.mockReturnValue(
      streamEvents([
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.output_text.delta', delta: ' world' },
        { type: 'response.completed', response: response([], 'Hello world') },
      ]),
    );
    const chunks: string[] = [];
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test');

    const result = await client.stream({
      prompt: 'Say hello',
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['Hello', ' world']);
    expect(result).toEqual({
      text: 'Hello world',
      usage: { provider: 'openai', model: 'gpt-test', providerRequests: 1, inputTokens: 2, outputTokens: 3 },
      toolsUsed: [],
      toolCallCount: 0,
    });
  });

  it('preserves embedding order and returns vectors only', async () => {
    const sdk = createSdkMock();
    sdk.embeddings.create.mockResolvedValue({
      data: [
        { object: 'embedding', index: 1, embedding: [2, 2] },
        { object: 'embedding', index: 0, embedding: [1, 1] },
      ],
    });
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test');

    await expect(client.generateEmbeddings(['first', 'second'])).resolves.toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(sdk.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-test',
      input: ['first', 'second'],
    });
  });

  it('rejects invalid embedding input and provider failures safely', async () => {
    const sdk = createSdkMock();
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test');

    await expect(client.generateEmbedding('   ')).rejects.toMatchObject({
      code: 'EMBEDDING_INVALID_INPUT',
    });
    await expect(client.generateEmbeddings([])).rejects.toMatchObject({
      code: 'EMBEDDING_INVALID_INPUT',
    });
    await expect(client.generateEmbeddings(['ok', ''])).rejects.toMatchObject({
      code: 'EMBEDDING_INVALID_INPUT',
    });

    sdk.embeddings.create.mockRejectedValue(new Error('secret payload'));
    const providerError = client.generateEmbedding('ok');
    await expect(providerError).rejects.toMatchObject({
      code: 'EMBEDDING_PROVIDER_ERROR',
    });
    await expect(providerError).rejects.not.toThrow('secret payload');
  });

  it('converts provider failures and empty responses into AppError', async () => {
    const sdk = createSdkMock();
    sdk.responses.create.mockRejectedValue(new Error('secret payload'));
    const client = new OpenAiClient(sdk, 'gpt-test', 'text-embedding-test');

    const providerError = client.ask({ prompt: 'Hello' });
    await expect(providerError).rejects.toMatchObject({ code: 'LLM_PROVIDER_ERROR' });
    await expect(providerError).rejects.not.toThrow('secret payload');

    sdk.responses.create.mockResolvedValue(response([], ''));
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
    });
  });
});
