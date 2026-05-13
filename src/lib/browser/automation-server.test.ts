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
      threadId: "thread-a",
      timeoutMs: 1_000,
      userId,
    });

    const command = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });

    expect(command?.command).toEqual({ type: "tabs" });
    expect(command?.threadId).toBe("thread-a");

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
        threadId: "thread-a",
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
      threadId: "thread-a",
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
        threadId: "thread-a",
      }),
    ).toBe(true);
    await expect(dispatched).rejects.toThrow("No browser tab is open.");

    clearBrowserAutomationStateForTests(userId);
  });

  it("keeps pending commands isolated by thread", async () => {
    const userId = "browser-broker-thread-user";
    clearBrowserAutomationStateForTests(userId);

    const threadA = dispatchBrowserCommand({
      command: { type: "tabs" },
      threadId: "thread-a",
      timeoutMs: 1_000,
      userId,
    });
    const threadB = dispatchBrowserCommand({
      command: { type: "snapshot" },
      threadId: "thread-b",
      timeoutMs: 1_000,
      userId,
    });

    const firstCommand = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });
    const secondCommand = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });

    expect(firstCommand?.threadId).toBe("thread-a");
    expect(secondCommand?.threadId).toBe("thread-b");

    const tabsResult: BrowserAutomationCommandResult = {
      activeTabId: null,
      tabs: [],
      type: "tabs",
    };
    const snapshotResult: BrowserAutomationCommandResult = {
      activeTabId: "browser-tab-1",
      content: "snapshot",
      tab: {
        active: true,
        canGoBack: false,
        canGoForward: false,
        id: "browser-tab-1",
        isLoading: false,
        title: "Example",
        url: "https://example.com",
      },
      title: "Example",
      type: "snapshot",
      url: "https://example.com",
    };

    expect(
      submitBrowserAutomationResult(userId, {
        commandId: secondCommand!.id,
        ok: true,
        result: snapshotResult,
        threadId: "thread-b",
      }),
    ).toBe(true);
    await expect(threadB).resolves.toEqual(snapshotResult);

    expect(
      submitBrowserAutomationResult(userId, {
        commandId: firstCommand!.id,
        ok: true,
        result: tabsResult,
        threadId: "thread-a",
      }),
    ).toBe(true);
    await expect(threadA).resolves.toEqual(tabsResult);

    clearBrowserAutomationStateForTests(userId);
  });

  it("does not resolve a pending command with another thread's result", async () => {
    const userId = "browser-broker-cross-thread-user";
    clearBrowserAutomationStateForTests(userId);

    const dispatched = dispatchBrowserCommand({
      command: { type: "tabs" },
      threadId: "thread-a",
      timeoutMs: 1_000,
      userId,
    });

    const command = await pollBrowserAutomationCommand({
      timeoutMs: 1_000,
      userId,
    });

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
        threadId: "thread-b",
      }),
    ).toBe(false);

    expect(
      submitBrowserAutomationResult(userId, {
        commandId: command!.id,
        ok: true,
        result,
        threadId: "thread-a",
      }),
    ).toBe(true);
    await expect(dispatched).resolves.toEqual(result);

    clearBrowserAutomationStateForTests(userId);
  });
});
