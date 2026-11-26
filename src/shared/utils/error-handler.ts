import { AppError } from "./app-error.js";

interface ErrorLog {
  name: string;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

function toErrorLog(error: unknown): ErrorLog {
  if (error instanceof AppError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      code: "UNEXPECTED_ERROR",
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred.",
  };
}

export function handleError(error: unknown): void {
  console.error("Application error:", toErrorLog(error));
}
