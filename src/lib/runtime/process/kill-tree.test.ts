import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  endProcessGroup,
  installTreeKill,
  isProcessAlive,
  killProcessTree,
  killProcessTreeSync,
  terminateProcessTree,
} = await import("./kill-tree");

function errnoError(code: string) {
  return Object.assign(new Error(code), { code });
}

function createChild(overrides?: { exitCode?: number | null }) {
  return {
    exitCode: overrides?.exitCode ?? null,
    kill: mock((_signal?: NodeJS.Signals | number) => true),
    pid: 4242,
    signalCode: null as NodeJS.Signals | null,
  };
}

describe("installTreeKill", () => {
  it("ends the whole process tree with taskkill on Windows", async () => {
    const child = createChild();
    const directKill = child.kill;
    const taskkill = mock(async (_pid: number) => {});

    installTreeKill(child, { platform: "win32", taskkill });
    expect(child.kill()).toBe(true);
    await Promise.resolve();

    expect(taskkill).toHaveBeenCalledWith(4242);
    expect(directKill).not.toHaveBeenCalled();
  });

  it("falls back to the direct kill when taskkill fails", async () => {
    const child = createChild();
    const directKill = child.kill;

    installTreeKill(child, {
      platform: "win32",
      taskkill: async () => {
        throw new Error("taskkill missing");
      },
    });
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(directKill).toHaveBeenCalledWith("SIGTERM");
  });

  it("leaves kill() alone on POSIX without a process group, and after exit", () => {
    const posixChild = createChild();
    const posixKill = posixChild.kill;
    installTreeKill(posixChild, { platform: "darwin" });
    expect(posixChild.kill).toBe(posixKill);

    const exitedChild = createChild({ exitCode: 0 });
    const exitedKill = exitedChild.kill;
    const taskkill = mock(async (_pid: number) => {});
    installTreeKill(exitedChild, { platform: "win32", taskkill });
    exitedChild.kill();

    expect(taskkill).not.toHaveBeenCalled();
    expect(exitedKill).toHaveBeenCalled();
  });

  it("signals the process group on POSIX when the child leads one", () => {
    const child = createChild();
    const directKill = child.kill;
    const kill = mock(
      (_pid: number, _signal?: NodeJS.Signals | number) => true,
    );

    installTreeKill(child, { group: true, kill, platform: "linux" });
    child.kill("SIGINT");
    child.kill();

    expect(kill.mock.calls).toEqual([
      [-4242, "SIGINT"],
      [-4242, "SIGTERM"],
    ]);
    expect(directKill).not.toHaveBeenCalled();
  });

  it("falls back to the direct kill when the group signal fails", () => {
    const child = createChild();
    const directKill = child.kill;

    installTreeKill(child, {
      group: true,
      kill: () => {
        throw errnoError("ESRCH");
      },
      platform: "darwin",
    });
    child.kill("SIGTERM");

    expect(directKill).toHaveBeenCalledWith("SIGTERM");
  });
});

