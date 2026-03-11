import { afterEach, describe, expect, it } from "bun:test";

const {
  disposeShellSession,
  executeWorkspaceShellCommand,
  getShellSessionCount,
  streamWorkspaceShellCommand,
} = await import("./shell-session");

const workspaceRoot = process.cwd();

afterEach(async () => {
  await disposeShellSession("thread-shell-test");
  await disposeShellSession("thread-shell-timeout");
  await disposeShellSession("thread-shell-truncation");
  await disposeShellSession("thread-shell-stream");
  await disposeShellSession("thread-shell-tail");
  await disposeShellSession("thread-shell-activity");
});

describe("shell session manager", () => {
  it("persists shell state across commands in the same thread", async () => {
    const first = await executeWorkspaceShellCommand({
      command: 'export SENTINEL_TEST_VALUE="persisted"; printf "$SENTINEL_TEST_VALUE"',
      threadId: "thread-shell-test",
      workspaceRoot,
    });
    const second = await executeWorkspaceShellCommand({
      command: 'printf "$SENTINEL_TEST_VALUE"',
      threadId: "thread-shell-test",
      workspaceRoot,
    });

    expect(first.stdout).toBe("persisted");
    expect(second.stdout).toBe("persisted");
    expect(getShellSessionCount()).toBe(1);
  });

  it("truncates oversized stdout", async () => {
    const result = await executeWorkspaceShellCommand({
      command: 'node -e "process.stdout.write(\'a\'.repeat(70000))"',
      threadId: "thread-shell-truncation",
      workspaceRoot,
    });

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBe(64 * 1024);
  });

  it("resets the session when a command times out", async () => {
    const timedOut = executeWorkspaceShellCommand({
      command: "sleep 2",
      timeoutMs: 100,
      threadId: "thread-shell-timeout",
      workspaceRoot,
    });

    await expect(timedOut).rejects.toThrow(/maximum runtime/i);
    expect(getShellSessionCount()).toBe(0);
  });

  it("allows long-running commands to continue while they keep producing output", async () => {
    const result = await executeWorkspaceShellCommand({
      command:
        'i=0; while [ "$i" -lt 4 ]; do printf "%s\\n" "$i"; i=$((i + 1)); sleep 0.2; done',
      inactivityTimeoutMs: 500,
      timeoutMs: 1_500,
      threadId: "thread-shell-activity",
      workspaceRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0");
    expect(result.stdout).toContain("3");
  });

  it("streams running snapshots before the final completed result", async () => {
    const events = [];

    for await (const event of streamWorkspaceShellCommand({
      command: 'printf "one\\n"; sleep 0.1; printf "two\\n" >&2',
      threadId: "thread-shell-stream",
      workspaceRoot,
    })) {
      events.push(event);
    }

    const finalEvent = events.at(-1);

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.type).toBe("running");
    expect(finalEvent?.type).toBe("completed");
    expect(finalEvent && "output" in finalEvent ? finalEvent.output : null).toMatchObject({
      exitCode: 0,
      phase: "completed",
      stderr: "two",
      stdout: "one",
    });
  });

  it("caps the running preview tail separately from the final output", async () => {
    const runningEvents = [];

    for await (const event of streamWorkspaceShellCommand({
      command: 'node -e "process.stdout.write(\'a\'.repeat(9000)); process.stdout.write(\'\\n\')"',
      threadId: "thread-shell-tail",
      workspaceRoot,
    })) {
      if (event.type === "running") {
        runningEvents.push(event.output);
      }
    }

    expect(runningEvents.length).toBeGreaterThan(0);
    const lastRunning = runningEvents.at(-1);
    expect(lastRunning?.phase).toBe("running");
    expect(Buffer.byteLength(lastRunning?.tail ?? "", "utf8")).toBeLessThanOrEqual(
      8 * 1024,
    );
    expect(lastRunning?.truncated).toBe(true);
  });
});
