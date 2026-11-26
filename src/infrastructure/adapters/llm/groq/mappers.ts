import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'groq-sdk/resources/chat/completions.js';
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from '../../../../application/index.js';
import { AppError } from '../../../../shared/index.js';
import type { ToolExecutionResult } from '../tool-executor.js';

export interface GroqMappedMessages {
  messages: ChatCompletionMessageParam[];
}

/** Maps neutral history and the current prompt into Chat Completions messages. */
export function mapMessages(
  history: readonly LlmMessage[] = [],
  prompt?: string,
): GroqMappedMessages {
  const messages = history.map(mapMessage);

  if (prompt !== undefined) {
    messages.push({ role: 'user', content: prompt });
  }

  return { messages };
}

export function mapMessage(message: LlmMessage): ChatCompletionMessageParam {
  if (message.role === 'tool' && message.toolCallId !== undefined) {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === 'tool') {
    return { role: 'user', content: message.content };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

/** Maps a neutral tool definition to Groq's Chat Completions tool shape. */
export function mapTool(tool: LlmToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      parameters: tool.inputSchema,
    },
  };
}

/** Maps all neutral tool definitions while preserving declaration order. */
export function mapTools(
  tools: readonly LlmToolDefinition[] = [],
): ChatCompletionTool[] {
  return tools.map(mapTool);
}

/** Maps a Groq function call into the neutral tool-call contract. */
export function mapToolCall(call: ChatCompletionMessageToolCall): LlmToolCall {
  return {
    id: call.id,
    name: call.function.name,
    arguments: parseArguments(call.function.arguments),
  };
}

/** Maps all function calls while preserving the provider's order. */
export function mapToolCalls(
  calls: readonly ChatCompletionMessageToolCall[] = [],
): LlmToolCall[] {
  return calls.map(mapToolCall);
}

/** Maps a shared tool execution result to a Groq tool message. */
export function mapToolResult(
  result: ToolExecutionResult,
): ChatCompletionToolMessageParam {
  return {
    role: 'tool',
    tool_call_id: result.id,
    content: result.content,
  };
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Normalize malformed provider arguments below.
  }

  throw new AppError(
    'The LLM provider returned invalid tool arguments.',
    'LLM_INVALID_RESPONSE',
  );
}
