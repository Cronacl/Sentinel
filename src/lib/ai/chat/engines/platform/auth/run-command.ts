import "server-only";

import type { ChildProcess, SpawnOptions } from "node:child_process";

import type { KillTreeDeps } from "@/lib/runtime/process/kill-tree";
import { spawnManagedProcess } from "@/lib/runtime/process/spawn";

// Non-interactive sign-out commands (`claude auth logout`, `agent logout`)
// run by the server with the instance's environment. Output is drained and
// dropped: it may name the account, and only the exit code matters.

const DEFAULT_TIMEOUT_MS = 20_000;

export type RunAuthCommandInput = {
  args: readonly string[];
  /** Injected in tests (process group kill). */
  killDeps?: KillTreeDeps;
  command: string;
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Injected in tests. */
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
  timeoutMs?: number;
};

/** Resolves the exit code; null when it was killed (timeout or abort). */
export function runAuthCommand(
  input: RunAuthCommandInput,
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnManagedProcess({
        args: input.args,
        command: input.command,
        env: input.env,
        extendEnv: false,
        label: "engine auth",
        register: false,
        stdio: ["ignore", "pipe", "pipe"],
        ...input.killDeps,
        ...(input.spawn ? { spawn: input.spawn } : {}),
      });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", stop);
      resolve({ exitCode });
    };
    const stop = () => {
      child.kill();
      finish(null);
    };

    child.stdout?.resume();
    child.stderr?.resume();
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", stop);
        reject(error);
      }
    });
    child.once("exit", (code) =>
      finish(typeof code === "number" ? code : null),
    );

    const timer = setTimeout(stop, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (input.signal?.aborted) {
      stop();
      return;
    }
    input.signal?.addEventListener("abort", stop, { once: true });
  });
}
