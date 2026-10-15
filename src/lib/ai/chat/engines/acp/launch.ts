import "server-only";

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { registerInstanceResourceHooks } from "@/lib/ai/chat/engines/platform/instance-resources";
import { createLogger } from "@/lib/logger";
import type { PermissionMode } from "@/server/db/enums";
import {
  createProcessPool,
  type ProcessPool,
} from "@/lib/runtime/process/pool";

import { AcpAgentProcess, type AcpProcessOptions } from "./connection";
import type {
  AcpAgentDescriptor,
  AcpLaunchPurpose,
  AcpResolvedBinary,
} from "./descriptor";

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
  /**
   * Gives every process its own temp directory under `root`, named in
   * `variables` (TMPDIR; TEMP and TMP on Windows), removed when it exits.
   * The fingerprint sees only `root`, so pooled processes stay reusable.
   */
  tempDirectory?: { root: string; variables: readonly string[] };
};

const globalForTemp = globalThis as unknown as {
  __sentinelAcpLiveTempDirectories?: Set<string>;
};

/** The per-process temp directories of processes still running. */
function liveTempDirectories() {
  globalForTemp.__sentinelAcpLiveTempDirectories ??= new Set();
  return globalForTemp.__sentinelAcpLiveTempDirectories;
}

/**
 * Removes what `root` holds besides the directories of running processes:
 * leftovers of processes this server did not see exit (killed, or from an
 * earlier run). Best effort.
 */
export async function sweepAcpTempDirectories(root: string) {
  const entries = await readdir(root).catch(() => [] as string[]);
  const live = liveTempDirectories();
  await Promise.all(
    entries
      .map((entry) => path.join(root, entry))
      .filter((entry) => !live.has(entry))
      .map((entry) =>
        rm(entry, { force: true, recursive: true }).catch((error) =>
          log.debug("acp_temp_sweep_failed", { entry, error }),
        ),
      ),
  );
}

/** The launch with its own temp directory (and how to release it), if it asks for one. */
function withProcessTempDirectory(launch: AcpLaunch) {
  if (!launch.tempDirectory) {
    return { env: launch.env, release: () => {} };
  }
  const { root, variables } = launch.tempDirectory;
  mkdirSync(root, { mode: 0o700, recursive: true });
  const directory = mkdtempSync(path.join(root, "run-"));
  const live = liveTempDirectories();
  live.add(directory);
  let released = false;
  return {
    env: {
      ...launch.env,
      ...Object.fromEntries(variables.map((name) => [name, directory])),
    },
    release: () => {
      if (released) return;
      released = true;
      void rm(directory, { force: true, recursive: true })
        .catch((error) =>
          log.debug("acp_temp_cleanup_failed", { directory, error }),
        )
        .finally(() => live.delete(directory));
    },
  };
}

export function buildAcpLaunch(
  descriptor: Pick<AcpAgentDescriptor, "launchArgs" | "launchArgsFor">,
  instance: Pick<ResolvedEngineInstance, "config" | "env" | "envOverrides">,
  binary: AcpResolvedBinary,
  cwd: string,
  options: { permissionMode?: PermissionMode } = {},
): AcpLaunch {
  const args =
    descriptor.launchArgsFor?.({
      permissionMode: options.permissionMode ?? "default",
    }) ?? descriptor.launchArgs;
  return {
    args: [
      ...(binary.launch?.args ?? args),
      ...(instance.config.launchArgs ?? []),
    ],
    command: binary.launch?.command ?? binary.path,
    cwd,
    // The instance env wins (over the launch's own variables too); the
    // binary's env only contributes the PATH it was found on (a login
    // shell's).
    env: {
      ...instance.env,
      ...binary.launch?.env,
      ...instance.envOverrides,
      PATH: binary.env.PATH ?? instance.env.PATH,
    },
  };
}

/** The descriptor's own launch (prepareLaunch), else buildAcpLaunch. */
export async function resolveAcpLaunch(
  descriptor: Pick<
    AcpAgentDescriptor,
    "launchArgs" | "launchArgsFor" | "prepareLaunch"
  >,
  instance: ResolvedEngineInstance,
  binary: AcpResolvedBinary,
  cwd: string,
  purpose: AcpLaunchPurpose,
  options: { permissionMode?: PermissionMode } = {},
): Promise<AcpLaunch> {
  return descriptor.prepareLaunch
    ? await descriptor.prepareLaunch({ binary, cwd, instance, purpose })
    : buildAcpLaunch(descriptor, instance, binary, cwd, options);
}

const LAUNCH_KEY = "acp.launch";

/** The launch a process was started with (set by startAcpProcess). */
export function getAcpProcessLaunch(process: AcpAgentProcess) {
  return (process.state.get(LAUNCH_KEY) as AcpLaunch | undefined) ?? null;
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
  // Lines only arrive after the process exists: the handlers get it. They
  // run inside the pipes' "data" events, where a throw would escape to the
  // server process: it is logged and the line dropped.
  let started: AcpAgentProcess | null = null;
  const withProcess = (
    handler: ((line: string, process: AcpAgentProcess) => void) | undefined,
  ) =>
    handler
      ? (line: string) => {
          if (!started) return;
          try {
            handler.call(descriptor, line, started);
          } catch (error) {
            log.warn("acp_line_handler_failed", {
              agent: descriptor.id,
              error,
            });
          }
        }
      : undefined;
  const temp = withProcessTempDirectory(launch);
  try {
    started = AcpAgentProcess.start({
      ...options,
      args: launch.args,
      command: launch.command,
      cwd: launch.cwd,
      env: temp.env,
      label: descriptor.processLabel,
      normalizeInbound: descriptor.normalizeInbound?.bind(descriptor),
      notificationMethods: Object.keys(descriptor.extNotifications ?? {}),
      onStderrLine: withProcess(descriptor.onStderrLine),
      onStdoutNoise: withProcess(descriptor.onStdoutNoise),
      // Vendor methods some agents send as requests and others as
      // notifications are served both ways.
      requestMethods: [
        ...Object.keys(descriptor.extRequests ?? {}),
        ...Object.keys(descriptor.extNotifications ?? {}),
      ],
    });
  } catch (error) {
    temp.release();
    throw error;
  }
  void started.exited.then(temp.release, temp.release);
  started.state.set(LAUNCH_KEY, launch);
  return started;
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
