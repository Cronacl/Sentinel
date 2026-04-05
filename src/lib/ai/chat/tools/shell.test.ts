// @ts-nocheck

import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const {
  __internal,
  assertShellCommandAllowed,
  disposeShellSession,
  executeShellCommand,
  getShellSessionCount,
  streamShellCommand,
} = await import("./shell.ts");

const workspaceRoot = process.cwd();

afterEach(async () => {
  await disposeShellSession("thread-shell-test");
  await disposeShellSession("thread-shell-timeout");
  await disposeShellSession("thread-shell-truncation");
  await disposeShellSession("thread-shell-stream");
  await disposeShellSession("thread-shell-tail");
  await disposeShellSession("thread-shell-activity");
  await disposeShellSession("thread-shell-heartbeat");
});

describe("shell session manager", () => {
  it("persists shell state across commands in the same thread", async () => {
    const first = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command:
        'export SENTINEL_TEST_VALUE="persisted"; printf "$SENTINEL_TEST_VALUE"',
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
      command: "node -e \"process.stdout.write('a'.repeat(70000))\"",
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
    expect(
      finalEvent && "output" in finalEvent ? finalEvent.output : null,
    ).toMatchObject({
      exitCode: 0,
      failureKind: null,
      phase: "completed",
      stderr: "two",
      suggestedNextAction: "none",
      stdout: "one",
    });
  });

  it("caps the running preview tail separately from the final output", async () => {
    const runningEvents = [];

    for await (const event of streamShellCommand({
      allowedRoot: workspaceRoot,
      command:
        "node -e \"process.stdout.write('a'.repeat(9000)); process.stdout.write('\\n')\"",
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
    expect(
      Buffer.byteLength(lastRunning?.tail ?? "", "utf8"),
    ).toBeLessThanOrEqual(8 * 1024);
    expect(lastRunning?.truncated).toBe(true);
  });

  it("emits heartbeat running updates while a quiet command is still running", async () => {
    const runningEvents = [];

    for await (const event of streamShellCommand({
      allowedRoot: workspaceRoot,
      command: 'sleep 2; printf "done\\n"',
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-heartbeat",
    })) {
      if (event.type === "running") {
        runningEvents.push(event.output);
      }
    }

    expect(runningEvents.length).toBeGreaterThanOrEqual(1);
    expect(runningEvents.at(-1)?.durationMs ?? 0).toBeGreaterThanOrEqual(1_000);
  });

  it("rejects obvious directory escape commands in default mode", () => {
    expect(() => assertShellCommandAllowed("cd ..")).toThrow(
      /violates default permissions mode/i,
    );
    expect(() => assertShellCommandAllowed("pushd /tmp")).toThrow(
      /violates default permissions mode/i,
    );
  });

  it("allows changing into an allowed skill root in default mode", () => {
    expect(() =>
      assertShellCommandAllowed(`cd ${workspaceRoot}`, [workspaceRoot]),
    ).not.toThrow();
  });

  it("accepts Windows absolute paths that remain inside the allowed root", () => {
    expect(() =>
      assertShellCommandAllowed('cd "C:\\workspace\\repo"', [
        "C:\\workspace\\repo",
      ]),
    ).not.toThrow();
  });

  it("rejects Windows path escapes in default mode", () => {
    expect(() =>
      assertShellCommandAllowed('pushd "\\\\server\\share\\repo"', [
        "C:\\workspace\\repo",
      ]),
    ).toThrow(/violates default permissions mode/i);
    expect(() => assertShellCommandAllowed("cd D:")).toThrow(
      /violates default permissions mode/i,
    );
  });

  it("rejects missing working directories before starting a shell session", async () => {
    const missingDirectory = path.join(
      workspaceRoot,
      `sentinel-shell-missing-${Date.now()}`,
    );

    await expect(
      executeShellCommand({
        allowedRoot: missingDirectory,
        command: "pwd",
        defaultDirectory: missingDirectory,
        permissionMode: "full",
        threadId: "thread-shell-missing",
      }),
    ).rejects.toThrow(/working directory is unavailable/i);
    expect(getShellSessionCount()).toBe(0);
  });

  it("resets the session if the shell leaves the allowed root in default mode", async () => {
    const childDirectory = `${workspaceRoot}/sentinel`;
    await mkdir(childDirectory, { recursive: true });

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

  it("classifies missing command failures for remediation", async () => {
    const commandName = "sentinel_missing_binary_for_shell_test";
    const result = await executeShellCommand({
      allowedRoot: workspaceRoot,
      command: commandName,
      defaultDirectory: workspaceRoot,
      permissionMode: "full",
      threadId: "thread-shell-test",
    });

    expect(result.exitCode).toBe(127);
    expect(result.failureKind).toBe("missing_command");
    expect(result.missingCommand).toBe(commandName);
    expect(result.suggestedNextAction).toBe("install");
  });

  it("classifies permission errors as inspect-first failures", () => {
    expect(
      __internal.classifyShellCommandFailure({
        exitCode: 1,
        stderr: "Permission denied",
        stdout: "",
      }),
    ).toEqual({
      failureKind: "permission",
      missingCommand: null,
      suggestedNextAction: "inspect",
    });
  });

  it("classifies Windows missing-command failures for remediation", () => {
    expect(
      __internal.classifyShellCommandFailure({
        exitCode: 1,
        stderr:
          "The term 'pnpm' is not recognized as the name of a cmdlet, function, script file, or operable program.",
        stdout: "",
      }),
    ).toEqual({
      failureKind: "missing_command",
      missingCommand: "pnpm",
      suggestedNextAction: "install",
    });
  });

  it("normalizes Windows paths for containment checks", () => {
    expect(
      __internal.isPathInsideRoot(
        "C:\\workspace\\repo\\src\\index.ts",
        "C:\\workspace\\repo",
      ),
    ).toBe(true);
    expect(
      __internal.isPathInsideRoot(
        "D:\\workspace\\repo\\src\\index.ts",
        "C:\\workspace\\repo",
      ),
    ).toBe(false);
    expect(__internal.normalizeShellPath("C:\\Workspace\\Repo")).toBe(
      "c:\\workspace\\repo",
    );
    expect(__internal.resolvePathStyle("C:\\workspace\\repo")).toBe("win32");
  });

  it("builds a PowerShell payload with start and exit markers", () => {
    const payload = __internal.buildPowerShellPayload(
      "marker-1",
      "Write-Output 'hello'",
    );

    expect(payload).toContain("__sentinel_start__:marker-1");
    expect(payload).toContain("__sentinel_exit__:marker-1");
    expect(payload).toContain("Write-Output 'hello'");
  });
});
