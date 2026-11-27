import { INJECTION_PATTERNS } from './injection-patterns.js';
import type { GuardrailResult, GuardrailsConfig } from './contracts.js';

/** Applies input sanitization and heuristic prompt-injection guardrails. */
export class GuardrailsService {
  private requestTimestamps: number[] = [];

  public constructor(private readonly config: GuardrailsConfig) {}

  /** Sanitizes, inspects, and rate-limits one input. */
  public checkInput(input: string): GuardrailResult {
    const sanitized = this.sanitizeInput(input);
    const injectionCheck = this.detectPromptInjection(sanitized);

    if (injectionCheck.detected) {
      return {
        safe: false,
        sanitized,
        reason:
          'Tu mensaje contiene patrones que intentan modificar el comportamiento del asistente.\n' +
          'Por favor reformula tu pregunta',
      };
    }

    if (!this.checkRateLimit()) {
      return {
        safe: false,
        sanitized,
        reason:
          `Se alcanzó el límite de solicitudes. ` +
          `Intenta nuevamente dentro de ${this.window} segundos.`,
      };
    }

    return { safe: true, sanitized };
  }

  /** Removes unsafe control characters and truncates oversized input. */
  public sanitizeInput(input: string): string {
    let result = input
      .replace(/\0/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

    if (result.length > this.config.maxInputLength) {
      result =
        result.slice(0, this.config.maxInputLength) +
        `\nExcedía el límite — cortado a ${this.config.maxInputLength} chars`;
    }

    return result;
  }

  /** Returns the first heuristic injection pattern found in the input. */
  public detectPromptInjection(input: string): {
    detected: boolean;
    pattern?: string;
  } {
    for (const { name, regex } of INJECTION_PATTERNS) {
      if (regex.test(input)) {
        return { detected: true, pattern: name };
      }
    }

    return { detected: false };
  }

  /** Number of requests still available in the current window. */
  public get remaining(): number {
    this.removeExpiredRequests(Date.now());

    return Math.max(
      0,
      this.config.rateLimit.maxRequest - this.requestTimestamps.length,
    );
  }

  /** Configured rate-limit window in seconds. */
  public get window(): number {
    return Math.ceil(this.config.rateLimit.windowMs / 1000);
  }

  /** Clears only the request limiter state. */
  public resetRateLimit(): void {
    this.requestTimestamps = [];
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    this.removeExpiredRequests(now);

    if (this.requestTimestamps.length >= this.config.rateLimit.maxRequest) {
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  private removeExpiredRequests(now: number): void {
    const windowStart = now - this.config.rateLimit.windowMs;

    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > windowStart,
    );
  }
}
