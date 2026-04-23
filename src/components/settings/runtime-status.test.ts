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
  getCopilotRuntimeBadgeColor,
  getCopilotRuntimeBadgeLabel,
  getCopilotRuntimeCliLabel,
  getCopilotRuntimeFallbackMessage,
} from "./runtime-status";

describe("Claude runtime settings helpers", () => {
  it("renders a ready badge when cached Claude models are active", () => {
    const status = {
      state: "timeout_using_cache",
      usedCachedStatus: true,
    };

    expect(getClaudeRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getClaudeRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("renders a ready badge for transient binary-detected timeouts without cache", () => {
    const status = {
      binaryDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    };

    expect(getClaudeRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getClaudeRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("suppresses cached timeout messaging for usable Claude states", () => {
    const message = getClaudeRuntimeFallbackMessage(
      {
        lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
        state: "timeout_using_cache",
        usedCachedStatus: true,
      },
      () => "Mar 29, 2026, 10:00 AM",
    );

    expect(message).toBeNull();
  });

  it("suppresses fallback timeout messaging when Claude remains usable", () => {
    const message = getClaudeRuntimeFallbackMessage({
      state: "timeout_no_cache",
      usedCachedStatus: true,
    });

    expect(message).toBeNull();
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
    expect(
      getClaudeRuntimeBinaryLabel({
        binaryDetected: false,
        binaryPath: "/usr/local/bin/claude",
      }),
    ).toBe("Path retained");
  });
});

describe("Codex runtime settings helpers", () => {
  it("renders a ready badge when cached Codex models are active", () => {
    const status = {
      state: "timeout_using_cache",
      usedCachedStatus: true,
    };

    expect(getCodexRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getCodexRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("renders a ready badge for transient CLI-detected timeouts without cache", () => {
    const status = {
      cliDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    };

    expect(getCodexRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getCodexRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("suppresses cached timeout messaging for usable Codex states", () => {
    const message = getCodexRuntimeFallbackMessage(
      {
        lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
        state: "timeout_using_cache",
        usedCachedStatus: true,
      },
      () => "Mar 29, 2026, 10:00 AM",
    );

    expect(message).toBeNull();
  });

  it("suppresses fallback timeout messaging when Codex remains usable", () => {
    const message = getCodexRuntimeFallbackMessage({
      state: "timeout_no_cache",
      usedCachedStatus: false,
    });

    expect(message).toBeNull();
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
    expect(
      getCodexRuntimeCliLabel({
        cliDetected: false,
        cliPath: "/usr/local/bin/codex",
      }),
    ).toBe("Path retained");
  });
});

describe("Copilot runtime settings helpers", () => {
  it("renders a ready badge when cached Copilot models are active", () => {
    const status = {
      state: "timeout_using_cache",
      usedCachedStatus: true,
    };

    expect(getCopilotRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getCopilotRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("renders a ready badge for transient CLI-detected timeouts without cache", () => {
    const status = {
      cliDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    };

    expect(getCopilotRuntimeBadgeLabel(status, true)).toBe("Ready");
    expect(getCopilotRuntimeBadgeColor(status, true)).toBe("success");
  });

  it("suppresses fallback timeout messaging when Copilot remains usable", () => {
    const message = getCopilotRuntimeFallbackMessage({
      state: "timeout_no_cache",
      usedCachedStatus: false,
    });

    expect(message).toBeNull();
  });

  it("shows the verified CLI version when Copilot is detected", () => {
    expect(
      getCopilotRuntimeCliLabel({
        cliDetected: true,
        cliVersion: "copilot 1.0.24",
      }),
    ).toBe("copilot 1.0.24");
    expect(getCopilotRuntimeCliLabel({ cliDetected: false })).toBe(
      "Not detected",
    );
    expect(
      getCopilotRuntimeCliLabel({
        cliDetected: false,
        cliPath: "/usr/local/bin/copilot",
      }),
    ).toBe("Path retained");
  });
});
