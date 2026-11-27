import { describe, expect, it } from 'vitest';
import { LlmUsageLimiterService } from '../../../../src/application/services/llm-usage/llm-usage-limiter.service.js';

describe('LlmUsageLimiterService', () => {
  it('records calls and reports availability and retry time', () => {
    let now = 1_000;
    const service = new LlmUsageLimiterService({
      maxRequests: 2,
      windowMs: 500,
      now: () => now,
    });

    service.consume();
    now = 1_100;
    service.consume();

    expect(service.getStats()).toEqual({
      used: 2,
      remaining: 0,
      maxRequests: 2,
      windowMs: 500,
      retryAfterMs: 400,
    });
  });

  it('rejects an exceeded call with the stable application error code', () => {
    const service = new LlmUsageLimiterService({
      maxRequests: 1,
      windowMs: 1_000,
      now: () => 1_000,
    });

    service.consume();

    expect(() => service.consume()).toThrowError(
      expect.objectContaining({ code: 'LLM_USAGE_LIMIT_EXCEEDED' }),
    );
  });

  it('removes expired calls from the active window', () => {
    let now = 1_000;
    const service = new LlmUsageLimiterService({
      maxRequests: 1,
      windowMs: 500,
      now: () => now,
    });

    service.consume();
    now = 1_501;

    expect(service.getStats()).toMatchObject({ used: 0, remaining: 1, retryAfterMs: 0 });
  });
});
