import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../../src/shared/utils/app-error.js";
import {
  loadEnvironment,
  optionalEnv,
  requiredEnv,
} from "../../../src/shared/utils/environment.js";

const environmentVariablesToClean: string[] = [];

function setEnvironmentVariable(name: string, value: string): void {
  process.env[name] = value;
  environmentVariablesToClean.push(name);
}

afterEach(() => {
  for (const name of environmentVariablesToClean.splice(0)) {
    delete process.env[name];
  }
});

describe("environment utilities", () => {
  it("loads variables from a file without overriding existing values", () => {
    const directory = mkdtempSync(join(tmpdir(), "custom-llm-agent-"));
    const environmentFile = join(directory, ".env.test");
    const existingVariable = "TEST_EXISTING_ENVIRONMENT_VARIABLE";
    const loadedVariable = "TEST_LOADED_ENVIRONMENT_VARIABLE";

    setEnvironmentVariable(existingVariable, "system-value");
    writeFileSync(
      environmentFile,
      `${existingVariable}=file-value\n${loadedVariable}=loaded-value\n`,
    );

    try {
      loadEnvironment(environmentFile);

      expect(optionalEnv(existingVariable)).toBe("system-value");
      expect(optionalEnv(loadedVariable)).toBe("loaded-value");
      environmentVariablesToClean.push(loadedVariable);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("returns undefined for an absent or blank optional variable", () => {
    const absentVariable = "TEST_ABSENT_ENVIRONMENT_VARIABLE";
    const blankVariable = "TEST_BLANK_ENVIRONMENT_VARIABLE";

    setEnvironmentVariable(blankVariable, "   ");

    expect(optionalEnv(absentVariable)).toBeUndefined();
    expect(optionalEnv(blankVariable)).toBeUndefined();
  });

  it("returns a trimmed value for a required variable", () => {
    const variable = "TEST_REQUIRED_ENVIRONMENT_VARIABLE";
    setEnvironmentVariable(variable, "  configured-value  ");

    expect(requiredEnv(variable)).toBe("configured-value");
  });

  it("throws AppError when a required variable is absent", () => {
    const variable = "TEST_MISSING_ENVIRONMENT_VARIABLE";

    expect(() => requiredEnv(variable)).toThrow(AppError);

    try {
      requiredEnv(variable);
    } catch (error) {
      expect(error).toMatchObject({
        code: "ENVIRONMENT_VARIABLE_MISSING",
        context: { variableName: variable },
      });
    }
  });
});
