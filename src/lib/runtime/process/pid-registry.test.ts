import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { commandLineMatchesEntry, createAgentPidRegistry, getAgentPidFilePath } =
  await import("./pid-registry");
const { buildSpawnInvocation } = await import("./spawn");

let root: string;
let filePath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "sentinel-pid-registry-"));
  filePath = getAgentPidFilePath({ stateRoot: root });
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

type FakeProcesses = {
  alive: Set<number>;
  commandLines: Map<number, string>;
  signals: Array<[number, NodeJS.Signals | number | undefined]>;
  /** Pids that ignore SIGTERM. */
  stubborn: Set<number>;
};

function createFakeProcesses(): FakeProcesses {
  return {
    alive: new Set(),
    commandLines: new Map(),
    signals: [],
    stubborn: new Set(),
  };
}

function createRegistry(
  fake: FakeProcesses,
  overrides: Partial<Parameters<typeof createAgentPidRegistry>[0]> = {},
) {
  const waits: number[] = [];
  const registry = createAgentPidRegistry({
    filePath,
    isAlive: (pid) => fake.alive.has(pid),
    kill: (pid, signal) => {
      fake.signals.push([pid, signal]);
      const target = Math.abs(pid);
      if (!fake.alive.has(target)) {
        throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
      }
      if (signal === "SIGKILL" || !fake.stubborn.has(target)) {
        fake.alive.delete(target);
      }
      return true;
    },
    now: () => new Date("2026-10-07T12:00:00.000Z"),
    ownerPid: 1000,
    platform: "darwin",
    readCommandLine: async (pid) => fake.commandLines.get(pid) ?? null,
    wait: async (ms) => {
      waits.push(ms);
    },
    ...overrides,
  });
  return { registry, waits };
}

function readFile() {
  return JSON.parse(readFileSync(filePath, "utf8")) as {
    entries: Array<{ ownerPid: number; pid: number }>;
    version: number;
  };
}

