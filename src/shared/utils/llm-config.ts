import { AppError } from './app-error.js';
import { ENVIRONMENT_VARIABLES, optionalEnv } from './environment.js';

export const DEFAULT_LLM_MAX_ITERATIONS = 8;
export const DEFAULT_LLM_MAX_TOOL_CALLS = 32;

export interface LlmDefaults {
  maxIterations: number;
  maxToolCalls: number;
}

/** Returns shared LLM defaults, allowing environment overrides for all adapters. */
export function getLlmDefaults(): LlmDefaults {
  return {
    maxIterations: readPositiveInteger(
      ENVIRONMENT_VARIABLES.llmMaxIterations,
      DEFAULT_LLM_MAX_ITERATIONS,
    ),
    maxToolCalls: readPositiveInteger(
      ENVIRONMENT_VARIABLES.llmMaxToolCalls,
      DEFAULT_LLM_MAX_TOOL_CALLS,
    ),
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = optionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`The ${name} environment variable is invalid.`, 'LLM_INVALID_LIMIT', {
      context: { variableName: name },
    });
  }

  return parsed;
}
