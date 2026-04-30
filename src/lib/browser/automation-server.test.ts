import { describe, expect, it, mock } from "bun:test";

import type { BrowserAutomationCommandResult } from "./automation-types";

mock.module("server-only", () => ({}));

const {
  clearBrowserAutomationStateForTests,
  dispatchBrowserCommand,
  pollBrowserAutomationCommand,
  submitBrowserAutomationResult,
} = await import("./automation-server");

describe("browser automation server broker", () => {
  it("dispatches commands to a polling browser client and resolves results", async () => {
    const userId = "browser-broker-user";
    clearBrowserAutomationStateForTests(userId);

    const dispatched = dispatchBrowserCommand({
      command: { type: "tabs" },
      timeoutMs: 1_000,
      userId,
    });

    const command = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });

    expect(command?.command).toEqual({ type: "tabs" });

    const result: BrowserAutomationCommandResult = {
      activeTabId: null,
      tabs: [],
      type: "tabs",
    };

    expect(
      submitBrowserAutomationResult(userId, {
        commandId: command!.id,
        ok: true,
        result,
      }),
    ).toBe(true);
    await expect(dispatched).resolves.toEqual(result);

    clearBrowserAutomationStateForTests(userId);
  });

  it("rejects pending dispatches when the browser returns an error", async () => {
    const userId = "browser-broker-error-user";
    clearBrowserAutomationStateForTests(userId);

    const dispatched = dispatchBrowserCommand({
      command: { type: "snapshot" },
      timeoutMs: 1_000,
      userId,
    });
    const command = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });

    expect(command?.command).toEqual({ type: "snapshot" });
    expect(
      submitBrowserAutomationResult(userId, {
        commandId: command!.id,
        error: "No browser tab is open.",
        ok: false,
      }),
    ).toBe(true);
    await expect(dispatched).rejects.toThrow("No browser tab is open.");

    clearBrowserAutomationStateForTests(userId);
  });
});
