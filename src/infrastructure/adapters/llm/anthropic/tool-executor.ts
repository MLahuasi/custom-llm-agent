import type {
  LlmToolCall,
  LlmToolDefinition,
  LlmToolExecutor,
} from '../../../../application/index.js';

export interface ToolExecutionResult {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

const SAFE_MESSAGES = {
  duplicate: 'This tool call was already processed.',
  failed: 'The tool could not be executed.',
  invalidArguments: 'The tool arguments are invalid.',
  unavailable: 'The requested tool is not available.',
} as const;

/**
 * Executes valid tool calls concurrently and returns results in call order.
 * Provider adapters can serialize the returned results into their own format.
 */
export async function executeToolCalls(
  calls: readonly LlmToolCall[],
  definitions: readonly LlmToolDefinition[],
  executor?: LlmToolExecutor,
): Promise<ToolExecutionResult[]> {
  const availableTools = new Set(definitions.map((definition) => definition.name));
  const seenCalls = new Set<string>();

  return Promise.all(
    calls.map(async (call): Promise<ToolExecutionResult> => {
      const signature = `${call.name}:${stableSerialize(call.arguments)}`;

      if (seenCalls.has(signature)) {
        return errorResult(call, SAFE_MESSAGES.duplicate);
      }
      seenCalls.add(signature);

      if (!availableTools.has(call.name)) {
        return errorResult(call, SAFE_MESSAGES.unavailable);
      }

      if (!isArgumentsObject(call.arguments)) {
        return errorResult(call, SAFE_MESSAGES.invalidArguments);
      }

      if (executor === undefined) {
        return errorResult(call, SAFE_MESSAGES.failed);
      }

      try {
        const value = await executor.execute(call);
        return {
          id: call.id,
          name: call.name,
          content: serializeResult(value),
          isError: false,
        };
      } catch {
        return errorResult(call, SAFE_MESSAGES.failed);
      }
    }),
  );
}

function errorResult(call: LlmToolCall, content: string): ToolExecutionResult {
  return {
    id: call.id,
    name: call.name,
    content,
    isError: true,
  };
}

function isArgumentsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return '[Unserializable tool result]';
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}