describe("agent pid registry", () => {
  it("lives under <state root>/run/agents.json", () => {
    expect(filePath).toBe(path.join(root, "run", "agents.json"));
  });

  it("persists registrations privately and removes them on unregister", () => {
    const fake = createFakeProcesses();
    const { registry } = createRegistry(fake);

    registry.register({
      args: ["app-server"],
      command: "/usr/local/bin/codex",
      group: true,
      instanceId: "codex",
      label: "codex app-server",
      pid: 41,
    });

    expect(readFile().entries).toEqual([
      expect.objectContaining({
        args: ["app-server"],
        command: "/usr/local/bin/codex",
        group: true,
        instanceId: "codex",
        ownerPid: 1000,
        pid: 41,
        startedAt: "2026-10-07T12:00:00.000Z",
      }),
    ]);
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }

    registry.unregister(41);
    expect(readFile().entries).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it("keeps entries written by another live server", () => {
    const fake = createFakeProcesses();
    const first = createRegistry(fake).registry;
    const second = createRegistry(fake, { ownerPid: 2000 }).registry;

    first.register({ command: "agent", group: true, pid: 11 });
    second.register({ command: "opencode", group: true, pid: 22 });
    first.unregister(11);

    expect(readFile().entries.map((entry) => entry.pid)).toEqual([22]);
  });

  it("signals every own process group synchronously", () => {
    const fake = createFakeProcesses();
    fake.alive.add(41).add(42);
    const { registry } = createRegistry(fake);
    registry.register({ command: "codex", group: true, pid: 41 });
    registry.register({ command: "agent", group: false, pid: 42 });

    expect(registry.killAllSync("SIGTERM")).toBe(2);
    expect(fake.signals).toEqual([
      [-41, "SIGTERM"],
      [42, "SIGTERM"],
    ]);
  });

  it("never signals an entry whose process already exited", () => {
    const fake = createFakeProcesses();
    fake.alive.add(41);
    const { registry } = createRegistry(fake);
    let running = true;
    registry.register({
      command: "codex",
      group: true,
      isRunning: () => running,
      pid: 41,
    });

    running = false;
    expect(registry.killAllSync("SIGKILL")).toBe(0);
    expect(fake.signals).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it("shuts down gracefully and force-kills stragglers", async () => {
    const fake = createFakeProcesses();
    fake.alive.add(41).add(42);
    fake.stubborn.add(42);
    const { registry, waits } = createRegistry(fake);
    registry.register({ command: "codex", group: true, pid: 41 });
    registry.register({ command: "opencode", group: true, pid: 42 });

    expect(await registry.shutdown({ graceMs: 500 })).toEqual({
      forced: 1,
      signalled: 2,
    });
    expect(waits).toEqual([500]);
    expect(fake.signals).toEqual([
      [-41, "SIGTERM"],
      [-42, "SIGTERM"],
      [-42, "SIGKILL"],
    ]);
    expect(registry.list()).toEqual([]);
    expect(readFile().entries).toEqual([]);
  });

  it("sweeps orphans of a dead server only when the command line matches", async () => {
    const fake = createFakeProcesses();
    // A previous server (pid 900, now gone) left three entries behind.
    const previous = createRegistry(fake, { ownerPid: 900 }).registry;
    fake.alive.add(51).add(52);
    previous.register({
      args: ["app-server"],
      command: "/opt/homebrew/bin/codex",
      group: true,
      pid: 51,
    });
    previous.register({
      args: ["acp"],
      command: "agent",
      group: true,
      pid: 52,
    });
    previous.register({ command: "opencode", group: true, pid: 53 });
    // 51 still runs Codex (through the npm launcher); 52 was reused by an
    // unrelated process; 53 is gone.
    fake.commandLines.set(
      51,
      "node /opt/homebrew/lib/node_modules/@openai/codex/bin/codex app-server",
    );
    fake.commandLines.set(52, "/usr/bin/vim notes.txt");

    const { registry } = createRegistry(fake);
    registry.register({ command: "codex", group: true, pid: 61 });
    fake.alive.add(61);

    expect(await registry.sweepStale({ graceMs: 0 })).toEqual({
      killed: 1,
      pruned: 3,
    });
    expect(fake.signals).toEqual([[-51, "SIGTERM"]]);
    expect(fake.alive.has(52)).toBe(true);
    expect(readFile().entries.map((entry) => entry.pid)).toEqual([61]);
  });

  it("leaves the entries of another running server alone", async () => {
    const fake = createFakeProcesses();
    fake.alive.add(2000).add(71);
    createRegistry(fake, { ownerPid: 2000 }).registry.register({
      args: ["serve"],
      command: "opencode",
      group: true,
      pid: 71,
    });
    fake.commandLines.set(71, "opencode serve --port=1");

    const { registry } = createRegistry(fake);
    expect(await registry.sweepStale()).toEqual({ killed: 0, pruned: 0 });
    expect(fake.signals).toEqual([]);
    expect(readFile().entries.map((entry) => entry.pid)).toEqual([71]);
  });

  it("keeps a live orphan whose command line cannot be read for the next sweep", async () => {
    const fake = createFakeProcesses();
    const previous = createRegistry(fake, { ownerPid: 900 }).registry;
    fake.alive.add(81);
    previous.register({
      args: ["app-server"],
      command: "codex",
      group: true,
      pid: 81,
    });

    // No command line (the read timed out) while 81 still runs.
    const { registry } = createRegistry(fake);
    expect(await registry.sweepStale({ graceMs: 0 })).toEqual({
      killed: 0,
      pruned: 0,
    });
    expect(fake.signals).toEqual([]);
    expect(readFile().entries.map((entry) => entry.pid)).toEqual([81]);

    // A week later it is forgotten rather than kept forever.
    const later = createRegistry(fake, {
      now: () => new Date("2026-10-15T12:00:00.000Z"),
    }).registry;
    expect(await later.sweepStale({ graceMs: 0 })).toEqual({
      killed: 0,
      pruned: 1,
    });
    expect(readFile().entries).toEqual([]);
  });

  it("treats an unreadable or foreign file as empty", () => {
    const fake = createFakeProcesses();
    const { registry } = createRegistry(fake);
    registry.register({ command: "codex", group: true, pid: 1 });
    writeFileSync(filePath, "{not json");

    registry.register({ command: "codex", group: true, pid: 2 });

    expect(readFile().entries.map((entry) => entry.pid)).toEqual([1, 2]);
  });
});

describe("commandLineMatchesEntry", () => {
  const entry = {
    args: ["app-server"],
    command: "/usr/local/bin/codex",
    realCommand: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
  };

  it("matches launchers that exec into an interpreter", () => {
    expect(
      commandLineMatchesEntry(
        entry,
        "node /usr/local/lib/node_modules/@openai/codex/bin/codex.js app-server",
        "darwin",
      ),
    ).toBe(true);
  });

  it("needs both the executable name and the leading arguments", () => {
    expect(
      commandLineMatchesEntry(entry, "/usr/local/bin/codex exec", "linux"),
    ).toBe(false);
    expect(
      commandLineMatchesEntry(entry, "/usr/bin/top app-server", "linux"),
    ).toBe(false);
  });

  it("matches a .cmd shim run by cmd.exe as spawnManagedProcess starts it", () => {
    const shim = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd";
    const invocation = buildSpawnInvocation(shim, ["app-server"], {
      comSpec: "C:\\WINDOWS\\system32\\cmd.exe",
      platform: "win32",
    });
    const commandLine = [`"${invocation.command}"`, ...invocation.args].join(
      " ",
    );
    const entry = { args: ["app-server"], command: shim, realCommand: null };

    expect(commandLineMatchesEntry(entry, commandLine, "win32")).toBe(true);
    // Another cmd.exe that reused the pid is left alone.
    expect(
      commandLineMatchesEntry(
        entry,
        '"C:\\WINDOWS\\system32\\cmd.exe" /k build.bat',
        "win32",
      ),
    ).toBe(false);
  });

  it("never matches a shell or interpreter by its name alone", () => {
    const cmd = {
      args: ["/d", "/s", "/c"],
      command: "C:\\WINDOWS\\system32\\cmd.exe",
      realCommand: null,
    };
    expect(
      commandLineMatchesEntry(
        cmd,
        '"C:\\WINDOWS\\system32\\cmd.exe" /k build.bat',
        "win32",
      ),
    ).toBe(false);
    expect(
      commandLineMatchesEntry(
        { args: [], command: "node", realCommand: null },
        "node server.js",
        "linux",
      ),
    ).toBe(false);
    // A specific agent binary still matches on its name.
    expect(
      commandLineMatchesEntry(
        { args: [], command: "/usr/local/bin/opencode", realCommand: null },
        "/usr/local/bin/opencode",
        "linux",
      ),
    ).toBe(true);
  });

  it("compares case-insensitively on Windows and accepts the shim's base name", () => {
    expect(
      commandLineMatchesEntry(
        {
          args: ["acp"],
          command: "C:\\Users\\me\\AppData\\Roaming\\npm\\agent.cmd",
          realCommand: null,
        },
        '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\AGENT\\index.js ACP',
        "win32",
      ),
    ).toBe(true);
  });
});
