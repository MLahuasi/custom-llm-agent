import type { Message, Tool, ToolCall } from 'ollama';
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from '../../../../application/index.js';
import type { ToolExecutionResult } from '../tool-executor.js';

export interface OllamaMappedMessages {
  messages: Message[];
}

/** Maps neutral history and the current prompt into Ollama chat messages. */
export function mapMessages(
  history: readonly LlmMessage[] = [],
  prompt?: string,
  systemPrompt?: string,
): OllamaMappedMessages {
  const systemMessages: string[] = [];
  const messages: Message[] = [];

  for (const message of history) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }

    messages.push(mapMessage(message));
  }

  if (prompt !== undefined) {
    messages.push({ role: 'user', content: prompt });
  }

  if (systemPrompt !== undefined) {
    systemMessages.push(systemPrompt);
  }

  return {
    messages: systemMessages.length > 0
      ? [{ role: 'system', content: systemMessages.join('\n\n') }, ...messages]
      : messages,
  };
}

export function mapMessage(message: LlmMessage): Message {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      ...(message.toolName !== undefined ? { tool_name: message.toolName } : {}),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

/** Maps a neutral tool definition to Ollama's function tool shape. */
export function mapTool(tool: LlmToolDefinition): Tool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      parameters: tool.inputSchema as Tool['function']['parameters'],
    },
  };
}

/** Maps all neutral tool definitions while preserving declaration order. */
export function mapTools(
  tools: readonly LlmToolDefinition[] = [],
): Tool[] {
  return tools.map(mapTool);
}

/** Maps an Ollama tool call into the neutral tool-call contract. */
export function mapToolCall(call: ToolCall, index: number): LlmToolCall {
  return {
    id: `${call.function.name}-${index}`,
    name: call.function.name,
    arguments: call.function.arguments,
  };
}

/** Maps all tool calls while preserving the provider's order. */
export function mapToolCalls(
  calls: readonly ToolCall[] = [],
): LlmToolCall[] {
  return calls.map(mapToolCall);
}

/** Maps a shared tool execution result to an Ollama tool message. */
export function mapToolResult(result: ToolExecutionResult): Message {
  return {
    role: 'tool',
    content: result.content,
    tool_name: result.name,
  };
}
