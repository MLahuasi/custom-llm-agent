import { PRICING } from './pricing.js';
import type {
  LlmUsage,
  LlmUsageCost,
  LlmUsageSummary,
} from './contracts.js';

/** Tracks normalized LLM consumption for the current in-memory session. */
export class LlmUsageTrackerService {
  private readonly usages: LlmUsage[] = [];

  /** Records a defensive copy of one provider execution's usage. */
  public record(usage: LlmUsage): void {
    this.usages.push({ ...usage });
  }

  /** Returns defensive copies of all recorded usage entries. */
  public getAll(): LlmUsage[] {
    return this.usages.map((usage) => ({ ...usage }));
  }

  /** Returns every recorded usage entry with its estimated cost. */
  public getAllWithCost(): LlmUsageCost[] {
    return this.usages.map((usage) => this.calculateCost(usage));
  }

  /** Returns the accumulated session usage and cost. */
  public getSummary(): LlmUsageSummary {
    const usages = this.getAllWithCost();
    let totalCost: number | null = 0;

    const summary = usages.reduce(
      (total, usage) => {
        total.providerRequests += usage.providerRequests;
        total.inputTokens += usage.inputTokens;
        total.outputTokens += usage.outputTokens;

        if (usage.totalCost === null) {
          totalCost = null;
        } else if (totalCost !== null) {
          totalCost += usage.totalCost;
        }

        return total;
      },
      { providerRequests: 0, inputTokens: 0, outputTokens: 0 },
    );

    return { ...summary, totalCost };
  }

  /** Returns usage grouped by provider and model. */
  public getSummaryByModel(): LlmUsageCost[] {
    const grouped = new Map<string, LlmUsage>();

    for (const usage of this.usages) {
      const key = `${usage.provider}:${usage.model}`;
      const current = grouped.get(key);

      if (!current) {
        grouped.set(key, { ...usage });
        continue;
      }

      current.providerRequests += usage.providerRequests;
      current.inputTokens += usage.inputTokens;
      current.outputTokens += usage.outputTokens;
    }

    return [...grouped.values()].map((usage) => this.calculateCost(usage));
  }

  private calculateCost(usage: LlmUsage): LlmUsageCost {
    const pricing = PRICING[usage.model];

    if (!pricing) {
      return {
        ...usage,
        inputCost: null,
        outputCost: null,
        totalCost: null,
      };
    }

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

    return {
      ...usage,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    };
  }
}
