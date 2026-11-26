import dotenv from "dotenv";
import { AppError } from "./app-error.js";

export const ENVIRONMENT_VARIABLES = {
  anthropicApiKey: "ANTHROPIC_API_KEY",
  geminiApiKey: "GEMINI_API_KEY",
  openAiApiKey: "OPENAI_API_KEY",
  groqApiKey: "GROQ_API_KEY",
  ollamaBaseUrl: "OLLAMA_BASE_URL",
  ollamaApiKey: "OLLAMA_API_KEY",
  context7ApiKey: "CONTEXT7_API_KEY",
  llmMaxIterations: "LLM_MAX_ITERATIONS",
  llmMaxToolCalls: "LLM_MAX_TOOL_CALLS",
} as const;

export type EnvironmentVariableName = string;

export function loadEnvironment(path = ".env"): void {
  dotenv.config({
    path,
    override: false,
    quiet: true,
  });
}

export function optionalEnv(name: EnvironmentVariableName): string | undefined {
  const value = process.env[name]?.trim();

  return value || undefined;
}

export function requiredEnv(name: EnvironmentVariableName): string {
  const value = optionalEnv(name);

  if (!value) {
    throw new AppError(
      `Required environment variable is missing: ${name}`,
      "ENVIRONMENT_VARIABLE_MISSING",
      { context: { variableName: name } },
    );
  }

  return value;
}
