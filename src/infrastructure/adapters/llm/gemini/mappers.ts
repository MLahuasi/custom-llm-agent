import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  Part,
} from '@google/genai';
import type {
  LlmMessage,
  LlmToolCall,
  LlmToolDefinition,
} from '../../../../application/index.js';
import { AppError } from '../../../../shared/index.js';
import type { ToolExecutionResult } from '../tool-executor.js';

export interface GeminiMappedMessages {
  contents: Content[];
  systemInstruction?: Content;
}

/** Maps neutral history and the current prompt into Gemini contents. */
export function mapMessages(
  history: readonly LlmMessage[] = [],
  prompt?: string,
  systemPrompt?: string,
): GeminiMappedMessages {
  const contents: Content[] = [];
  const systemParts: string[] = [];

  for (const message of history) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }

    contents.push(mapMessage(message));
  }

  if (prompt !== undefined) {
    contents.push({ role: 'user', parts: [{ text: prompt }] });
  }

  if (systemPrompt !== undefined) {
    systemParts.push(systemPrompt);
  }

  return {
    contents,
    ...(systemParts.length > 0
      ? { systemInstruction: { role: 'user', parts: [{ text: systemParts.join('\n\n') }] } }
      : {}),
  };
}

export function mapMessage(message: LlmMessage): Content {
  if (message.role === 'tool' && message.toolCallId !== undefined && message.toolName !== undefined) {
    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: message.toolCallId,
            name: message.toolName,
            response: { output: message.content },
          },
        },
      ],
    };
  }

  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  };
}

/** Maps a neutral tool definition to Gemini's function declaration shape. */
export function mapTool(tool: LlmToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    parametersJsonSchema: tool.inputSchema,
  };
}

/** Maps all neutral tool definitions while preserving their declaration order. */
export function mapTools(
  tools: readonly LlmToolDefinition[] = [],
): FunctionDeclaration[] {
  return tools.map(mapTool);
}

/** Maps Gemini function calls into the neutral tool-call contract. */
export function mapToolCalls(calls: readonly FunctionCall[] = []): LlmToolCall[] {
  return calls.map((call, index) => {
    if (call.name === undefined || call.name.length === 0) {
      throw new AppError(
        'The LLM provider returned a function call without a name.',
        'LLM_INVALID_RESPONSE',
      );
    }

    return {
      id: call.id ?? `${call.name}-${index}`,
      name: call.name,
      arguments: call.args ?? {},
    };
  });
}

/** Maps a shared tool execution result to a Gemini function response part. */
export function mapToolResult(result: ToolExecutionResult): Part {
  return {
    functionResponse: {
      id: result.id,
      name: result.name,
      response: { output: result.content },
    },
  };
}
