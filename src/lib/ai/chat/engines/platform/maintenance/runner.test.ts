import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { createMaintenanceRunner, MaintenanceBusyError } =
  await import("./runner");

type FakeChild = EventEmitter & {
  exit(code: number | null): void;
  kill: ReturnType<typeof mock>;
  stderr: PassThrough;
  stdout: PassThrough;
};

function createHarness() {
  const children: FakeChild[] = [];
  const spawned: Array<{ args: string[]; command: string; env: unknown }> = [];
  const events: Array<Record<string, unknown>> = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  let now = 0;

  const spawn = mock(
    (options: { args?: readonly string[]; command: string; env?: unknown }) => {
      const child = new EventEmitter() as FakeChild;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.exit = (code) => {
        child.emit("exit", code);
        child.emit("close", code);
      };
      child.kill = mock(() => {
        setTimeout(() => child.exit(null), 0);
        return true;
      });
      children.push(child);
      spawned.push({
        args: [...(options.args ?? [])],
        command: options.command,
        env: options.env,
      });
      return child as never;
    },
  );

  const runner = createMaintenanceRunner({
    clearTimeout: () => {},
    emit: (event) => events.push(event as Record<string, unknown>),
    now: () => (now += 1_000),
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length;
    },
    spawn,
    timeoutMs: 60_000,
  });

  return { children, events, runner, spawned, timers };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(check: () => boolean) {
  for (let index = 0; index < 100 && !check(); index += 1) {
    await tick();
  }
  expect(check()).toBe(true);
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    action: "update" as const,
    args: ["upgrade", "--cask", "copilot-cli"],
    display: "brew upgrade --cask copilot-cli",
    env: { PATH: "/opt/homebrew/bin" },
    executable: "/opt/homebrew/bin/brew",
    instanceId: "copilot",
    label: "Copilot",
    lockKey: "homebrew",
    verify: mock(async () => ({
      message: "Copilot updated to 1.0.40.",
      status: "succeeded" as const,
    })),
    ...overrides,
  };
}

