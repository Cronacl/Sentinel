import "server-only";

import { createHash } from "node:crypto";

import type { ResolvedEngineInstance } from "../contract";
import { registerInstanceResourceHooks } from "../platform/instance-resources";
import { createLogger } from "@/lib/logger";
import {
  createProcessPool,
  type ProcessPool,
} from "@/lib/runtime/process/pool";

import type { PiBinary } from "./binary";
import { PiRpcProcess, type PiRpcProcessOptions } from "./rpc";

// Launching `pi --mode rpc` (design §4; t3code packages/provider-pi/src/
// server/mcpInjection.ts, MIT) and the pool that keeps one process per
// (instance, thread) between turns. Sentinel owns the mode and the session
// (it switches sessions over RPC), so launch arguments that pick either are
// refused; the user's other arguments (provider, model, tools, extensions)
// follow, then Sentinel's permission extension.

const log = createLogger("PiLaunch");

/** Arguments that pick the mode or the session, or make Pi exit at once. */
const RESERVED_ARGUMENTS = [
  "--continue",
  "-c",
  "--export",
  "--fork",
  "--help",
  "-h",
  "--list-models",
  "--mode",
  "--no-session",
  "--print",
  "-p",
  "--resume",
  "-r",
  "--session",
  "--session-id",
  "--version",
  "-v",
] as const;

export class PiLaunchArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiLaunchArgumentError";
  }
}

/** The instance's launch arguments, or why they cannot be used. */
export function validatePiLaunchArgs(args: readonly string[]) {
  for (const arg of args) {
    if (arg === "--") {
      break;
    }
    const reserved = RESERVED_ARGUMENTS.find(
      (name) =>
        arg === name || (name.startsWith("--") && arg.startsWith(`${name}=`)),
    );
    if (reserved) {
      throw new PiLaunchArgumentError(
        `Pi launch argument "${reserved}" is managed by Sentinel. Remove it from the instance's launch arguments.`,
      );
    }
  }
  return [...args];
}

export type PiLaunch = {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
};

export function buildPiLaunch(input: {
  binary: PiBinary;
  cwd: string;
  /** No session file (status probes). */
  ephemeral?: boolean;
  /** Sentinel's permission extension (runs; probes load none of Sentinel's). */
  extensionPath?: string | null;
  instance: Pick<ResolvedEngineInstance, "config" | "env">;
}): PiLaunch {
  const userArgs = validatePiLaunchArgs(input.instance.config.launchArgs ?? []);
  return {
    args: [
      "--mode",
      "rpc",
      ...(input.ephemeral ? ["--no-session"] : []),
      ...userArgs,
      ...(input.extensionPath ? ["--extension", input.extensionPath] : []),
    ],
    command: input.binary.path,
    cwd: input.cwd,
    // The instance env wins; the binary's env only contributes the PATH it
    // was found on (a login shell's).
    env: {
      ...input.instance.env,
      PATH: input.binary.env.PATH ?? input.instance.env.PATH,
    },
  };
}

/** What makes a running process unsuitable for a turn when it changes. */
export function piLaunchFingerprint(launch: PiLaunch) {
  const env = Object.entries(launch.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256")
    .update(JSON.stringify([launch.command, launch.args, launch.cwd, env]))
    .digest("hex");
}

export function startPiProcess(
  launch: PiLaunch,
  options: Pick<
    PiRpcProcessOptions,
    "instanceId" | "onStderrLine" | "register" | "spawn"
  > = {},
) {
  return PiRpcProcess.start({
    ...options,
    args: launch.args,
    command: launch.command,
    cwd: launch.cwd,
    env: launch.env,
    label: "Pi",
    onStdoutNoise: (line) =>
      log.debug("pi_stdout_noise", { line: line.slice(0, 200) }),
  });
}

export function piPoolKey(instanceId: string, threadId: string) {
  return `${instanceId}::${threadId}`;
}

const globalForPi = globalThis as unknown as {
  __sentinelPiProcessPool?: ProcessPool<PiRpcProcess>;
};

/** One pool per server process (on globalThis so dev-server reloads share it). */
export function getPiProcessPool(): ProcessPool<PiRpcProcess> {
  if (!globalForPi.__sentinelPiProcessPool) {
    const pool = createProcessPool<PiRpcProcess>({
      onDisposeError: (error, key) =>
        log.warn("pi_process_dispose_failed", { error, key }),
    });
    globalForPi.__sentinelPiProcessPool = pool;
    // Removing or disabling an instance ends its processes (shutdown, all).
    registerInstanceResourceHooks("pi-processes", {
      dispose: (instanceId) => disposePiInstanceProcesses(instanceId),
      disposeAll: () => pool.disposeAll(),
    });
  }
  return globalForPi.__sentinelPiProcessPool;
}

/** Ends every process an instance runs (instance removed, disabled or changed). */
export async function disposePiInstanceProcesses(instanceId: string) {
  const pool = getPiProcessPool();
  await Promise.all(
    pool
      .keys()
      .filter((key) => key.startsWith(`${instanceId}::`))
      .map((key) => pool.dispose(key)),
  );
}
