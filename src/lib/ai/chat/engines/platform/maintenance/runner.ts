import "server-only";

import type { ChildProcess } from "node:child_process";
import os from "node:os";

import type { ManagedInstallProgress } from "@/lib/runtime/managed-install/install";
import {
  spawnManagedProcess,
  type ManagedSpawnOptions,
} from "@/lib/runtime/process/spawn";

import type { EngineInstallState, EngineUpdateState } from "../../contract";
import { emitEngineEvent, type EngineEventInput } from "../events";

// Runs the install and update commands the user confirmed in Settings →
// Engines (after t3code's providerMaintenanceRunner.ts, MIT):
// - one operation per instance at a time; operations whose commands share a
//   lock key (one npm prefix, Homebrew, one CLI's own updater) queue;
// - the command is spawned without a shell (spawnManagedProcess: its own
//   process group, registered for shutdown), with output streamed to the
//   instance's updateState (the last 10 000 characters) as maintenance
//   events, throttled;
// - cancellation and a timeout end the whole process tree;
// - after a clean exit the caller verifies the result (re-probes the
//   instance) and decides between succeeded and unchanged.
// Managed downloads (P13) report through installState instead.

export const MAINTENANCE_TIMEOUT_MS = 10 * 60 * 1_000;
export const MAINTENANCE_OUTPUT_MAX_CHARS = 10_000;
const PROGRESS_INTERVAL_MS = 250;

export type MaintenanceAction = "install" | "update";

export type MaintenanceRecord = {
  action: MaintenanceAction;
  installState: EngineInstallState | null;
  running: boolean;
  updateState: EngineUpdateState | null;
};

export type MaintenanceVerification = {
  message: string;
  status: "succeeded" | "unchanged";
};

export type MaintenanceCommandRun = {
  action: MaintenanceAction;
  args: readonly string[];
  /** The command as the user confirmed it. */
  display: string;
  env: Record<string, string | undefined>;
  /** Absolute path of the program to run. */
  executable: string;
  instanceId: string;
  /** "Claude", for messages. */
  label: string;
  lockKey: string;
  verify(): Promise<MaintenanceVerification>;
};

export type MaintenanceManagedRun = {
  instanceId: string;
  label: string;
  lockKey: string;
  run(input: {
    onProgress(progress: ManagedInstallProgress): void;
    signal: AbortSignal;
  }): Promise<void>;
  verify(): Promise<MaintenanceVerification>;
};

export class MaintenanceBusyError extends Error {
  constructor(label: string) {
    super(`${label} is already being installed or updated.`);
  }
}

export type MaintenanceRunnerDeps = {
  clearTimeout?: (handle: unknown) => void;
  emit?: (event: EngineEventInput) => void;
  now?: () => number;
  outputMaxChars?: number;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  spawn?: (options: ManagedSpawnOptions) => ChildProcess;
  timeoutMs?: number;
};

export interface MaintenanceRunner {
  cancel(instanceId: string): boolean;
  get(instanceId: string): MaintenanceRecord | null;
  isRunning(instanceId: string): boolean;
  runCommand(run: MaintenanceCommandRun): EngineUpdateState;
  runManaged(run: MaintenanceManagedRun): EngineInstallState;
  /** Resolves once the instance's current operation settled (tests). */
  whenSettled(instanceId: string): Promise<void>;
}

type Operation = {
  controller: AbortController;
  done: Promise<void>;
  record: MaintenanceRecord;
};

