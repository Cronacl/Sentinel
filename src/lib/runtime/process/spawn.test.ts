import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  buildChildProcessEnv,
  buildSpawnInvocation,
  SENTINEL_PRIVATE_ENV_KEYS,
  spawnManagedProcess,
} = await import("./spawn");

function createFakeSpawn(pid: number | null = 501) {
  const calls: Array<{
    args: readonly string[];
    command: string;
    options: SpawnOptions;
  }> = [];
  let child: (EventEmitter & { exitCode: number | null }) | null = null;
  const spawn = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => {
    calls.push({ args, command, options });
    child = Object.assign(new EventEmitter(), {
      exitCode: null,
      kill: mock((_signal?: NodeJS.Signals | number) => true),
      pid: pid ?? undefined,
      signalCode: null,
    });
    return child as unknown as ChildProcess;
  };
  return { calls, getChild: () => child!, spawn };
}

function createFakeRegistry() {
  return {
    register: mock((_registration: unknown) => {}),
    unregister: mock((_pid: number) => {}),
  };
}

describe("buildChildProcessEnv", () => {
  it("layers env over the base and drops unset values and Sentinel secrets", () => {
    expect([...SENTINEL_PRIVATE_ENV_KEYS].sort()).toEqual([
      "ENCRYPTION_KEY",
      "SENTINEL_INTERNAL_TOKEN",
    ]);
    expect(
      buildChildProcessEnv(
        { EXTRA: "1", HOME: "/home/instance", REMOVED: undefined },
        {
          baseEnv: {
            ENCRYPTION_KEY: "secret",
            HOME: "/home/me",
            PATH: "/usr/bin",
            REMOVED: "kept?",
            SENTINEL_INTERNAL_TOKEN: "token",
          },
        },
      ),
    ).toEqual({ EXTRA: "1", HOME: "/home/instance", PATH: "/usr/bin" });
  });

  it("can start from an empty environment", () => {
    expect(
      buildChildProcessEnv({ ONLY: "this" }, { extendEnv: false }),
    ).toEqual({ ONLY: "this" });
  });
});

describe("buildSpawnInvocation", () => {
  it("spawns binaries directly and wraps Windows batch shims in cmd.exe", () => {
    expect(
      buildSpawnInvocation("/usr/local/bin/codex", ["app-server"], {
        platform: "darwin",
      }),
    ).toEqual({ args: ["app-server"], command: "/usr/local/bin/codex" });
    expect(
      buildSpawnInvocation("C:\\npm\\agent.cmd", ["acp", "a b"], {
        comSpec: "C:\\Windows\\cmd.exe",
        platform: "win32",
      }),
    ).toEqual({
      args: ["/d", "/s", "/c", '"C:\\npm\\agent.cmd ^"acp^" ^"a^ b^""'],
      command: "C:\\Windows\\cmd.exe",
      windowsVerbatimArguments: true,
    });
  });
});

describe("spawnManagedProcess", () => {
  it("starts a POSIX agent in its own process group and records its pid", () => {
    const fake = createFakeSpawn(501);
    const registry = createFakeRegistry();
    const kill = mock(
      (_pid: number, _signal?: NodeJS.Signals | number) => true,
    );

    const child = spawnManagedProcess({
      args: ["app-server"],
      command: "/usr/local/bin/codex",
      cwd: "/work",
      env: { CODEX_HOME: "/homes/work" },
      extendEnv: false,
      instanceId: "codex-work",
      kill,
      label: "codex app-server",
      platform: "linux",
      registry,
      spawn: fake.spawn,
    });

    expect(fake.calls).toEqual([
      {
        args: ["app-server"],
        command: "/usr/local/bin/codex",
        options: {
          cwd: "/work",
          detached: true,
          env: { CODEX_HOME: "/homes/work" },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      },
    ]);
    expect(registry.register.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        args: ["app-server"],
        command: "/usr/local/bin/codex",
        group: true,
        instanceId: "codex-work",
        label: "codex app-server",
        pid: 501,
      }),
    );

    child.kill("SIGTERM");
    expect(kill.mock.calls).toEqual([[-501, "SIGTERM"]]);

    fake.getChild().emit("exit", 0, null);
    expect(registry.unregister.mock.calls).toEqual([[501]]);
  });

  it("reports whether the recorded process still runs", () => {
    const fake = createFakeSpawn(502);
    const registry = createFakeRegistry();

    spawnManagedProcess({
      command: "agent",
      platform: "darwin",
      registry,
      spawn: fake.spawn,
    });
    const registration = registry.register.mock.calls[0]?.[0] as {
      isRunning: () => boolean;
    };

    expect(registration.isRunning()).toBe(true);
    fake.getChild().exitCode = 1;
    expect(registration.isRunning()).toBe(false);
  });

  it("runs Windows shims through cmd.exe without a process group", async () => {
    const fake = createFakeSpawn(503);
    const registry = createFakeRegistry();
    const taskkill = mock(async (_pid: number) => {});

    const child = spawnManagedProcess({
      args: ["serve"],
      comSpec: "cmd.exe",
      command: "C:\\npm\\opencode.cmd",
      platform: "win32",
      registry,
      spawn: fake.spawn,
      taskkill,
    });

    expect(fake.calls[0]).toEqual(
      expect.objectContaining({
        args: ["/d", "/s", "/c", '"C:\\npm\\opencode.cmd ^"serve^""'],
        command: "cmd.exe",
      }),
    );
    expect(fake.calls[0]?.options).toEqual(
      expect.objectContaining({
        detached: false,
        windowsVerbatimArguments: true,
      }),
    );
    // Recorded as the agent, not as the cmd.exe that runs it.
    expect(registry.register.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        args: ["serve"],
        command: "C:\\npm\\opencode.cmd",
        group: false,
        pid: 503,
      }),
    );

    child.kill();
    await Promise.resolve();
    expect(taskkill.mock.calls).toEqual([[503]]);
  });

  it("does not record short-lived helpers or failed spawns", () => {
    const registry = createFakeRegistry();

    spawnManagedProcess({
      command: "codex",
      platform: "linux",
      register: false,
      registry,
      spawn: createFakeSpawn(504).spawn,
    });
    spawnManagedProcess({
      command: "missing",
      platform: "linux",
      registry,
      spawn: createFakeSpawn(null).spawn,
    });

    expect(registry.register).not.toHaveBeenCalled();
  });
});
