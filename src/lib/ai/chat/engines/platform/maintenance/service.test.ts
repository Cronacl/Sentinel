import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));
// The process-wide singletons are not used here (deps are injected).
mock.module("../snapshot-service", () => ({
  getEngineSnapshotService: () => {
    throw new Error("not in tests");
  },
}));
mock.module("../instances", () => ({
  getEngineInstanceRegistry: () => {
    throw new Error("not in tests");
  },
}));

const { makeFakeInstance, makeFakeSnapshot } =
  await import("../../contract/testing");
const { BUNDLED_ENGINE_MANIFEST } = await import("../manifest/bundled");
const { createLatestVersionLookup } = await import("./latest-version");
const { createMaintenanceRunner } = await import("./runner");
const { createEngineMaintenanceService, EngineMaintenanceError } =
  await import("./service");

import type { EngineSnapshot } from "../../contract";
import type { EngineDriver } from "../driver";

const USER = "user-1";
const NPM_COMMAND =
  "npm install -g --prefix /usr/local --allow-scripts=@openai/codex @openai/codex@0.161.0";

type FakeChild = EventEmitter & {
  kill(): boolean;
  stderr: PassThrough;
  stdout: PassThrough;
};

let snapshots: Record<string, EngineSnapshot>;
let children: FakeChild[];
let spawned: Array<{ args: readonly string[]; command: string }>;
let spawnedEnv: Array<Record<string, string | undefined>>;

function codexSnapshot(version: string) {
  return makeFakeSnapshot({
    driver: "codex",
    install: {
      installed: true,
      path: "/usr/local/bin/codex",
      source: "managed-path",
      version,
    },
  });
}

function createHarness() {
  const invalidate = mock(() => {});
  const driver = { invalidate, kind: "codex" } as unknown as EngineDriver;
  const dispose = mock(async () => {});
  const refresh = mock(async (_user: string, instanceId: string) => {
    return snapshots[instanceId] ?? null;
  });
  const runner = createMaintenanceRunner({
    emit: () => {},
    spawn: ((options: {
      args?: readonly string[];
      command: string;
      env?: Record<string, string | undefined>;
    }) => {
      const child = new EventEmitter() as FakeChild;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        setTimeout(() => child.emit("close", null), 0);
        return true;
      };
      children.push(child);
      spawned.push({ args: options.args ?? [], command: options.command });
      spawnedEnv.push(options.env ?? {});
      return child;
    }) as never,
  });
  const instances: Record<string, ReturnType<typeof makeFakeInstance>> = {
    codex: makeFakeInstance({
      driver: "codex",
      env: { PATH: "/usr/local/bin" },
    }),
    // A second Codex account: its own home and API key.
    "codex-work": makeFakeInstance({
      driver: "codex",
      env: {
        CODEX_HOME: "/Users/me/.codex-work",
        HTTPS_PROXY: "http://proxy.test:8080",
        OPENAI_API_KEY: "sk-test-work",
        PATH: "/usr/local/bin",
      },
      envOverrides: {
        CODEX_HOME: "/Users/me/.codex-work",
        HTTPS_PROXY: "http://proxy.test:8080",
        OPENAI_API_KEY: "sk-test-work",
      },
      id: "codex-work",
    }),
    opencode: makeFakeInstance({
      driver: "opencode",
      env: { PATH: "/usr/local/bin" },
    }),
  };

  const service = createEngineMaintenanceService({
    baseEnv: { HOME: "/Users/me", PATH: "/usr/local/bin" },
    disposeInstance: dispose,
    drivers: (kind) =>
      kind === "codex" || kind === "opencode"
        ? ({ ...driver, kind } as EngineDriver)
        : null,
    inspect: {
      latest: createLatestVersionLookup({
        fetch: async (url: string) =>
          new Response(
            JSON.stringify({
              version: url.includes("codex") ? "0.161.0" : "1.18.35",
            }),
          ),
      }),
      managedPath: async () => "/usr/local/bin",
      manifest: async () => BUNDLED_ENGINE_MANIFEST,
      ownership: {
        exists: async () => false,
        realpath: async (target: string) =>
          target === "/usr/local/bin/codex"
            ? "/usr/local/lib/node_modules/@openai/codex/bin/codex.js"
            : target === "/Users/me/.local/bin/codex"
              ? "/Users/me/.codex/packages/standalone/current/bin/codex"
              : target,
        which: async () => null,
      },
      planCache: new Map(),
      updateChecksEnabled: async () => true,
      which: async (command: string) =>
        command === "npm" ? "/usr/local/bin/npm" : null,
    },
    platform: "darwin",
    registry: () => ({
      get: async (_user: string, instanceId: string) =>
        instances[instanceId]
          ? { instance: instances[instanceId]!, status: "available" as const }
          : null,
    }),
    runner: () => runner,
    snapshots: () => ({
      getSnapshot: async (_user: string, instanceId: string) =>
        snapshots[instanceId] ?? null,
      refresh,
    }),
    which: async (command: string) =>
      command === "npm" ? "/usr/local/bin/npm" : null,
  });
  return { dispose, invalidate, refresh, runner, service };
}

