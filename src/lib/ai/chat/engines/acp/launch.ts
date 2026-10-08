import "server-only";

import { createHash } from "node:crypto";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { registerInstanceResourceHooks } from "@/lib/ai/chat/engines/platform/instance-resources";
import { createLogger } from "@/lib/logger";
import {
  createProcessPool,
  type ProcessPool,
} from "@/lib/runtime/process/pool";

import { AcpAgentProcess, type AcpProcessOptions } from "./connection";
import type { AcpAgentDescriptor, AcpResolvedBinary } from "./descriptor";

// Starting agent processes, and the pool that keeps one per (instance,
// thread) alive between turns (design §1.4, §2.3). A thread's process is
// reused while its launch fingerprint (binary, arguments, cwd, environment)
// holds, reaped after it sat idle, and replaced when the fingerprint
// changes; the next turn then resumes the persisted session.

const log = createLogger("AcpLaunch");

export type AcpLaunch = {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
};

export function buildAcpLaunch(
  descriptor: Pick<AcpAgentDescriptor, "launchArgs">,
  instance: Pick<ResolvedEngineInstance, "config" | "env">,
  binary: AcpResolvedBinary,
  cwd: string,
): AcpLaunch {
  return {
    args: [...descriptor.launchArgs, ...(instance.config.launchArgs ?? [])],
    command: binary.path,
    cwd,
    // The instance env wins; the binary's env only contributes the PATH it
    // was found on (a login shell's).
    env: { ...instance.env, PATH: binary.env.PATH ?? instance.env.PATH },
  };
}

/** What makes a running process unsuitable for a turn when it changes. */
export function acpLaunchFingerprint(launch: AcpLaunch) {
  const env = Object.entries(launch.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256")
    .update(JSON.stringify([launch.command, launch.args, launch.cwd, env]))
    .digest("hex");
}

export function startAcpProcess(
  descriptor: AcpAgentDescriptor,
  launch: AcpLaunch,
  options: Pick<
    AcpProcessOptions,
    "instanceId" | "register" | "spawn" | "timers"
  > = {},
) {
  return AcpAgentProcess.start({
    ...options,
    args: launch.args,
    command: launch.command,
    cwd: launch.cwd,
    env: launch.env,
    label: descriptor.processLabel,
    notificationMethods: Object.keys(descriptor.extNotifications ?? {}),
    onStderrLine: descriptor.onStderrLine,
    onStdoutNoise: descriptor.onStdoutNoise,
    // Vendor methods some agents send as requests and others as
    // notifications are served both ways.
    requestMethods: [
      ...Object.keys(descriptor.extRequests ?? {}),
      ...Object.keys(descriptor.extNotifications ?? {}),
    ],
  });
}

export function acpPoolKey(instanceId: string, threadId: string) {
  return `${instanceId}::${threadId}`;
}

const globalForAcp = globalThis as unknown as {
  __sentinelAcpProcessPool?: ProcessPool<AcpAgentProcess>;
};

/** One pool per server process (on globalThis so dev-server reloads share it). */
export function getAcpProcessPool(): ProcessPool<AcpAgentProcess> {
  if (!globalForAcp.__sentinelAcpProcessPool) {
    const pool = createProcessPool<AcpAgentProcess>({
      onDisposeError: (error, key) =>
        log.warn("acp_process_dispose_failed", { error, key }),
    });
    globalForAcp.__sentinelAcpProcessPool = pool;
    // Removing or disabling an instance ends its agents (and shutdown, all).
    registerInstanceResourceHooks("acp-processes", {
      dispose: (instanceId) => disposeAcpInstanceProcesses(instanceId),
      disposeAll: () => pool.disposeAll(),
    });
  }
  return globalForAcp.__sentinelAcpProcessPool;
}

/** Ends every process an instance runs (instance removed, disabled or changed). */
export async function disposeAcpInstanceProcesses(instanceId: string) {
  const pool = getAcpProcessPool();
  await Promise.all(
    pool
      .keys()
      .filter((key) => key.startsWith(`${instanceId}::`))
      .map((key) => pool.dispose(key)),
  );
}
