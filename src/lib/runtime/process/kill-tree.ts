import "server-only";

import { execFile, spawnSync, type ChildProcess } from "node:child_process";

// Ending an agent means ending everything it started: npm launchers, shells
// wrapping `.cmd` shims and the native binaries underneath. Agents spawned by
// spawnManagedProcess lead their own process group on POSIX (detached), so
// the group is signalled; Windows has no groups or signals, so the tree is
// ended with `taskkill /T /F`.

export type KillTreeDeps = {
  /** process.kill. */
  kill?: (pid: number, signal?: NodeJS.Signals | number) => boolean;
  platform?: NodeJS.Platform;
  /** `taskkill /pid <pid> /T /F`, resolving once it succeeded. */
  taskkill?: (pid: number) => Promise<void>;
  /** Synchronous taskkill for exit and signal handlers; true on success. */
  taskkillSync?: (pid: number) => boolean;
};

export type KillTreeOptions = KillTreeDeps & {
  /**
   * The pid leads its own process group (spawned detached on POSIX): signal
   * the whole group. Ignored on Windows.
   */
  group?: boolean;
  signal?: NodeJS.Signals;
};

function runTaskkill(pid: number) {
  return new Promise<void>((resolve, reject) => {
    execFile(
      "taskkill",
      ["/pid", String(pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

function runTaskkillSync(pid: number) {
  const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function defaultKill(pid: number, signal?: NodeJS.Signals | number) {
  return process.kill(pid, signal);
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

/**
 * True while `pid` exists. EPERM means it exists but belongs to someone
 * else, which still counts as alive.
 */
export function isProcessAlive(
  pid: number,
  deps: Pick<KillTreeDeps, "kill"> = {},
) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    (deps.kill ?? defaultKill)(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function signalPosix(
  pid: number,
  signal: NodeJS.Signals,
  group: boolean,
  kill: NonNullable<KillTreeDeps["kill"]>,
) {
  if (group) {
    try {
      kill(-pid, signal);
      return true;
    } catch (error) {
      // ESRCH: the pid leads no group (not spawned detached, or the leader
      // already exited); fall back to the pid itself.
      if (errorCode(error) !== "ESRCH") {
        return false;
      }
    }
  }

  try {
    kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Signals the tree rooted at `pid`. Resolves false when nothing was
 * signalled (the process is already gone).
 */
export async function killProcessTree(
  pid: number,
  options: KillTreeOptions = {},
): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const platform = options.platform ?? process.platform;
  const kill = options.kill ?? defaultKill;

  if (platform === "win32") {
    try {
      await (options.taskkill ?? runTaskkill)(pid);
      return true;
    } catch {
      try {
        kill(pid, options.signal ?? "SIGTERM");
        return true;
      } catch {
        return false;
      }
    }
  }

  return signalPosix(
    pid,
    options.signal ?? "SIGTERM",
    options.group ?? true,
    kill,
  );
}

/**
 * killProcessTree for exit and signal handlers, which cannot wait: POSIX
 * signals are synchronous already, Windows runs taskkill synchronously.
 */
export function killProcessTreeSync(
  pid: number,
  options: KillTreeOptions = {},
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const platform = options.platform ?? process.platform;
  const kill = options.kill ?? defaultKill;

  if (platform === "win32") {
    if ((options.taskkillSync ?? runTaskkillSync)(pid)) {
      return true;
    }

    try {
      kill(pid, options.signal ?? "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }

  return signalPosix(
    pid,
    options.signal ?? "SIGTERM",
    options.group ?? true,
    kill,
  );
}

type KillableChild = Pick<
  ChildProcess,
  "exitCode" | "kill" | "pid" | "signalCode"
>;

function hasExited(child: Pick<ChildProcess, "exitCode" | "signalCode">) {
  return child.exitCode !== null || child.signalCode !== null;
}

/**
 * Routes `child.kill()` through the tree kill, so every existing caller ends
 * the whole tree: taskkill on Windows (falling back to the direct kill when
 * taskkill fails), the process group on POSIX when the child leads one.
 * Without `group`, POSIX kill() is left alone.
 */
export function installTreeKill<TChild extends KillableChild>(
  child: TChild,
  options: KillTreeDeps & { group?: boolean } = {},
) {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" && !options.group) {
    return child;
  }

  const killDirect = child.kill.bind(child);
  child.kill = (signal?: NodeJS.Signals | number) => {
    const pid = child.pid;
    if (pid == null || hasExited(child)) {
      return killDirect(signal);
    }

    if (platform === "win32") {
      void (options.taskkill ?? runTaskkill)(pid).catch(() => {
        killDirect(signal);
      });
      return true;
    }

    try {
      (options.kill ?? defaultKill)(
        -pid,
        typeof signal === "number" || signal === undefined ? "SIGTERM" : signal,
      );
      return true;
    } catch {
      return killDirect(signal);
    }
  };

  return child;
}

export type TerminateOptions = KillTreeDeps & {
  /** Time between the polite signal and SIGKILL (default 3 s). */
  graceMs?: number;
  group?: boolean;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

type TerminableChild = Pick<ChildProcess, "exitCode" | "pid" | "signalCode"> & {
  once(event: "exit", listener: () => void): unknown;
};

/**
 * SIGTERM to the tree, then SIGKILL after `graceMs` if the child has not
 * exited. Resolves once the child exited or was force-killed. Windows ends
 * the tree at once (taskkill /F).
 */
export async function terminateProcessTree(
  child: TerminableChild,
  options: TerminateOptions = {},
): Promise<void> {
  const pid = child.pid;
  if (pid == null || hasExited(child)) {
    return;
  }

  // The escalation timer alone must not keep the process alive; the exit
  // handler SIGKILLs registered agents anyway.
  const schedule =
    options.setTimeout ??
    ((callback: () => void, ms: number) => {
      const timer = setTimeout(callback, ms);
      timer.unref?.();
      return timer;
    });
  const cancel =
    options.clearTimeout ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const graceMs = options.graceMs ?? 3_000;

  await new Promise<void>((resolve) => {
    let timer: unknown = null;
    const finish = () => {
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
      resolve();
    };

    child.once("exit", finish);
    void killProcessTree(pid, { ...options, signal: "SIGTERM" }).then(
      (signalled) => {
        if (!signalled || hasExited(child)) {
          finish();
          return;
        }

        timer = schedule(() => {
          timer = null;
          if (!hasExited(child)) {
            killProcessTreeSync(pid, { ...options, signal: "SIGKILL" });
          }
          resolve();
        }, graceMs);
      },
    );
  });
}
