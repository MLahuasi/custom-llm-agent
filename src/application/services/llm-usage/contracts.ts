/** Normalized usage returned by an LLM provider adapter. */
export interface LlmUsage {
  provider: string;
  model: string;
  providerRequests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Configuration for the in-memory LLM request limiter. */
export interface LlmUsageLimiterOptions {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}

/** Current state of the in-memory LLM request limiter. */
export interface LlmUsageLimitStats {
  used: number;
  remaining: number;
  maxRequests: number;
  windowMs: number;
  retryAfterMs: number;
}

/** Cost calculated for one normalized usage record. */
export interface LlmUsageCost {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
}

/** Aggregated usage and cost for the current in-memory session. */
export interface LlmUsageSummary {
  usages: readonly LlmUsageCost[];
  providerRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number | null;
}
