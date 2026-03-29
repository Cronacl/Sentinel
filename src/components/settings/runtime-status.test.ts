import { describe, expect, it } from "bun:test";

import {
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