describe("maintenance runner", () => {
  it("runs the confirmed command, streams its output and verifies the result", async () => {
    const { children, events, runner, spawned } = createHarness();
    const run = command();

    runner.runCommand(run);
    await until(() => children.length === 1);
    expect(spawned[0]).toEqual(
      expect.objectContaining({
        args: ["upgrade", "--cask", "copilot-cli"],
        command: "/opt/homebrew/bin/brew",
        env: expect.objectContaining({
          NO_COLOR: "1",
          PATH: "/opt/homebrew/bin",
        }),
      }),
    );
    expect(runner.isRunning("copilot")).toBe(true);

    children[0]!.stdout.write("==> Upgrading copilot-cli\n");
    await tick();
    children[0]!.exit(0);
    await runner.whenSettled("copilot");

    expect(run.verify).toHaveBeenCalledTimes(1);
    expect(runner.get("copilot")?.updateState).toEqual(
      expect.objectContaining({
        message: "Copilot updated to 1.0.40.",
        output: "==> Upgrading copilot-cli",
        status: "succeeded",
      }),
    );
    expect(runner.isRunning("copilot")).toBe(false);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({ instanceId: "copilot", type: "maintenance" }),
    );
    expect(
      events.some(
        (event) =>
          (event.updateState as { status: string }).status === "running",
      ),
    ).toBe(true);
  });

  it("calls the settle hook once the final state is recorded", async () => {
    const { children, runner } = createHarness();
    const states: Array<string | undefined> = [];
    const run = command({
      onSettled: () => states.push(runner.get("copilot")?.updateState?.status),
    });
    runner.runCommand(run);
    await until(() => children.length === 1);
    children[0]!.exit(2);
    await runner.whenSettled("copilot");
    expect(states).toEqual(["failed"]);
  });

  it("reports a failing command with its output and skips verification", async () => {
    const { children, runner } = createHarness();
    const run = command();
    runner.runCommand(run);
    await until(() => children.length === 1);
    children[0]!.stderr.write("Error: permission denied\n");
    await tick();
    children[0]!.exit(1);
    await runner.whenSettled("copilot");

    expect(run.verify).not.toHaveBeenCalled();
    expect(runner.get("copilot")?.updateState).toEqual(
      expect.objectContaining({
        message: "The command exited with code 1.",
        output: "Error: permission denied",
        status: "failed",
      }),
    );
  });

  it("keeps only the tail of long output", async () => {
    const { children, runner } = createHarness();
    runner.runCommand(command());
    await until(() => children.length === 1);
    children[0]!.stdout.write("a".repeat(20_000));
    children[0]!.stdout.write("END");
    await tick();
    children[0]!.exit(0);
    await runner.whenSettled("copilot");
    const output = runner.get("copilot")?.updateState?.output ?? "";
    expect(output.length).toBe(10_000);
    expect(output.endsWith("END")).toBe(true);
  });

  it("cancels and times out by ending the process tree", async () => {
    const cancelled = createHarness();
    cancelled.runner.runCommand(command());
    await until(() => cancelled.children.length === 1);
    expect(cancelled.runner.cancel("copilot")).toBe(true);
    await cancelled.runner.whenSettled("copilot");
    expect(cancelled.children[0]!.kill).toHaveBeenCalled();
    expect(cancelled.runner.get("copilot")?.updateState).toEqual(
      expect.objectContaining({ message: "Cancelled.", status: "failed" }),
    );
    expect(cancelled.runner.cancel("copilot")).toBe(false);

    const timedOut = createHarness();
    timedOut.runner.runCommand(command());
    await until(() => timedOut.children.length === 1);
    expect(timedOut.timers[0]?.ms).toBe(60_000);
    timedOut.timers[0]!.callback();
    await timedOut.runner.whenSettled("copilot");
    expect(timedOut.runner.get("copilot")?.updateState).toEqual(
      expect.objectContaining({
        message: "Timed out after 1 minutes.",
        status: "failed",
      }),
    );
  });

  it("refuses a second operation on a busy instance", async () => {
    const { children, runner } = createHarness();
    runner.runCommand(command());
    await until(() => children.length === 1);
    expect(() => runner.runCommand(command())).toThrow(MaintenanceBusyError);
    children[0]!.exit(0);
    await runner.whenSettled("copilot");
  });

  it("queues operations that share a lock and lets a queued one be cancelled", async () => {
    const { children, runner } = createHarness();
    runner.runCommand(command());
    const queued = runner.runCommand(
      command({ instanceId: "copilot-work", label: "Copilot (work)" }),
    );
    const third = runner.runCommand(
      command({ instanceId: "copilot-other", label: "Copilot (other)" }),
    );
    expect(queued.status).toBe("queued");
    expect(third.status).toBe("queued");
    await until(() => children.length === 1);

    expect(runner.cancel("copilot-other")).toBe(true);
    expect(runner.get("copilot-other")?.updateState?.message).toBe(
      "Cancelled before it started.",
    );

    children[0]!.exit(0);
    await until(() => children.length === 2);
    children[1]!.exit(0);
    await runner.whenSettled("copilot-work");
    expect(runner.get("copilot-work")?.updateState?.status).toBe("succeeded");
    expect(children).toHaveLength(2);
  });

  it("reports a command that cannot start", async () => {
    const { runner } = createHarness();
    const failing = createMaintenanceRunner({
      emit: () => {},
      spawn: () => {
        throw new Error("spawn ENOENT");
      },
    });
    failing.runCommand(command());
    await failing.whenSettled("copilot");
    expect(failing.get("copilot")?.updateState).toEqual(
      expect.objectContaining({
        message: "Could not run brew upgrade --cask copilot-cli: spawn ENOENT",
        status: "failed",
      }),
    );
    expect(runner.get("copilot")).toBe(null);
  });

  it("reports managed installs through installState", async () => {
    const { events, runner } = createHarness();
    const verify = mock(async () => ({
      message: "Installed.",
      status: "succeeded" as const,
    }));
    const initial = runner.runManaged({
      instanceId: "antigravity",
      label: "Antigravity",
      lockKey: "antigravity-managed",
      run: async ({ onProgress }) => {
        onProgress({
          downloadedBytes: 10,
          message: null,
          phase: "downloading",
          totalBytes: 100,
        });
        onProgress({
          downloadedBytes: 100,
          message: null,
          phase: "extracting",
          totalBytes: 100,
        });
      },
      verify,
    });
    expect(initial.phase).toBe("downloading");
    await runner.whenSettled("antigravity");

    expect(runner.get("antigravity")?.installState).toEqual({
      downloadedBytes: 100,
      message: "Installed.",
      phase: "succeeded",
      totalBytes: 100,
    });
    expect(
      events
        .map(
          (event) =>
            (event.installState as { phase?: string } | undefined)?.phase,
        )
        .filter(Boolean),
    ).toEqual(["downloading", "downloading", "extracting", "succeeded"]);

    const failed = createHarness();
    failed.runner.runManaged({
      instanceId: "antigravity",
      label: "Antigravity",
      lockKey: "antigravity-managed",
      run: async () => {
        throw new Error("The download failed its SHA-256 check.");
      },
      verify,
    });
    await failed.runner.whenSettled("antigravity");
    expect(failed.runner.get("antigravity")?.installState).toEqual(
      expect.objectContaining({
        message: "The download failed its SHA-256 check.",
        phase: "failed",
      }),
    );
  });
});