async function until(check: () => boolean) {
  for (let index = 0; index < 200 && !check(); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(check()).toBe(true);
}

beforeEach(() => {
  snapshots = {
    codex: codexSnapshot("codex-cli 0.160.1"),
    opencode: makeFakeSnapshot({
      driver: "opencode",
      install: { installed: false, path: null, source: null, version: null },
      status: "error",
    }),
  };
  children = [];
  spawned = [];
  spawnedEnv = [];
});

describe("engine maintenance service", () => {
  it("reports what can be updated", async () => {
    const { service } = createHarness();
    expect(await service.status(USER, "codex")).toEqual(
      expect.objectContaining({
        canUpdate: true,
        currentVersion: "0.160.1",
        installed: true,
        latestVersion: "0.161.0",
        running: false,
        updateChecksEnabled: true,
        updateCommand: NPM_COMMAND,
        updateOwner: "npm global",
        versionStatus: "behind_latest",
      }),
    );
  });

  it("runs the confirmed update, then re-probes on a fresh runtime", async () => {
    const { dispose, invalidate, refresh, runner, service } = createHarness();

    const started = await service.update(USER, "codex", {
      expectedCommand: NPM_COMMAND,
    });
    expect(started.running).toBe(true);
    await until(() => children.length === 1);
    expect(spawned[0]).toEqual({
      args: [
        "install",
        "-g",
        "--prefix",
        "/usr/local",
        "--allow-scripts=@openai/codex",
        "@openai/codex@0.161.0",
      ],
      command: "/usr/local/bin/npm",
    });

    snapshots.codex = codexSnapshot("codex-cli 0.161.0");
    children[0]!.emit("close", 0);
    await runner.whenSettled({ instanceId: "codex", userId: USER });

    expect(invalidate).toHaveBeenCalledWith({ driver: "codex", id: "codex" });
    expect(dispose).toHaveBeenCalledWith("codex");
    expect(refresh).toHaveBeenCalledWith(USER, "codex", "update");
    expect(
      runner.get({ instanceId: "codex", userId: USER })?.updateState,
    ).toEqual(
      expect.objectContaining({
        message: "Codex updated to 0.161.0.",
        status: "succeeded",
      }),
    );
  });

  it("reports an update that left the old version in place", async () => {
    const { runner, service } = createHarness();
    await service.update(USER, "codex", { expectedCommand: NPM_COMMAND });
    await until(() => children.length === 1);
    children[0]!.emit("close", 0);
    await runner.whenSettled({ instanceId: "codex", userId: USER });
    expect(
      runner.get({ instanceId: "codex", userId: USER })?.updateState,
    ).toEqual(expect.objectContaining({ status: "unchanged" }));
  });

  it("updates the shared install without the instance's home or secrets", async () => {
    const { runner, service } = createHarness();
    snapshots["codex-work"] = makeFakeSnapshot({
      driver: "codex",
      install: {
        installed: true,
        path: "/Users/me/.local/bin/codex",
        source: "managed-path",
        version: "codex-cli 0.160.1",
      },
    });

    const status = await service.status(USER, "codex-work");
    expect(status.updateCommand).toBe("/Users/me/.local/bin/codex update");
    await service.update(USER, "codex-work", {
      expectedCommand: "/Users/me/.local/bin/codex update",
    });
    await until(() => children.length === 1);

    expect(spawned[0]).toEqual({
      args: ["update"],
      command: "/Users/me/.local/bin/codex",
    });
    const env = spawnedEnv[0]!;
    // The standalone tree's own CODEX_HOME, not the instance's.
    expect(env.CODEX_HOME).toBe("/Users/me/.codex");
    // Unset explicitly, so the spawn does not fill it in either.
    expect("OPENAI_API_KEY" in env).toBe(true);
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.HTTPS_PROXY).toBe("http://proxy.test:8080");
    expect(env.PATH).toBe("/usr/local/bin");

    children[0]!.emit("close", 0);
    await runner.whenSettled({ instanceId: "codex-work", userId: USER });
  });

  it("refuses a command the user did not confirm", async () => {
    const { service } = createHarness();
    const error = await service
      .update(USER, "codex", { expectedCommand: "npm install -g evil" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EngineMaintenanceError);
    expect((error as InstanceType<typeof EngineMaintenanceError>).code).toBe(
      "changed",
    );
    expect(spawned).toEqual([]);
  });

  it("refuses a second operation while one runs", async () => {
    const { runner, service } = createHarness();
    await service.update(USER, "codex", { expectedCommand: NPM_COMMAND });
    const error = await service
      .update(USER, "codex", { expectedCommand: NPM_COMMAND })
      .catch((caught: unknown) => caught);
    expect((error as InstanceType<typeof EngineMaintenanceError>).code).toBe(
      "busy",
    );
    await until(() => children.length === 1);
    await service.cancel(USER, "codex");
    expect(
      runner.get({ instanceId: "codex", userId: USER })?.updateState?.message,
    ).toBe("Cancelled.");
  });

  it("installs a missing CLI with the confirmed option", async () => {
    const { runner, service } = createHarness();
    const status = await service.status(USER, "opencode");
    const option = status.installOptions.find((entry) => entry.id === "npm")!;
    expect(option).toEqual(
      expect.objectContaining({
        available: true,
        command: "npm install -g --allow-scripts=opencode-ai opencode-ai",
      }),
    );

    await service.install(USER, "opencode", {
      expectedCommand: option.command,
      optionId: "npm",
    });
    await until(() => children.length === 1);
    expect(spawned[0]).toEqual({
      args: ["install", "-g", "--allow-scripts=opencode-ai", "opencode-ai"],
      command: "/usr/local/bin/npm",
    });

    snapshots.opencode = makeFakeSnapshot({
      driver: "opencode",
      install: {
        installed: true,
        path: "/usr/local/bin/opencode",
        source: "managed-path",
        version: "1.18.35",
      },
    });
    children[0]!.emit("close", 0);
    await runner.whenSettled({ instanceId: "opencode", userId: USER });
    expect(runner.get({ instanceId: "opencode", userId: USER })).toEqual(
      expect.objectContaining({
        action: "install",
        updateState: expect.objectContaining({
          message: "OpenCode 1.18.35 is installed.",
          status: "succeeded",
        }),
      }),
    );
  });

  it("refuses unavailable install options and unknown instances", async () => {
    const { service } = createHarness();
    await expect(
      service.install(USER, "opencode", {
        expectedCommand:
          "npm install -g --allow-scripts=@opencode/cli @opencode/cli",
        optionId: "npm-v2",
      }),
    ).rejects.toThrow("does not support it yet");
    await expect(
      service.install(USER, "codex", {
        expectedCommand: null,
        optionId: "npm",
      }),
    ).rejects.toThrow("already installed");
    await expect(service.status(USER, "nope")).rejects.toThrow(
      'Engine instance "nope" does not exist.',
    );
  });
});
