import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_MODULE = fileURLToPath(new URL("./env.js", import.meta.url));
const VALID_KEY = "ab".repeat(32);
const LEGACY_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// env.js validates at import time, so every case loads it in a fresh process
// with a throwaway HOME (it reads ~/.sentinel/desktop.env).
function loadEnv(variables: Record<string, string>) {
  const home = mkdtempSync(path.join(os.tmpdir(), "sentinel-env-"));
  // Only what env.js needs; the test runner's SKIP_ENV_VALIDATION and
  // NODE_ENV must not leak into the child.
  const childEnv: Record<string, string> = {
    HOME: home,
    PATH: process.env.PATH ?? "",
    USERPROFILE: home,
    ...variables,
  };

  try {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `const { env } = await import(${JSON.stringify(ENV_MODULE)});
console.log(JSON.stringify({ ENCRYPTION_KEY: env.ENCRYPTION_KEY, NODE_ENV: env.NODE_ENV ?? null }));`,
      ],
      {
        encoding: "utf8",
        env: childEnv as NodeJS.ProcessEnv,
      },
    );

    return {
      exitCode: result.status,
      output: `${result.stdout}${result.stderr}`,
      values:
        result.status === 0
          ? (JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as {
              ENCRYPTION_KEY: string;
              NODE_ENV: string | null;
            })
          : null,
    };
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
}

describe("env", () => {
  it("validates a well-formed environment and applies defaults", () => {
    const result = loadEnv({ ENCRYPTION_KEY: VALID_KEY, NODE_ENV: "" });

    expect(result.exitCode).toBe(0);
    expect(result.values).toEqual({
      ENCRYPTION_KEY: VALID_KEY,
      NODE_ENV: "development",
    });
  });

  it("rejects a malformed encryption key", () => {
    const result = loadEnv({ ENCRYPTION_KEY: "not-hex" });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("Invalid environment variables");
    expect(result.output).toContain("ENCRYPTION_KEY must be a hex string");
  });

  it("rejects the legacy encryption key", () => {
    const result = loadEnv({ ENCRYPTION_KEY: LEGACY_KEY });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(
      "ENCRYPTION_KEY must not use the legacy default value.",
    );
  });

  it("skips validation when SKIP_ENV_VALIDATION is set", () => {
    const result = loadEnv({
      ENCRYPTION_KEY: "not-hex",
      SKIP_ENV_VALIDATION: "1",
    });

    expect(result.exitCode).toBe(0);
    expect(result.values).toEqual({
      ENCRYPTION_KEY: "not-hex",
      NODE_ENV: null,
    });
  });
});
