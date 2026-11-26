import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../src/shared/utils/app-error.js";
import { handleError } from "../../../src/shared/utils/error-handler.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleError", () => {
  it("logs safe information for an AppError without throwing", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new AppError("Configuration is invalid.", "CONFIGURATION_ERROR", {
      context: { variableName: "TEST_VARIABLE" },
    });

    expect(() => handleError(error)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("Application error:", {
      name: "AppError",
      code: "CONFIGURATION_ERROR",
      message: "Configuration is invalid.",
      context: { variableName: "TEST_VARIABLE" },
    });
  });

  it("normalizes native errors without exposing the original object", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    handleError(new Error("Unexpected failure."));

    expect(consoleError).toHaveBeenCalledWith("Application error:", {
      name: "Error",
      code: "UNEXPECTED_ERROR",
      message: "Unexpected failure.",
    });
  });

  it("handles unknown thrown values and continues execution", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(() => handleError({ secret: "must not be logged" })).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("Application error:", {
      name: "UnknownError",
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred.",
    });
    expect(consoleError.mock.calls[0]?.[1]).not.toHaveProperty(
      "secret",
    );
  });
});
