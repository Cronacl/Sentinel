import { describe, expect, it, mock } from "bun:test";
import path from "node:path";

mock.module("server-only", () => ({}));
mock.module("@github/copilot-sdk", () => ({
  CopilotClient: class {},
}));

const {
  buildCopilotThreadState,
  normalizeCopilotErrorMessage,
  resetCopilotRuntimeCache,
  resolveCopilotRuntime,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./copilot-sdk.ts?copilot-sdk-test");

describe("normalizeCopilotErrorMessage", () => {
  it("returns an actionable Node.js version error for unsupported runtimes", () => {
    expect(
      normalizeCopilotErrorMessage(
        new Error("GitHub Copilot CLI requires Node.js v24 or newer."),
      ),
    ).toContain("newer Node.js runtime");
  });

  it("returns an actionable Node.js version error for missing node:sqlite support", () => {
    expect(
      normalizeCopilotErrorMessage(
        new Error(
          "Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite",
        ),
      ),
    ).toContain("newer Node.js runtime");
  });
});

describe("resolveCopilotRuntime", () => {
  it("detects the bundled Copilot CLI runtime entry", async () => {
    const previousStatePath = process.env.SENTINEL_STATE_PATH;
    process.env.SENTINEL_STATE_PATH = path.join(
      process.cwd(),
      ".tmp",
      "copilot-sdk-test-state.json",
    );
    resetCopilotRuntimeCache();

    try {
      const runtime = await resolveCopilotRuntime();

      expect(runtime.cliDetected).toBe(true);
      expect(typeof runtime.cliPath).toBe("string");
      expect(runtime.cliPath).toContain("copilot");
    } finally {
      if (previousStatePath === undefined) {
        delete process.env.SENTINEL_STATE_PATH;
      } else {
        process.env.SENTINEL_STATE_PATH = previousStatePath;
      }
      resetCopilotRuntimeCache();
    }
  });
});

describe("buildCopilotThreadState", () => {
  it("preserves the normalized reasoning effort stored for Copilot threads", () => {
    expect(
      buildCopilotThreadState({
        cwd: "/workspace",
        modelId: "gpt-5",
        reasoningEffort: "low",
        sessionId: "session-1",
      }),
    ).toEqual({
      cwd: "/workspace",
      modelId: "gpt-5",
      reasoningEffort: "low",
      sessionId: "session-1",
    });
  });
});
