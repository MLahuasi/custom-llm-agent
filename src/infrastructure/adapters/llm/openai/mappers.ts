import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
} from 'openai/resources/responses/responses.js';
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from '../../../../application/index.js';
import type { ToolExecutionResult } from '../tool-executor.js';

export interface OpenAiMappedMessages {
  input: ResponseInput;
  instructions?: string;
}

/** Maps neutral history and the current prompt into Responses API input items. */
export function mapMessages(
  history: readonly LlmMessage[] = [],
  prompt?: string,
  systemPrompt?: string,
): OpenAiMappedMessages {
  const systemMessages: string[] = [];
  const input: ResponseInput = [];

  for (const message of history) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }

    input.push(mapMessage(message));
  }

  if (prompt !== undefined) {
    input.push({ role: 'user', content: prompt });
  }

  if (systemPrompt !== undefined) {
    systemMessages.push(systemPrompt);
  }

  return {
    input,
    ...(systemMessages.length > 0
      ? { instructions: systemMessages.join('\n\n') }
      : {}),
  };
}

export function mapMessage(message: LlmMessage): ResponseInputItem {
  if (message.role === 'tool' && message.toolCallId !== undefined) {
    return {
      type: 'function_call_output',
      call_id: message.toolCallId,
      output: message.content,
    };
  }

  return {
    role: message.role === 'tool' ? 'user' : message.role,
    content: message.content,
  };
}

/** Maps a neutral tool definition to an OpenAI Responses function tool. */
export function mapTool(tool: LlmToolDefinition): FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description ?? null,
    parameters: tool.inputSchema,
    strict: null,
  };
}

/** Maps all neutral tool definitions while preserving their declaration order. */
export function mapTools(
  tools: readonly LlmToolDefinition[] = [],
): FunctionTool[] {
  return tools.map(mapTool);
}

/** Maps an OpenAI function call into the neutral tool-call contract. */
export function mapToolCall(call: ResponseFunctionToolCall): LlmToolCall {
  return {
    id: call.call_id,
    name: call.name,
    arguments: parseArguments(call.arguments),
  };
}

/** Maps a shared tool execution result to a Responses API function output. */
export function mapToolResult(
  result: ToolExecutionResult,
): ResponseInputItem.FunctionCallOutput {
  return {
    type: 'function_call_output',
    call_id: result.id,
    output: result.content,
  };
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
