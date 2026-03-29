import { describe, expect, it } from "bun:test";

import {
  getCodexRuntimeBadgeColor,
  getCodexRuntimeBadgeLabel,
  getCodexRuntimeCliLabel,
  getCodexRuntimeFallbackMessage,
  getClaudeRuntimeBadgeColor,
  getClaudeRuntimeBadgeLabel,
  getClaudeRuntimeBinaryLabel,
  getClaudeRuntimeFallbackMessage,
} from "./runtime-status";

describe("Claude runtime settings helpers", () => {
  it("renders a degraded badge when cached Claude models are active", () => {
    const status = {
      state: "timeout_using_cache",
      usedCachedStatus: true,
    };

    expect(getClaudeRuntimeBadgeLabel(status, true)).toBe("Degraded");
    expect(getClaudeRuntimeBadgeColor(status, true)).toBe("warning");
  });

  it("renders a degraded badge for transient binary-detected timeouts without cache", () => {
    const status = {
      binaryDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    };

    expect(getClaudeRuntimeBadgeLabel(status, true)).toBe("Degraded");
    expect(getClaudeRuntimeBadgeColor(status, true)).toBe("warning");
  });

  it("formats the cached timeout message with the last successful probe time", () => {
    const message = getClaudeRuntimeFallbackMessage(
      {
        lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
        state: "timeout_using_cache",
        usedCachedStatus: true,
      },
      () => "Mar 29, 2026, 10:00 AM",
    );

    expect(message).toBe(
      "Live Claude probe timed out; using cached models from Mar 29, 2026, 10:00 AM.",
    );
  });

  it("formats the fallback timeout message when no cached models exist yet", () => {
    const message = getClaudeRuntimeFallbackMessage({
      state: "timeout_no_cache",
      usedCachedStatus: true,
    });

    expect(message).toBe(
      "Live Claude probe timed out; using fallback Claude models.",
    );
  });

  it("shows the verified binary version when Claude is detected", () => {
    expect(
      getClaudeRuntimeBinaryLabel({
        binaryDetected: true,
        binaryVersion: "2.1.39 (Claude Code)",
      }),
    ).toBe("2.1.39 (Claude Code)");
    expect(getClaudeRuntimeBinaryLabel({ binaryDetected: false })).toBe(
      "Not detected",
    );
  });
});

describe("Codex runtime settings helpers", () => {
  it("renders a degraded badge when cached Codex models are active", () => {
    const status = {
      state: "timeout_using_cache",
      usedCachedStatus: true,
    };

    expect(getCodexRuntimeBadgeLabel(status, true)).toBe("Degraded");
    expect(getCodexRuntimeBadgeColor(status, true)).toBe("warning");
  });

  it("renders a degraded badge for transient CLI-detected timeouts without cache", () => {
    const status = {
      cliDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    };

    expect(getCodexRuntimeBadgeLabel(status, true)).toBe("Degraded");
    expect(getCodexRuntimeBadgeColor(status, true)).toBe("warning");
  });

  it("formats the cached timeout message with the last successful probe time", () => {
    const message = getCodexRuntimeFallbackMessage(
      {
        lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
        state: "timeout_using_cache",
        usedCachedStatus: true,
      },
      () => "Mar 29, 2026, 10:00 AM",
    );

    expect(message).toBe(
      "Live Codex probe timed out; using cached models from Mar 29, 2026, 10:00 AM.",
    );
  });

  it("formats the fallback timeout message when no cached models exist yet", () => {
    const message = getCodexRuntimeFallbackMessage({
      state: "timeout_no_cache",
      usedCachedStatus: false,
    });

    expect(message).toBe(
      "Live Codex probe timed out; using fallback Codex models.",
    );
  });

  it("shows the verified CLI version when Codex is detected", () => {
    expect(
      getCodexRuntimeCliLabel({
        cliDetected: true,
        cliVersion: "codex-cli 0.98.0",
      }),
    ).toBe("codex-cli 0.98.0");
    expect(getCodexRuntimeCliLabel({ cliDetected: false })).toBe(
      "Not detected",
    );
  });
});
