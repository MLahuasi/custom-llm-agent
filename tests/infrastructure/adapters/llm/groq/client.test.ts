import type Groq from 'groq-sdk';
import { describe, expect, it, vi } from 'vitest';
import { GroqClient } from '../../../../../src/infrastructure/adapters/llm/groq/client.js';

function createSdkMock() {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  } as unknown as Groq & {
    chat: {
      completions: {
        create: ReturnType<typeof vi.fn>;
      };
    };
  };
}

function response(
  content: string | null,
  toolCalls: unknown[] = [],
  inputTokens = 2,
  outputTokens = 3,
) {
  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
    },
  };
}

function toolCall(
  id: string,
  name: string,
  argumentsValue: string,
) {
  return {
    id,
    type: 'function',
    function: { name, arguments: argumentsValue },
  };
}

async function* streamChunks(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('GroqClient', () => {
  it('maps prompt, history, system prompt, tools, and normalizes chat responses', async () => {
    const sdk = createSdkMock();
    sdk.chat.completions.create.mockResolvedValue(response(' Hello\nworld ', [], 7, 4));
    const client = new GroqClient(sdk, 'llama-test', 512);

    const result = await client.ask({
      prompt: 'Current question',
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
      usage: { providerRequests: 1, inputTokens: 7, outputTokens: 4 },
      toolsUsed: [],
      toolCallCount: 0,
    });
    expect(sdk.chat.completions.create).toHaveBeenCalledWith({
      model: 'llama-test',
      messages: [
        { role: 'system', content: 'Historical system\n\nCurrent system' },
        { role: 'user', content: 'Previous question' },
        { role: 'user', content: 'Current question' },
      ],
      max_tokens: 512,
      tools: [{
        type: 'function',
        function: {
          name: 'weather',
          description: 'Read weather',
          parameters: { type: 'object' },
        },
      }],
    });
  });

  it('continues non-streaming tool calls with assistant and tool messages', async () => {
    const sdk = createSdkMock();
    sdk.chat.completions.create
      .mockResolvedValueOnce(response(
        'I will check.',
        [toolCall('call_1', 'weather', '{"city":"Madrid"}')],
        5,
        6,
      ))
      .mockResolvedValueOnce(response('It is sunny.', [], 8, 2));
    const execute = vi.fn().mockResolvedValue({ temperature: 24 });
    const client = new GroqClient(sdk, 'llama-test');

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
      usage: { providerRequests: 2, inputTokens: 13, outputTokens: 8 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });
    expect(sdk.chat.completions.create.mock.calls[1][0].messages.at(-2)).toEqual({
      role: 'assistant',
      content: 'I will check.',
      tool_calls: [toolCall('call_1', 'weather', '{"city":"Madrid"}')],
    });
    expect(sdk.chat.completions.create.mock.calls[1][0].messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"temperature":24}',
    });
  });

  it('delivers streamed deltas and reconstructs fragmented tool arguments', async () => {
    const sdk = createSdkMock();
    sdk.chat.completions.create
      .mockResolvedValueOnce(streamChunks([
        { choices: [{ delta: { content: 'I will check.' }, finish_reason: null }] },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                function: { name: 'weather', arguments: '{"city":' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '"Madrid"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 5, completion_tokens: 6 },
        },
      ]))
      .mockResolvedValueOnce(streamChunks([
        {
          choices: [{ delta: { content: 'It is sunny.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 8, completion_tokens: 2 },
        },
      ]));
    const execute = vi.fn().mockResolvedValue('24 degrees');
    const chunks: string[] = [];
    const client = new GroqClient(sdk, 'llama-test');

    const result = await client.stream({
      prompt: 'Weather?',
      tools: [{ name: 'weather', inputSchema: { type: 'object' } }],
      toolExecutor: { execute },
      onChunk: (chunk) => chunks.push(chunk),
      maxIterations: 2,
      maxToolCalls: 1,
    });

    expect(chunks).toEqual(['I will check.', 'It is sunny.']);
    expect(execute).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'weather',
      arguments: { city: 'Madrid' },
    });
    expect(result).toEqual({
      text: 'I will check. It is sunny.',
      usage: { providerRequests: 2, inputTokens: 13, outputTokens: 8 },
      toolsUsed: ['weather'],
      toolCallCount: 1,
    });
    expect(sdk.chat.completions.create.mock.calls[1][0].messages.at(-2)).toMatchObject({
      role: 'assistant',
      tool_calls: [toolCall('call_1', 'weather', '{"city":"Madrid"}')],
    });
  });

  it('normalizes provider failures, empty responses, invalid usage, and limits', async () => {
    const sdk = createSdkMock();
    const client = new GroqClient(sdk, 'llama-test');

    sdk.chat.completions.create.mockRejectedValue(new Error('secret payload'));
    const providerError = client.ask({ prompt: 'Hello' });
    await expect(providerError).rejects.toMatchObject({ code: 'LLM_PROVIDER_ERROR' });
    await expect(providerError).rejects.not.toThrow('secret payload');

    sdk.chat.completions.create.mockResolvedValue(response(''));
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
    });

    sdk.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'Hello' } }],
      usage: { prompt_tokens: -1, completion_tokens: 1 },
    });
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_INVALID_RESPONSE',
    });

    sdk.chat.completions.create.mockResolvedValue(response(null, [
      toolCall('call_1', 'one', '{}'),
      toolCall('call_2', 'two', '{}'),
    ]));
    await expect(client.ask({
      prompt: 'Too many',
      tools: [
        { name: 'one', inputSchema: { type: 'object' } },
        { name: 'two', inputSchema: { type: 'object' } },
      ],
      maxToolCalls: 1,
    })).rejects.toMatchObject({ code: 'LLM_MAX_TOOL_CALLS_EXCEEDED' });

    await expect(client.ask({
      prompt: 'Invalid limit',
      maxIterations: 0,
    })).rejects.toMatchObject({ code: 'LLM_INVALID_LIMIT' });
  });
});