describe("killProcessTree", () => {
  it("signals the group and falls back to the pid when there is no group", async () => {
    const calls: Array<[number, NodeJS.Signals | number | undefined]> = [];
    const kill = (pid: number, signal?: NodeJS.Signals | number) => {
      calls.push([pid, signal]);
      if (pid < 0) {
        throw errnoError("ESRCH");
      }
      return true;
    };

    expect(
      await killProcessTree(77, {
        kill,
        platform: "darwin",
        signal: "SIGKILL",
      }),
    ).toBe(true);
    expect(calls).toEqual([
      [-77, "SIGKILL"],
      [77, "SIGKILL"],
    ]);
  });

  it("does not fall back on errors other than a missing group", async () => {
    const kill = mock((_pid: number) => {
      throw errnoError("EPERM");
    });

    expect(await killProcessTree(77, { kill, platform: "linux" })).toBe(false);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("only signals the pid when group is false", async () => {
    const kill = mock(
      (_pid: number, _signal?: NodeJS.Signals | number) => true,
    );

    await killProcessTree(77, { group: false, kill, platform: "linux" });

    expect(kill.mock.calls).toEqual([[77, "SIGTERM"]]);
  });

  it("uses taskkill on Windows and ignores invalid pids", async () => {
    const taskkill = mock(async (_pid: number) => {});

    expect(await killProcessTree(9, { platform: "win32", taskkill })).toBe(
      true,
    );
    expect(await killProcessTree(0, { platform: "win32", taskkill })).toBe(
      false,
    );
    expect(taskkill.mock.calls).toEqual([[9]]);
  });

  it("has a synchronous variant for exit handlers", () => {
    const taskkillSync = mock((_pid: number) => true);
    const kill = mock(
      (_pid: number, _signal?: NodeJS.Signals | number) => true,
    );

    expect(killProcessTreeSync(5, { platform: "win32", taskkillSync })).toBe(
      true,
    );
    expect(
      killProcessTreeSync(5, { kill, platform: "linux", signal: "SIGKILL" }),
    ).toBe(true);
    expect(taskkillSync.mock.calls).toEqual([[5]]);
    expect(kill.mock.calls).toEqual([[-5, "SIGKILL"]]);
  });
});

describe("isProcessAlive", () => {
  it("treats EPERM as alive and ESRCH as gone", () => {
    expect(
      isProcessAlive(1, {
        kill: () => {
          throw errnoError("EPERM");
        },
      }),
    ).toBe(true);
    expect(
      isProcessAlive(1, {
        kill: () => {
          throw errnoError("ESRCH");
        },
      }),
    ).toBe(false);
    expect(isProcessAlive(1, { kill: () => true })).toBe(true);
    expect(isProcessAlive(-1, { kill: () => true })).toBe(false);
  });

  it("sees the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});

describe("terminateProcessTree", () => {
  function createEmitterChild() {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      exitCode: null as number | null,
      pid: 31,
      signalCode: null as NodeJS.Signals | null,
    });
  }

  it("escalates to SIGKILL when the child ignores SIGTERM", async () => {
    const child = createEmitterChild();
    const signals: Array<NodeJS.Signals | number | undefined> = [];
    const timers: Array<{ callback: () => void; ms: number }> = [];

    const done = terminateProcessTree(child, {
      graceMs: 2_000,
      kill: (_pid, signal) => {
        signals.push(signal);
        return true;
      },
      platform: "linux",
      setTimeout: (callback, ms) => {
        timers.push({ callback, ms });
        return timers.length;
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(signals).toEqual(["SIGTERM"]);
    expect(timers.map((timer) => timer.ms)).toEqual([2_000]);

    timers[0]!.callback();
    await done;

    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("resolves without SIGKILL once the child exits", async () => {
    const child = createEmitterChild();
    const signals: Array<NodeJS.Signals | number | undefined> = [];
    const cleared: unknown[] = [];

    const done = terminateProcessTree(child, {
      clearTimeout: (handle) => cleared.push(handle),
      kill: (_pid, signal) => {
        signals.push(signal);
        return true;
      },
      platform: "darwin",
      setTimeout: () => "timer-1",
    });
    await Promise.resolve();
    await Promise.resolve();
    child.exitCode = 0;
    child.emit("exit", 0, null);
    await done;

    expect(signals).toEqual(["SIGTERM"]);
    expect(cleared).toEqual(["timer-1"]);
  });

  it("does nothing for a child that already exited", async () => {
    const child = createEmitterChild();
    child.exitCode = 1;
    const kill = mock(() => true);

    await terminateProcessTree(child, { kill, platform: "linux" });

    expect(kill).not.toHaveBeenCalled();
  });
});

describe("endProcessGroup", () => {
  /** A fake group that lives for `polls` liveness checks after SIGTERM. */
  function fakeGroup(polls: number) {
    const signals: Array<NodeJS.Signals | number | undefined> = [];
    let remaining = polls;
    let terminated = false;
    const kill = (pid: number, signal?: NodeJS.Signals | number) => {
      expect(pid).toBe(-77);
      if (signal === 0) {
        if (terminated && remaining-- <= 0) {
          throw errnoError("ESRCH");
        }
        return true;
      }
      signals.push(signal);
      terminated = true;
      return true;
    };
    return { kill, signals };
  }
  const immediate = (callback: () => void) => {
    queueMicrotask(callback);
    return 0;
  };

  it("terminates what is left of the group, without SIGKILL when it leaves", async () => {
    const group = fakeGroup(2);
    expect(
      await endProcessGroup(77, {
        graceMs: 1_000,
        kill: group.kill,
        platform: "darwin",
        pollMs: 100,
        setTimeout: immediate,
      }),
    ).toBe(true);
    expect(group.signals).toEqual(["SIGTERM"]);
  });

  it("escalates to SIGKILL when a member outlives the grace period", async () => {
    const group = fakeGroup(Number.POSITIVE_INFINITY);
    await endProcessGroup(77, {
      graceMs: 300,
      kill: group.kill,
      platform: "linux",
      pollMs: 100,
      setTimeout: immediate,
    });
    expect(group.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("does nothing when the group is gone, and on Windows", async () => {
    const kill = mock((_pid: number, _signal?: NodeJS.Signals | number) => {
      throw errnoError("ESRCH");
    });
    expect(await endProcessGroup(77, { kill, platform: "linux" })).toBe(false);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(await endProcessGroup(77, { kill, platform: "win32" })).toBe(false);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it.skipIf(process.platform === "win32")(
    "ends a background child that outlived its group leader",
    async () => {
      const leader = spawn("/bin/sh", ["-c", "sleep 30 & echo $!"], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      leader.stdout.on("data", (chunk) => (output += String(chunk)));
      await new Promise((resolve) => leader.once("exit", resolve));
      const childPid = Number(output.trim());
      expect(isProcessAlive(childPid)).toBe(true);

      expect(await endProcessGroup(leader.pid!, { graceMs: 2_000 })).toBe(true);
      expect(isProcessAlive(childPid)).toBe(false);
    },
  );
});
