import "server-only";

import { createHash } from "node:crypto";

import { registerInstanceResourceHooks } from "@/lib/ai/chat/engines/platform/instance-resources";
import { createLogger } from "@/lib/logger";
import {
  createProcessPool,
  type ProcessPool,
} from "@/lib/runtime/process/pool";

import {
  startOpenCodeServerProcess,
  type OpenCodeServerProcess,
} from "./server";
import { classifyOpenCodeVersion } from "./version";

// One long-lived `opencode serve` per engine instance (design
// acp-and-agents §5; critique §1 "instance resources"). Both generations
// serve every directory from one process (1.x per request through the
// directory header, 2.x per session location), so every thread of an
// instance shares it, and a turn no longer pays a server start.
//
// - Reused while its fingerprint (the instance's runtime configuration,
//   binary, version and, on 1.x, the forwarded MCP servers) holds; a
//   changed one is replaced once its last turn released it.
// - Reaped 15 minutes after the last turn released it.
// - A server that exited is dropped; the next turn starts a new one.
// - Removing or disabling the instance ends it, and shutdown ends all
//   (the pid registry also ends what a crashed Sentinel left behind,
//   because spawnManagedProcess records every server).

const log = createLogger("OpenCodeServerPool");

export const OPENCODE_SERVER_IDLE_TTL_MS = 15 * 60 * 1_000;

export type PooledOpenCodeServer = OpenCodeServerProcess & {
  dispose(): Promise<void>;
  fingerprint: string;
  /**
   * 2.x: the forwarded MCP servers added per directory at runtime (their
   * key and names), which the server forgets when it exits.
   */
  forwardedMcp: Map<string, { key: string; names: string[] }>;
};

export type OpenCodeServerLease = {
  release(): void;
  server: PooledOpenCodeServer;
};

export type OpenCodeServerLaunch = {
  binaryPath: string;
  env: NodeJS.ProcessEnv;
  /** The instance id (pool slot). */
  instanceId: string;
  /**
   * 1.x: the key of the forwarded MCP servers in its
   * OPENCODE_CONFIG_CONTENT (a change starts a new server).
   */
  mcpKey?: string;
  /** getInstanceRuntimeKey(instance): its configuration. */
  runtimeKey: string;
  /** `--version` output; picks the password variable. */
  version: string | null;
};

export function openCodeServerFingerprint(launch: OpenCodeServerLaunch) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        launch.runtimeKey,
        launch.binaryPath,
        launch.version,
        ...(launch.mcpKey ? [launch.mcpKey] : []),
      ]),
    )
    .digest("hex");
}

const globalForOpenCode = globalThis as unknown as {
  __sentinelOpenCodeServerPool?: ProcessPool<PooledOpenCodeServer>;
};

async function disposeServer(server: OpenCodeServerProcess) {
  server.close();
  // Bounded: the kill escalates to SIGKILL after its grace period.
  await Promise.race([
    server.exited,
    new Promise((resolve) => setTimeout(resolve, 5_000).unref?.()),
  ]);
}

/** One pool per server process (on globalThis so dev reloads share it). */
export function getOpenCodeServerPool(): ProcessPool<PooledOpenCodeServer> {
  if (!globalForOpenCode.__sentinelOpenCodeServerPool) {
    const pool = createProcessPool<PooledOpenCodeServer>({
      idleTtlMs: OPENCODE_SERVER_IDLE_TTL_MS,
      onDisposeError: (error, key) =>
        log.warn("opencode_server_dispose_failed", { error, key }),
    });
    globalForOpenCode.__sentinelOpenCodeServerPool = pool;
    registerInstanceResourceHooks("opencode-servers", {
      dispose: (instanceId) => pool.dispose(instanceId),
      disposeAll: () => pool.disposeAll(),
    });
  }
  return globalForOpenCode.__sentinelOpenCodeServerPool;
}

function isAlive(server: PooledOpenCodeServer | null) {
  return server !== null && !server.hasExited();
}

/**
 * The instance's server for one turn, started when none is running (or
 * the running one is for another configuration or exited). Release the
 * lease when the turn ends; the server then idles until it is reaped.
 */
export async function acquireOpenCodeServer(
  launch: OpenCodeServerLaunch,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OpenCodeServerLease> {
  const pool = getOpenCodeServerPool();
  const key = launch.instanceId;
  const fingerprint = openCodeServerFingerprint(launch);
  const current = pool.peek(key);
  if (current && !isAlive(current)) {
    // Crashed between turns: never hand out a dead server.
    await pool.dispose(key);
  }

  const lease = await pool.acquire(key, fingerprint, async () => {
    const started = await startOpenCodeServerProcess({
      binaryPath: launch.binaryPath,
      env: launch.env,
      generation: classifyOpenCodeVersion(launch.version)?.generation ?? null,
      instanceId: launch.instanceId,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    const pooled: PooledOpenCodeServer = {
      ...started,
      dispose: () => disposeServer(started),
      fingerprint,
      forwardedMcp: new Map(),
    };
    void started.exited.then(({ code, signal }) => {
      if (pool.peek(key) !== pooled) return;
      log.warn("opencode_server_exited", { code, instanceId: key, signal });
      void pool.dispose(key);
    });
    return pooled;
  });
  return { release: lease.release, server: lease.resource };
}

/**
 * The instance's running server for `launch`, without keeping it alive
 * (status probes read through it instead of starting their own).
 */
export function peekOpenCodeServer(
  launch: OpenCodeServerLaunch,
): PooledOpenCodeServer | null {
  const server = getOpenCodeServerPool().peek(launch.instanceId);
  return isAlive(server) &&
    server!.fingerprint === openCodeServerFingerprint(launch)
    ? server
    : null;
}

/** Ends an instance's server (it was removed, disabled or reconfigured). */
export async function disposeOpenCodeServer(instanceId: string) {
  await getOpenCodeServerPool().dispose(instanceId);
}

export async function disposeAllOpenCodeServers() {
  await getOpenCodeServerPool().disposeAll();
}