function toError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createMaintenanceRunner(
  deps: MaintenanceRunnerDeps = {},
): MaintenanceRunner {
  const emit = deps.emit ?? ((event) => void emitEngineEvent(event));
  const now = deps.now ?? (() => Date.now());
  const spawn = deps.spawn ?? spawnManagedProcess;
  const schedule =
    deps.setTimeout ??
    ((callback: () => void, ms: number) => {
      const handle = setTimeout(callback, ms);
      handle.unref?.();
      return handle;
    });
  const unschedule =
    deps.clearTimeout ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timeoutMs = deps.timeoutMs ?? MAINTENANCE_TIMEOUT_MS;
  const outputMaxChars = deps.outputMaxChars ?? MAINTENANCE_OUTPUT_MAX_CHARS;

  const operations = new Map<string, Operation>();
  const locks = new Map<string, Promise<void>>();
  const iso = () => new Date(now()).toISOString();

  function setUpdateState(
    instanceId: string,
    record: MaintenanceRecord,
    state: EngineUpdateState,
  ) {
    record.updateState = state;
    emit({ instanceId, type: "maintenance", updateState: state });
  }

  function setInstallState(
    instanceId: string,
    record: MaintenanceRecord,
    state: EngineInstallState,
  ) {
    record.installState = state;
    emit({ installState: state, instanceId, type: "maintenance" });
  }

  /** Runs `task` once the lock is free; the lock is held until it settles. */
  function withLock(lockKey: string, task: () => Promise<void>) {
    const previous = locks.get(lockKey);
    const run = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(task);
    const tail = run.catch(() => undefined);
    locks.set(lockKey, tail);
    void tail.then(() => {
      if (locks.get(lockKey) === tail) {
        locks.delete(lockKey);
      }
    });
    return { queued: previous !== undefined, run };
  }

  function begin(
    instanceId: string,
    label: string,
    action: MaintenanceAction,
  ): Operation {
    if (operations.get(instanceId)?.record.running) {
      throw new MaintenanceBusyError(label);
    }
    const operation: Operation = {
      controller: new AbortController(),
      done: Promise.resolve(),
      record: {
        action,
        installState: null,
        running: true,
        updateState: null,
      },
    };
    operations.set(instanceId, operation);
    return operation;
  }

  function execute(
    run: MaintenanceCommandRun,
    operation: Operation,
  ): Promise<{
    code: number | null;
    error: string | null;
    output: string;
    reason: "cancelled" | "exit" | "timeout";
  }> {
    return new Promise((resolve) => {
      let output = "";
      let lastEmit = Number.NEGATIVE_INFINITY;
      let settled = false;
      let reason: "cancelled" | "exit" | "timeout" = "exit";
      const startedAt = iso();
      const running = (message: string): EngineUpdateState => ({
        finishedAt: null,
        message,
        output: output || null,
        startedAt,
        status: "running",
      });
      const runningMessage = `${run.action === "install" ? "Installing" : "Updating"} ${run.label}: ${run.display}`;
      setUpdateState(run.instanceId, operation.record, running(runningMessage));

      let child: ChildProcess;
      try {
        child = spawn({
          args: [...run.args],
          command: run.executable,
          cwd: os.homedir(),
          env: {
            ...run.env,
            HOMEBREW_NO_ENV_HINTS: "1",
            NO_COLOR: "1",
            npm_config_fund: "false",
            npm_config_update_notifier: "false",
          },
          instanceId: run.instanceId,
          label: `engine ${run.action}`,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolve({ code: null, error: toError(error), output, reason });
        return;
      }

      const append = (chunk: Buffer | string) => {
        output = `${output}${chunk.toString()}`;
        if (output.length > outputMaxChars) {
          output = output.slice(output.length - outputMaxChars);
        }
        const time = now();
        if (time - lastEmit >= PROGRESS_INTERVAL_MS) {
          lastEmit = time;
          setUpdateState(
            run.instanceId,
            operation.record,
            running(runningMessage),
          );
        }
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);

      const timer = schedule(() => {
        reason = "timeout";
        child.kill();
      }, timeoutMs);
      const onAbort = () => {
        reason = "cancelled";
        child.kill();
      };
      operation.controller.signal.addEventListener("abort", onAbort, {
        once: true,
      });

      const finish = (code: number | null, error: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        unschedule(timer);
        operation.controller.signal.removeEventListener("abort", onAbort);
        resolve({ code, error, output, reason });
      };
      child.once("error", (error) => finish(null, toError(error)));
      child.once("close", (code) => finish(code, null));
    });
  }

  const runner: MaintenanceRunner = {
    cancel(instanceId) {
      const operation = operations.get(instanceId);
      if (!operation?.record.running) {
        return false;
      }
      operation.controller.abort(new Error("Cancelled."));
      if (operation.record.updateState?.status === "queued") {
        // It never started: settled now, not when the lock frees up.
        operation.record.running = false;
        setUpdateState(instanceId, operation.record, {
          finishedAt: iso(),
          message: "Cancelled before it started.",
          output: null,
          startedAt: null,
          status: "failed",
        });
      }
      return true;
    },

    get(instanceId) {
      const operation = operations.get(instanceId);
      return operation ? { ...operation.record } : null;
    },

    isRunning(instanceId) {
      return operations.get(instanceId)?.record.running ?? false;
    },

    runCommand(run) {
      const operation = begin(run.instanceId, run.label, run.action);
      const { record } = operation;

      const { queued, run: done } = withLock(run.lockKey, async () => {
        let startedAt: string | null = null;
        const finish = (
          status: EngineUpdateState["status"],
          message: string,
          output: string | null,
        ) => {
          record.running = false;
          setUpdateState(run.instanceId, record, {
            finishedAt: iso(),
            message,
            output,
            startedAt,
            status,
          });
        };

        if (operation.controller.signal.aborted) {
          if (record.running) {
            finish("failed", "Cancelled before it started.", null);
          }
          return;
        }

        try {
          startedAt = iso();
          const result = await execute(run, operation);
          const output = result.output.trim() || null;
          if (result.reason === "cancelled") {
            finish("failed", "Cancelled.", output);
            return;
          }
          if (result.reason === "timeout") {
            finish(
              "failed",
              `Timed out after ${Math.round(timeoutMs / 60_000)} minutes.`,
              output,
            );
            return;
          }
          if (result.error) {
            finish(
              "failed",
              `Could not run ${run.display}: ${result.error}`,
              output,
            );
            return;
          }
          if (result.code !== 0) {
            finish(
              "failed",
              `The command exited with code ${result.code}.`,
              output,
            );
            return;
          }
          const verified = await run.verify();
          finish(verified.status, verified.message, output);
        } catch (error) {
          finish("failed", toError(error), record.updateState?.output ?? null);
        }
      });
      operation.done = done.catch(() => undefined);

      const initial: EngineUpdateState = queued
        ? {
            finishedAt: null,
            message: "Waiting for another install or update to finish.",
            output: null,
            startedAt: null,
            status: "queued",
          }
        : (record.updateState ?? {
            finishedAt: null,
            message: null,
            output: null,
            startedAt: iso(),
            status: "running",
          });
      if (queued) {
        setUpdateState(run.instanceId, record, initial);
      }
      return initial;
    },

    runManaged(run) {
      const operation = begin(run.instanceId, run.label, "install");
      const { record } = operation;
      const state = (
        phase: EngineInstallState["phase"],
        message: string | null,
        bytes: { downloadedBytes: number; totalBytes: number | null } = {
          downloadedBytes: record.installState?.downloadedBytes ?? 0,
          totalBytes: record.installState?.totalBytes ?? null,
        },
      ): EngineInstallState => ({ ...bytes, message, phase });

      const { run: done } = withLock(run.lockKey, async () => {
        const finish = (
          phase: EngineInstallState["phase"],
          message: string | null,
        ) => {
          record.running = false;
          setInstallState(run.instanceId, record, state(phase, message));
        };
        if (operation.controller.signal.aborted) {
          finish("cancelled", "Cancelled before it started.");
          return;
        }

        let lastEmit = Number.NEGATIVE_INFINITY;
        try {
          await run.run({
            onProgress: (progress) => {
              const next = state(progress.phase, progress.message, {
                downloadedBytes: progress.downloadedBytes,
                totalBytes: progress.totalBytes,
              });
              const time = now();
              if (
                progress.phase !== record.installState?.phase ||
                time - lastEmit >= PROGRESS_INTERVAL_MS
              ) {
                lastEmit = time;
                setInstallState(run.instanceId, record, next);
              } else {
                record.installState = next;
              }
            },
            signal: operation.controller.signal,
          });
          const verified = await run.verify();
          finish(
            verified.status === "succeeded" ? "succeeded" : "failed",
            verified.message,
          );
        } catch (error) {
          if (operation.controller.signal.aborted) {
            finish("cancelled", "Cancelled.");
          } else {
            finish("failed", toError(error));
          }
        }
      });
      operation.done = done.catch(() => undefined);

      const initial = state("downloading", `Installing ${run.label}…`, {
        downloadedBytes: 0,
        totalBytes: null,
      });
      setInstallState(run.instanceId, record, initial);
      return initial;
    },

    async whenSettled(instanceId) {
      await operations.get(instanceId)?.done;
    },
  };

  return runner;
}

const globalForRunner = globalThis as unknown as {
  __sentinelEngineMaintenanceRunner?: MaintenanceRunner;
};

/** The process-wide runner (shared by dev-server module copies). */
export function getMaintenanceRunner(): MaintenanceRunner {
  globalForRunner.__sentinelEngineMaintenanceRunner ??=
    createMaintenanceRunner();
  return globalForRunner.__sentinelEngineMaintenanceRunner;
}
