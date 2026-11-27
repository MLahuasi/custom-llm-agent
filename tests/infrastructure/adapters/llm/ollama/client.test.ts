import type { Fetch } from 'ollama';
import { describe, expect, it, vi } from 'vitest';
import { OllamaClient } from '../../../../../src/infrastructure/adapters/llm/ollama/client.js';

function createFetchMock(): ReturnType<typeof vi.fn<Fetch>> {
  return vi.fn<Fetch>();
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

function chatResponse(
  content: string,
  toolCalls: unknown[] = [],
  inputTokens = 2,
  outputTokens = 3,
) {
  return {
    model: 'llama-test',
    created_at: '2026-11-26T00:00:00.000Z',
    message: {
      role: 'assistant',
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    done: true,
    done_reason: 'stop',
    total_duration: 1,
    load_duration: 1,
    prompt_eval_count: inputTokens,
    prompt_eval_duration: 1,
    eval_count: outputTokens,
    eval_duration: 1,
  };
}

function toolCall(name: string, argumentsValue: Record<string, unknown>) {
  return {
    function: { name, arguments: argumentsValue },
  };
}

function streamResponse(chunks: readonly unknown[]): Response {
  const body = `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`;
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

describe('OllamaClient', () => {
  it('maps chat input and normalizes the response using an injected fetch', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse(chatResponse(' Hello\nworld ', [], 7, 4)));
    const client = new OllamaClient(
      'http://ollama.test',
      'llama-test',
      { temperature: 0.2 },
      fetchMock,
    );

    const result = await client.ask({
      prompt: 'Current question',
      systemPrompt: 'Current system',
      history: [
        { role: 'system', content: 'Historical system' },
        { role: 'user', content: 'Previous question' },
      ],
      maxTokens: 128,
    });

    expect(result).toEqual({
      text: 'Hello world',
      usage: { provider: 'ollama', model: 'llama-test', providerRequests: 1, inputTokens: 7, outputTokens: 4 },
      toolsUsed: [],
      toolCallCount: 0,
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      model: string;
      messages: unknown[];
      options: Record<string, unknown>;
    };
    expect(request.model).toBe('llama-test');
    expect(request.messages).toEqual([
      { role: 'system', content: 'Historical system\n\nCurrent system' },
      { role: 'user', content: 'Previous question' },
      { role: 'user', content: 'Current question' },
    ]);
    expect(request.options).toEqual({ temperature: 0.2, num_predict: 128 });
  });

  it('continues assistant and tool messages across iterative calls', async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(chatResponse('', [toolCall('weather', { city: 'Madrid' })])))
      .mockResolvedValueOnce(jsonResponse(chatResponse('It is sunny.', [], 8, 2)));
    const execute = vi.fn().mockResolvedValue({ temperature: 24 });
    const client = new OllamaClient('http://ollama.test', 'llama-test', {}, fetchMock);

    const result = await client.ask({
      prompt: 'Weather?',
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      toolExecutor: { execute },
      maxIterations: 2,
      maxToolCalls: 1,
    });

    expect(execute).toHaveBeenCalledWith({
      id: 'weather-0',
      name: 'weather',
      arguments: { city: 'Madrid' },
    });
    expect(result).toEqual({
      text: 'It is sunny.',
      usage: { provider: 'ollama', model: 'llama-test', providerRequests: 2, inputTokens: 10, outputTokens: 5 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });

    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(secondRequest.messages.at(-2)).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [toolCall('weather', { city: 'Madrid' })],
    });
    expect(secondRequest.messages.at(-1)).toEqual({
      role: 'tool',
      content: '{"temperature":24}',
      tool_name: 'weather',
    });
  });

  it('streams text, callbacks, metrics, and reconstructed tool arguments', async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(streamResponse([
      {
        model: 'llama-test',
        message: { role: 'assistant', content: 'Checking ' },
        done: false,
      },
      {
        model: 'llama-test',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall('weather', { city: 'Madrid' })],
        },
        done: false,
      },
      {
        model: 'llama-test',
        message: {
          role: 'assistant',
          content: 'weather.',
          tool_calls: [toolCall('weather', { unit: 'celsius' })],
        },
        done: true,
        prompt_eval_count: 5,
        eval_count: 6,
      },
      ]))
      .mockResolvedValueOnce(streamResponse([
        {
          model: 'llama-test',
          message: { role: 'assistant', content: 'Tool result received.' },
          done: true,
          prompt_eval_count: 3,
          eval_count: 2,
        },
      ]));
    const chunks: string[] = [];
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const client = new OllamaClient('http://ollama.test', 'llama-test', {}, fetchMock);

    const result = await client.stream({
      prompt: 'Weather?',
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      toolExecutor: { execute },
      onChunk: (chunk) => chunks.push(chunk),
      maxIterations: 2,
      maxToolCalls: 1,
    });

    expect(chunks).toEqual(['Checking ', 'weather.', 'Tool result received.']);
    expect(execute).toHaveBeenCalledWith({
      id: 'weather-0',
      name: 'weather',
      arguments: { city: 'Madrid', unit: 'celsius' },
    });
    expect(result).toEqual({
      text: 'Checking weather. Tool result received.',
      usage: { provider: 'ollama', model: 'llama-test', providerRequests: 2, inputTokens: 8, outputTokens: 8 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });
  });

  it('normalizes provider failures, invalid responses, and limits safely', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockRejectedValue(new Error('secret connection details'));
    const client = new OllamaClient('http://ollama.test', 'llama-test', {}, fetchMock);

    const providerError = client.ask({ prompt: 'Hello' });
    await expect(providerError).rejects.toMatchObject({ code: 'LLM_PROVIDER_ERROR' });
    await expect(providerError).rejects.not.toThrow('secret connection details');

    fetchMock.mockResolvedValue(jsonResponse({ message: { content: 'broken' } }));
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
    });

    await expect(client.ask({ prompt: 'Hello', maxTokens: 0 })).rejects.toMatchObject({
      code: 'LLM_INVALID_LIMIT',
    });
    await expect(client.ask({ prompt: 'Hello', maxIterations: 0 })).rejects.toMatchObject({
      code: 'LLM_INVALID_LIMIT',
    });
  });
});
