import type {
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages.js';
import type {
  LlmMessage,
  LlmToolDefinition,
} from '../../../../application/index.js';

export interface AnthropicMappedMessages {
  system?: string;
  messages: MessageParam[];
}

/**
 * Maps the neutral history into the Messages API shape.
 * System messages are returned separately because Anthropic accepts them in the
 * top-level `system` parameter.
 */
export function mapMessages(
  history: readonly LlmMessage[] = [],
  prompt?: string,
  systemPrompt?: string,
): AnthropicMappedMessages {
  const systemMessages: string[] = [];
  const messages: MessageParam[] = [];

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
    ...(systemMessages.length > 0 ? { system: systemMessages.join('\n\n') } : {}),
    messages,
  };
}

export function mapMessage(message: LlmMessage): MessageParam {
  if (message.role === 'tool' && message.toolCallId !== undefined) {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: message.content,
        },
      ],
    };
  }

  if (message.role === 'tool') {
    return { role: 'user', content: message.content };
  }

  return {
    role: message.role as 'user' | 'assistant',
    content: message.content,
  };
}

/** Maps a neutral tool definition to Anthropic's Messages API tool shape. */
export function mapTool(tool: LlmToolDefinition): Tool {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    input_schema: tool.inputSchema as Tool['input_schema'],
  };
}

/** Maps all neutral tool definitions while preserving their declaration order. */
export function mapTools(tools: readonly LlmToolDefinition[] = []): Tool[] {
  return tools.map(mapTool);
}
