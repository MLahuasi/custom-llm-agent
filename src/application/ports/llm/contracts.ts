/** Roles supported by the provider-neutral LLM message contract. */
export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** A message that can be preserved across provider adapters. */
export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
}

/** Provider-neutral JSON Schema for a tool's input. */
export type LlmToolInputSchema = Record<string, unknown>;

/** A tool exposed to an LLM provider. */
export interface LlmToolDefinition {
  name: string;
  description?: string;
  inputSchema: LlmToolInputSchema;
}

/** A tool invocation requested by a provider. */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Executes one provider-neutral tool invocation. */
export interface LlmToolExecutor {
  execute(toolCall: LlmToolCall): Promise<unknown>;
}

/** Normalized token and request counters for an LLM operation. */
export interface LlmUsage {
  providerRequests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Input accepted by every LLM client implementation. */
export interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  history?: readonly LlmMessage[];
  tools?: readonly LlmToolDefinition[];
  toolExecutor?: LlmToolExecutor;
  maxTokens?: number;
  maxIterations?: number;
  maxToolCalls?: number;
  /** Return value is ignored; expression-bodied callbacks may return any value. */
  onChunk?: (chunk: string) => unknown | Promise<unknown>;
}

/** Normalized result returned by every LLM client implementation. */
export interface LlmResponse {
  text: string;
  usage: LlmUsage;
  toolsUsed: string[];
  toolCallCount: number;
}

/** Port implemented by concrete LLM provider adapters. */
export interface LlmClient {
  ask(request: LlmRequest): Promise<LlmResponse>;
  stream(request: LlmRequest): Promise<LlmResponse>;
}

/** Port for provider-neutral text embedding generation. */
export interface EmbeddingClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: readonly string[]): Promise<number[][]>;
}
