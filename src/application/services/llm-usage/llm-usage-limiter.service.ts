import { AppError } from '../../../shared/index.js';
import type {
  LlmUsageLimitStats,
  LlmUsageLimiterOptions,
} from './contracts.js';

/** Limits LLM provider calls within an in-memory rolling time window. */
export class LlmUsageLimiterService {
  private requestTimestamps: number[] = [];

  public constructor(private readonly options: LlmUsageLimiterOptions) {}

  /** Validates and records a call that is about to reach an LLM provider. */
  public consume(): void {
    const now = this.now();
    this.removeExpiredRequests(now);

    if (this.requestTimestamps.length >= this.options.maxRequests) {
      throw new AppError(
        `LLM usage limit exceeded. Maximum ${this.options.maxRequests} calls every ${this.options.windowMs} ms.`,
        'LLM_USAGE_LIMIT_EXCEEDED',
        {
          context: {
            maxRequests: this.options.maxRequests,
            windowMs: this.options.windowMs,
          },
        },
      );
    }

    this.requestTimestamps.push(now);
  }

  /** Returns the current usage and availability within the active window. */
  public getStats(): LlmUsageLimitStats {
    const now = this.now();
    this.removeExpiredRequests(now);

    const used = this.requestTimestamps.length;
    const remaining = Math.max(this.options.maxRequests - used, 0);
    let retryAfterMs = 0;

    if (remaining === 0 && this.requestTimestamps.length > 0) {
      const oldestRequest = this.requestTimestamps[0];

      if (oldestRequest !== undefined) {
        retryAfterMs = Math.max(
          oldestRequest + this.options.windowMs - now,
          0,
        );
      }
    }

    return {
      used,
      remaining,
      maxRequests: this.options.maxRequests,
      windowMs: this.options.windowMs,
      retryAfterMs,
    };
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private removeExpiredRequests(now: number): void {
    const windowStart = now - this.options.windowMs;

    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > windowStart,
    );
  }
}
