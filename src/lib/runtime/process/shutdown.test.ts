import { EventEmitter } from "node:events";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  installAgentShutdownHandlers,
  shutdownAgentProcesses,
  sweepStaleAgentProcesses,
} = await import("./shutdown");

function createFakeProcess() {
  const emitter = new EventEmitter();
  const exit = mock((_code?: number) => undefined as never);
  return Object.assign(emitter, { exit });
}

function createRegistry() {
  return {
    killAllSync: mock((_signal: NodeJS.Signals) => 1),
  };
}

describe("installAgentShutdownHandlers", () => {
  it("signals agents on SIGTERM and exits like the default when nothing else listens", () => {
    const target = createFakeProcess();
    const registry = createRegistry();

    expect(
      installAgentShutdownHandlers({
        process: target as unknown as NodeJS.Process,
        registry,
      }),
    ).toBe(true);
    target.emit("SIGTERM", "SIGTERM");

    expect(registry.killAllSync.mock.calls).toEqual([["SIGTERM"]]);
    expect(target.exit.mock.calls).toEqual([[143]]);
  });

  it("leaves exiting to another handler (Next's server) when there is one", () => {
    const target = createFakeProcess();
    const registry = createRegistry();
    const nextHandler = mock(() => {});
    target.on("SIGINT", nextHandler);

    installAgentShutdownHandlers({
      process: target as unknown as NodeJS.Process,
      registry,
    });
    target.emit("SIGINT", "SIGINT");

    expect(registry.killAllSync.mock.calls).toEqual([["SIGTERM"]]);
    expect(nextHandler).toHaveBeenCalled();
    expect(target.exit).not.toHaveBeenCalled();
  });

  it("force-kills whatever is still registered when the process exits", () => {
    const target = createFakeProcess();
    const registry = createRegistry();

    installAgentShutdownHandlers({
      process: target as unknown as NodeJS.Process,
      registry,
    });
    target.emit("exit", 0);

    expect(registry.killAllSync.mock.calls).toEqual([["SIGKILL"]]);
  });

  it("installs once per process and survives a failing registry", () => {
    const target = createFakeProcess();
    const registry = {
      killAllSync: mock(() => {
        throw new Error("boom");
      }),
    };
    target.on("SIGTERM", () => {});

    installAgentShutdownHandlers({
      process: target as unknown as NodeJS.Process,
      registry,
    });
    expect(
      installAgentShutdownHandlers({
        process: target as unknown as NodeJS.Process,
        registry,
      }),
    ).toBe(false);

    expect(() => target.emit("SIGTERM", "SIGTERM")).not.toThrow();
    expect(() => target.emit("exit", 0)).not.toThrow();
    expect(target.listenerCount("SIGTERM")).toBe(2);
    expect(target.listenerCount("exit")).toBe(1);
  });
});

describe("shutdown helpers", () => {
  it("delegates graceful shutdown and the startup sweep to the registry", async () => {
    const registry = {
      shutdown: mock(async (_options: { graceMs?: number }) => ({
        forced: 0,
        signalled: 2,
      })),
      sweepStale: mock(async () => ({ killed: 1, pruned: 3 })),
    };

    expect(await shutdownAgentProcesses({ graceMs: 250, registry })).toEqual({
      forced: 0,
      signalled: 2,
    });
    expect(registry.shutdown.mock.calls).toEqual([[{ graceMs: 250 }]]);
    expect(await sweepStaleAgentProcesses({ registry })).toEqual({
      killed: 1,
      pruned: 3,
    });
  });
});
