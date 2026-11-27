/** Result of applying the application's input guardrails. */
export interface GuardrailResult {
  safe: boolean;
  sanitized: string;
  reason?: string;
}

/** Request limit applied during a time window. */
export interface RateLimiterConfig {
  maxRequest: number;
  windowMs: number;
}

/** Configuration used to sanitize and inspect user input. */
export interface GuardrailsConfig {
  maxInputLength: number;
  rateLimit: RateLimiterConfig;
}
