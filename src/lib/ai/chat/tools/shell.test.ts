// @ts-nocheck

import { afterEach, describe, expect, it } from "bun:test";

const {
  assertShellCommandAllowed,
  disposeShellSession,
  executeShellCommand,
  getShellSessionCount,
  streamShellCommand,
} = await import("./shell-session.ts");

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
    const first = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command: 'export SENTINEL_TEST_VALUE="persisted"; printf "$SENTINEL_TEST_VALUE"',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-test",
    });
    const second = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command: 'printf "$SENTINEL_TEST_VALUE"',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-test",
    });

    expect(first.stdout).toBe("persisted");
    expect(second.stdout).toBe("persisted");
    expect(getShellSessionCount()).toBe(1);
  });

  it("truncates oversized stdout", async () => {
    const result = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command: 'node -e "process.stdout.write(\'a\'.repeat(70000))"',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-truncation",
    });

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBe(64 * 1024);
  });

  it("resets the session when a command times out", async () => {
    const timedOut = executeShellCommand({
      allowedRoot: workspaceRoot,
      command: "sleep 2",
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      timeoutMs: 100,
      threadId: "thread-shell-timeout",
    });

    await expect(timedOut).rejects.toThrow(/maximum runtime/i);
    expect(getShellSessionCount()).toBe(0);
  });

  it("allows long-running commands to continue while they keep producing output", async () => {
    const result = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command:
        'i=0; while [ "$i" -lt 4 ]; do printf "%s\\n" "$i"; i=$((i + 1)); sleep 0.2; done',
      defaultDirectory: workspaceRoot,
      inactivityTimeoutMs: 500,
      permissionMode: "full",
      timeoutMs: 1_500,
      threadId: "thread-shell-activity",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0");
    expect(result.stdout).toContain("3");
  });

  it("streams running snapshots before the final completed result", async () => {
    const events = [];

    for await (const event of streamShellCommand({
      allowedRoot: workspaceRoot,
      command: 'printf "one\\n"; sleep 0.1; printf "two\\n" >&2',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-stream",
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

    for await (const event of streamShellCommand({
      allowedRoot: workspaceRoot,
      command: 'node -e "process.stdout.write(\'a\'.repeat(9000)); process.stdout.write(\'\\n\')"',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-tail",
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

  it("rejects obvious directory escape commands in default mode", () => {
    expect(() => assertShellCommandAllowed("cd ..")).toThrow(/violates default permissions mode/i);
    expect(() => assertShellCommandAllowed("pushd /tmp")).toThrow(
      /violates default permissions mode/i,
    );
  });

  it("resets the session if the shell leaves the allowed root in default mode", async () => {
    const childDirectory = `${workspaceRoot}/sentinel`;

    await expect(
      executeShellCommand({
        allowedRoot: childDirectory,
        command: "cd ..",
        defaultDirectory: childDirectory,
        permissionMode: "default",
        threadId: "thread-shell-test",
      }),
    ).rejects.toThrow(/selected workspace root/i);
  });
});
