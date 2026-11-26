import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { LlmToolCall } from '../../../../../src/application/index.js';
import { AnthropicClient } from '../../../../../src/infrastructure/adapters/llm/anthropic/client.js';
import { executeToolCalls } from '../../../../../src/infrastructure/adapters/llm/anthropic/tool-executor.js';

function createSdkMock() {
  return {
    messages: {
      create: vi.fn(),
      stream: vi.fn(),
    },
  } as unknown as Anthropic & {
    messages: {
      create: ReturnType<typeof vi.fn>;
      stream: ReturnType<typeof vi.fn>;
    };
  };
}

function response(
  content: unknown[],
  inputTokens = 2,
  outputTokens = 3,
) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

describe('AnthropicClient', () => {
  it('maps history and normalizes a complete response', async () => {
    const sdk = createSdkMock();
    sdk.messages.create.mockResolvedValue(
      response([{ type: 'text', text: ' Hello\nworld ' }], 7, 4),
    );
    const client = new AnthropicClient(sdk, 'claude-test', 512);

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
      usage: { providerRequests: 1, inputTokens: 7, outputTokens: 4 },
      toolsUsed: [],
      toolCallCount: 0,
    });
    expect(sdk.messages.create).toHaveBeenCalledWith({
      model: 'claude-test',
      max_tokens: 512,
      system: 'Historical system\n\nCurrent system',
      messages: [
        { role: 'user', content: 'Previous question' },
        { role: 'user', content: 'Final question' },
      ],
    });
  });

  it('executes tools iteratively and accumulates usage', async () => {
    const sdk = createSdkMock();
    sdk.messages.create
      .mockResolvedValueOnce(
        response([
          { type: 'text', text: 'I will check. ' },
          { type: 'tool_use', id: 'call_1', name: 'weather', input: { city: 'Madrid' } },
        ], 5, 6),
      )
      .mockResolvedValueOnce(response([{ type: 'text', text: 'It is sunny.' }], 8, 2));
    const execute = vi.fn().mockResolvedValue({ temperature: 24 });
    const client = new AnthropicClient(sdk, 'claude-test');

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
    expect(sdk.messages.create.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will check. ' },
          { type: 'tool_use', id: 'call_1', name: 'weather', input: { city: 'Madrid' } },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: '{"temperature":24}',
          },
        ],
      },
    ]);
  });

  it('delivers stream text deltas and returns the final response', async () => {
    const sdk = createSdkMock();
    const listeners = new Map<string, (delta: string) => void>();
    sdk.messages.stream.mockReturnValue({
      on: vi.fn((event: string, listener: (delta: string) => void) => {
        listeners.set(event, listener);
        return undefined;
      }),
      finalMessage: vi.fn(async () => {
        listeners.get('text')?.('Hello');
        listeners.get('text')?.(' world');
        return response([{ type: 'text', text: 'Hello world' }]);
      }),
    });
    const chunks: string[] = [];
    const client = new AnthropicClient(sdk, 'claude-test');

    const result = await client.stream({
      prompt: 'Say hello',
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['Hello', ' world']);
    expect(result.text).toBe('Hello world');
    expect(result.usage.providerRequests).toBe(1);
  });

  it('converts provider failures and empty responses into AppError', async () => {
    const sdk = createSdkMock();
    sdk.messages.create.mockRejectedValue(new Error('secret payload')); 
    const client = new AnthropicClient(sdk, 'claude-test');

    const providerError = client.ask({ prompt: 'Hello' });
    await expect(providerError).rejects.toMatchObject({ code: 'LLM_PROVIDER_ERROR' });
    await expect(providerError).rejects.not.toThrow('secret payload');

    sdk.messages.create.mockResolvedValue(response([]));
    await expect(client.ask({ prompt: 'Hello' })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
    });
  });

  it('applies the iteration and tool call limits', async () => {
    const sdk = createSdkMock();
    sdk.messages.create.mockResolvedValue(
      response([{ type: 'tool_use', id: 'call_1', name: 'tool', input: {} }]),
    );
    const client = new AnthropicClient(sdk, 'claude-test');

    await expect(
      client.ask({
        prompt: 'Loop',
        tools: [{ name: 'tool', inputSchema: { type: 'object' } }],
        maxIterations: 1,
        maxToolCalls: 10,
      }),
    ).rejects.toMatchObject({ code: 'LLM_MAX_ITERATIONS_EXCEEDED' });

    await expect(
      client.ask({
        prompt: 'Too many',
        tools: [{ name: 'tool', inputSchema: { type: 'object' } }],
        maxIterations: 2,
        maxToolCalls: 0,
      }),
    ).rejects.toMatchObject({ code: 'LLM_INVALID_LIMIT' });
  });
});

describe('executeToolCalls', () => {
  it('runs calls in parallel, preserves order, and returns safe failures', async () => {
    const started: string[] = [];
    const execute = vi.fn(async (call: LlmToolCall) => {
      started.push(call.name);
      return call.name === 'first' ? 'one' : 'two';
    });

    const results = await executeToolCalls(
      [
        { id: '1', name: 'first', arguments: {} },
        { id: '2', name: 'second', arguments: {} },
        { id: '3', name: 'unknown', arguments: {} },
        { id: '4', name: 'first', arguments: {} },
      ],
      [
        { name: 'first', inputSchema: { type: 'object' } },
        { name: 'second', inputSchema: { type: 'object' } },
      ],
      { execute },
    );

    expect(started).toEqual(['first', 'second']);
    expect(results.map((result) => result.content)).toEqual([
      'one',
      'two',
      'The requested tool is not available.',
      'This tool call was already processed.',
    ]);
    expect(results[2].isError).toBe(true);
    expect(results[3].isError).toBe(true);
  });
});
