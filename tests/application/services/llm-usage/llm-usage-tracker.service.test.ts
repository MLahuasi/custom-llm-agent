import { describe, expect, it } from 'vitest';
import { LlmUsageTrackerService } from '../../../../src/application/services/llm-usage/llm-usage-tracker.service.js';

const knownUsage = {
  provider: 'openai',
  model: 'gpt-5-mini',
  providerRequests: 2,
  inputTokens: 1_000_000,
  outputTokens: 500_000,
};

describe('LlmUsageTrackerService', () => {
  it('records and returns defensive copies of session usage', () => {
    const service = new LlmUsageTrackerService();

    service.record(knownUsage);
    const usages = service.getAll();
    usages[0]!.inputTokens = 0;

    expect(service.getAll()).toEqual([knownUsage]);
  });

  it('calculates input, output, and total costs for known models', () => {
    const service = new LlmUsageTrackerService();
    service.record(knownUsage);

    expect(service.getAllWithCost()).toEqual([{
      ...knownUsage,
      inputCost: 0.25,
      outputCost: 1,
      totalCost: 1.25,
    }]);
  });

  it('represents unknown model costs as null and propagates that to summaries', () => {
    const service = new LlmUsageTrackerService();
    service.record(knownUsage);
    service.record({
      provider: 'custom',
      model: 'unknown-model',
      providerRequests: 1,
      inputTokens: 10,
      outputTokens: 20,
    });

    expect(service.getAllWithCost()[1]).toMatchObject({
      inputCost: null,
      outputCost: null,
      totalCost: null,
    });
    expect(service.getSummary()).toEqual({
      providerRequests: 3,
      inputTokens: 1_000_010,
      outputTokens: 500_020,
      totalCost: null,
    });
  });

  it('groups requests and tokens by provider and model', () => {
    const service = new LlmUsageTrackerService();
    service.record(knownUsage);
    service.record({ ...knownUsage, providerRequests: 3, inputTokens: 10, outputTokens: 20 });

    expect(service.getSummaryByModel()).toHaveLength(1);
    expect(service.getSummaryByModel()[0]).toMatchObject({
      ...knownUsage,
      providerRequests: 5,
      inputTokens: 1_000_010,
      outputTokens: 500_020,
      inputCost: 0.2500025,
      outputCost: 1.00004,
    });
    expect(service.getSummaryByModel()[0]?.totalCost).toBeCloseTo(1.2500425);
  });
});
