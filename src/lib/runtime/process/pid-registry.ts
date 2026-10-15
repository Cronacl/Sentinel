import "server-only";

import { execFile } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import { getSentinelStateRoot } from "@/lib/runtime/local-state";

import {
  isProcessAlive,
  killProcessTree,
  killProcessTreeSync,
  type KillTreeDeps,
} from "./kill-tree";

// Every long-lived agent process Sentinel starts is recorded in
// <state root>/run/agents.json, so that
// - a signal or exit handler can end them synchronously (Next's own SIGTERM
//   handler waits on server.close(), and Electron SIGKILLs the server after
//   3 s, which would orphan them), and
// - the next start can end the ones a crash left behind. A recorded pid is
//   only killed when its owner (the server that started it) is gone and its
//   command line still matches, so a reused pid is never touched.
// Several Sentinel servers (a dev server next to the desktop app) can share
// the file; each one rewrites only its own entries.

const STATE_DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const STALE_OWNER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const COMMAND_LINE_TIMEOUT_MS = 2_000;
// A cold PowerShell start alone often takes longer than 2 s.
const WINDOWS_COMMAND_LINE_TIMEOUT_MS = 10_000;
const DEFAULT_GRACE_MS = 1_500;

const agentPidEntrySchema = z.object({
  /**
   * The agent's own command and arguments as the caller asked for them
   * (on Windows, the .cmd shim, not the cmd.exe that runs it).
   */
  args: z.array(z.string()),
  command: z.string().min(1),
  /** The pid leads its own process group (spawned detached). */
  group: z.boolean(),
  instanceId: z.string().nullable(),
  label: z.string().nullable(),
  /** The Sentinel server process that started it. */
  ownerPid: z.number().int().positive(),
  pid: z.number().int().positive(),
  /** realpath of `command` when it is a file (symlinked npm/brew shims). */
  realCommand: z.string().nullable(),
  startedAt: z.string(),
});

const agentPidFileSchema = z.object({
  entries: z.array(z.unknown()),
  version: z.literal(1),
});

export type AgentPidEntry = z.infer<typeof agentPidEntrySchema>;

export type AgentPidRegistration = {
  args?: readonly string[];
  command: string;
  group: boolean;
  instanceId?: string | null;
  /**
   * False once the process exited (ChildProcess exitCode/signalCode). Kept
   * in memory only: an entry whose exit listener was removed (callers that
   * removeAllListeners()) is never signalled after its pid could be reused.
   */
  isRunning?: () => boolean;
  label?: string | null;
  pid: number;
};

export type AgentPidRegistryFs = {
  chmodSync(path: string, mode: number): void;
  mkdirSync(path: string, options: { mode: number; recursive: true }): unknown;
  readFileSync(path: string, encoding: "utf8"): string;
  realpathSync(path: string): string;
  renameSync(from: string, to: string): void;
  writeFileSync(
    path: string,
    data: string,
    options: { encoding: "utf8"; mode: number },
  ): void;
};

export type AgentPidRegistryDeps = KillTreeDeps & {
  filePath: string | (() => string);
  fs?: AgentPidRegistryFs;
  isAlive?: (pid: number) => boolean;
  now?: () => Date;
  /** This server's pid (default process.pid). */
  ownerPid?: number;
  /** The command line of a running process, or null when unknown. */
  readCommandLine?: (pid: number) => Promise<string | null>;
  wait?: (ms: number) => Promise<void>;
};

export type AgentShutdownSummary = {
  /** Processes that ignored SIGTERM for the grace period. */
  forced: number;
  signalled: number;
};

export type AgentSweepSummary = {
  killed: number;
  pruned: number;
};

export interface AgentPidRegistry {
  register(registration: AgentPidRegistration): void;
  unregister(pid: number): void;
  /** This server's live registrations. */
  list(): AgentPidEntry[];
  /** For signal and exit handlers: signals every own entry, synchronously. */
  killAllSync(signal: NodeJS.Signals): number;
  /** SIGTERM every own entry, SIGKILL whatever is left after `graceMs`. */
  shutdown(options?: { graceMs?: number }): Promise<AgentShutdownSummary>;
  /**
   * Ends processes recorded by servers that are gone (crash, SIGKILL),
   * when their command line still matches, and prunes their entries.
   */
  sweepStale(options?: { graceMs?: number }): Promise<AgentSweepSummary>;
}

const nodeFs: AgentPidRegistryFs = {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
};

function quoteWindowsPid(pid: number) {
  return String(Math.trunc(pid));
}

/** `ps` on POSIX, CIM on Windows; null when the process is gone. */
export function readProcessCommandLine(
  pid: number,
  options: { platform?: NodeJS.Platform } = {},
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const [command, args] =
    platform === "win32"
      ? [
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "ProcessId=${quoteWindowsPid(pid)}").CommandLine`,
          ],
        ]
      : ["ps", ["-ww", "-o", "command=", "-p", String(pid)]];

  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout:
          platform === "win32"
            ? WINDOWS_COMMAND_LINE_TIMEOUT_MS
            : COMMAND_LINE_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        const value = String(stdout ?? "").trim();
        resolve(error || !value ? null : value);
      },
    );
  });
}

function basenameOf(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

/**
 * Shells and interpreters run anything: their name alone says nothing
 * about which program a pid runs.
 */
const GENERIC_EXECUTABLES = new Set([
  "bash",
  "bun",
  "cmd",
  "dash",
  "deno",
  "fish",
  "node",
  "powershell",
  "pwsh",
  "python",
  "python3",
  "sh",
  "zsh",
]);

function isGenericExecutable(name: string) {
  return GENERIC_EXECUTABLES.has(
    name.toLowerCase().replace(/\.(?:exe|com|cmd|bat)$/, ""),
  );
}

/**
 * The recorded process is still the one running under this pid: its command
 * line names the recorded executable (or the file a shim resolved to) and
 * carries the leading arguments. Launchers exec into interpreters (`node
 * …/codex app-server`), so the executable is matched by name, not position.
 */
export function commandLineMatchesEntry(
  entry: Pick<AgentPidEntry, "args" | "command" | "realCommand">,
  commandLine: string,
  platform: NodeJS.Platform = process.platform,
) {
  const normalize = (value: string) =>
    platform === "win32" ? value.toLowerCase() : value;
  // cmd.exe runs a .cmd shim with ^-escaped arguments (spawn.ts).
  const haystack = normalize(
    platform === "win32" ? commandLine.replaceAll("^", "") : commandLine,
  );
  const names = [entry.command, entry.realCommand]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalize(basenameOf(value)));
  const namesMatch = names.some(
    (name) =>
      haystack.includes(name) ||
      (platform === "win32" &&
        haystack.includes(name.replace(/\.(?:cmd|bat|exe|com)$/, ""))),
  );
  if (!namesMatch) {
    return false;
  }

  const significantArgs = entry.args
    .slice(0, 3)
    .filter((arg) => arg.length >= 3);
  if (
    significantArgs.length === 0 &&
    names.every((name) => isGenericExecutable(name))
  ) {
    // A bare `cmd.exe` or `node` matches any shell or script on the
    // machine; never kill on that.
    return false;
  }

  return significantArgs.every((arg) => haystack.includes(normalize(arg)));
}

export function createAgentPidRegistry(
  deps: AgentPidRegistryDeps,
): AgentPidRegistry {
  const fs = deps.fs ?? nodeFs;
  const ownerPid = deps.ownerPid ?? process.pid;
  const now = deps.now ?? (() => new Date());
  const isAlive =
    deps.isAlive ?? ((pid: number) => isProcessAlive(pid, { kill: deps.kill }));
  const readCommandLine =
    deps.readCommandLine ??
    ((pid: number) => readProcessCommandLine(pid, { platform: deps.platform }));
  const wait =
    deps.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const platform = deps.platform ?? process.platform;
  const own = new Map<number, AgentPidEntry>();
  const runningChecks = new Map<number, () => boolean>();
  const getFilePath = () =>
    typeof deps.filePath === "function" ? deps.filePath() : deps.filePath;

  function readEntries(): AgentPidEntry[] {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(getFilePath(), "utf8"));
    } catch {
      return [];
    }

    const parsed = agentPidFileSchema.safeParse(raw);
    if (!parsed.success) {
      return [];
    }

    return parsed.data.entries.flatMap((value) => {
      const entry = agentPidEntrySchema.safeParse(value);
      return entry.success ? [entry.data] : [];
    });
  }

  function writeEntries(entries: AgentPidEntry[]) {
    const filePath = getFilePath();
    const directory = path.dirname(filePath);
    try {
      fs.mkdirSync(directory, { mode: STATE_DIRECTORY_MODE, recursive: true });
      const temporaryPath = `${filePath}.${ownerPid}.tmp`;
      fs.writeFileSync(
        temporaryPath,
        `${JSON.stringify({ entries, version: 1 }, null, 2)}\n`,
        { encoding: "utf8", mode: FILE_MODE },
      );
      fs.renameSync(temporaryPath, filePath);
      if (platform !== "win32") {
        fs.chmodSync(filePath, FILE_MODE);
      }
    } catch {
      // Best effort: the in-memory list still drives this server's
      // shutdown; only crash recovery loses the entry.
    }
  }

  /** Other servers' entries from disk plus this server's live ones. */
  function persist(
    keepForeign: (entry: AgentPidEntry) => boolean = () => true,
  ) {
    const foreign = readEntries().filter(
      (entry) => entry.ownerPid !== ownerPid && keepForeign(entry),
    );
    writeEntries([...foreign, ...own.values()]);
  }

  function resolveRealCommand(command: string) {
    if (!path.isAbsolute(command)) {
      return null;
    }
    try {
      const real = fs.realpathSync(command);
      return real === command ? null : real;
    } catch {
      return null;
    }
  }

  /** Own entries whose process has not exited, pruning the others. */
  function liveOwnEntries() {
    const live: AgentPidEntry[] = [];
    for (const entry of own.values()) {
      if (runningChecks.get(entry.pid)?.() === false) {
        own.delete(entry.pid);
        runningChecks.delete(entry.pid);
        continue;
      }
      live.push(entry);
    }
    return live;
  }

  function signalEntry(entry: AgentPidEntry, signal: NodeJS.Signals) {
    return killProcessTreeSync(entry.pid, {
      ...deps,
      group: entry.group,
      signal,
    });
  }

  async function endEntries(entries: AgentPidEntry[], graceMs: number) {
    let signalled = 0;
    for (const entry of entries) {
      if (
        await killProcessTree(entry.pid, {
          ...deps,
          group: entry.group,
          signal: "SIGTERM",
        })
      ) {
        signalled += 1;
      }
    }

    let survivors = entries.filter((entry) => isAlive(entry.pid));
    if (survivors.length > 0 && graceMs > 0) {
      await wait(graceMs);
      survivors = survivors.filter((entry) => isAlive(entry.pid));
    }

    for (const entry of survivors) {
      signalEntry(entry, "SIGKILL");
    }

    return { forced: survivors.length, signalled };
  }

  return {
    killAllSync(signal) {
      let signalled = 0;
      for (const entry of liveOwnEntries()) {
        if (signalEntry(entry, signal)) {
          signalled += 1;
        }
      }
      return signalled;
    },

    list() {
      return liveOwnEntries();
    },

    register(registration) {
      if (!Number.isInteger(registration.pid) || registration.pid <= 0) {
        return;
      }

      own.set(registration.pid, {
        args: [...(registration.args ?? [])],
        command: registration.command,
        group: registration.group,
        instanceId: registration.instanceId ?? null,
        label: registration.label ?? null,
        ownerPid,
        pid: registration.pid,
        realCommand: resolveRealCommand(registration.command),
        startedAt: now().toISOString(),
      });
      if (registration.isRunning) {
        runningChecks.set(registration.pid, registration.isRunning);
      } else {
        runningChecks.delete(registration.pid);
      }
      persist();
    },

    async shutdown(options) {
      const entries = liveOwnEntries();
      const summary = await endEntries(
        entries,
        options?.graceMs ?? DEFAULT_GRACE_MS,
      );
      for (const entry of entries) {
        own.delete(entry.pid);
        runningChecks.delete(entry.pid);
      }
      persist();
      return summary;
    },

    async sweepStale(options) {
      const current = now().getTime();
      const stale: AgentPidEntry[] = [];
      for (const entry of readEntries()) {
        if (entry.ownerPid === ownerPid && own.has(entry.pid)) {
          continue;
        }

        // An entry with this server's pid that this server never registered
        // comes from an earlier server whose pid was reused.
        const startedAt = Date.parse(entry.startedAt);
        const ownerLive =
          entry.ownerPid !== ownerPid &&
          isAlive(entry.ownerPid) &&
          Number.isFinite(startedAt) &&
          current - startedAt < STALE_OWNER_MAX_AGE_MS;
        if (!ownerLive) {
          stale.push(entry);
        }
      }

      const toKill: AgentPidEntry[] = [];
      const undecided = new Set<AgentPidEntry>();
      for (const entry of stale) {
        if (!isAlive(entry.pid)) {
          continue;
        }
        const commandLine = await readCommandLine(entry.pid);
        if (commandLine === null) {
          // Unreadable (a slow or blocked PowerShell, say) while still
          // running: try again at the next start instead of forgetting an
          // orphan, for as long as an owner could have lived.
          const startedAt = Date.parse(entry.startedAt);
          if (
            isAlive(entry.pid) &&
            Number.isFinite(startedAt) &&
            current - startedAt < STALE_OWNER_MAX_AGE_MS
          ) {
            undecided.add(entry);
          }
          continue;
        }
        if (commandLineMatchesEntry(entry, commandLine, platform)) {
          toKill.push(entry);
        }
      }

      const { signalled } = await endEntries(
        toKill,
        options?.graceMs ?? DEFAULT_GRACE_MS,
      );
      const pruned = stale.filter((entry) => !undecided.has(entry));
      const prunedKeys = new Set(
        pruned.map((entry) => `${entry.ownerPid}:${entry.pid}`),
      );
      // persist() already drops entries carrying this server's pid that it
      // does not own.
      persist((entry) => !prunedKeys.has(`${entry.ownerPid}:${entry.pid}`));

      return { killed: signalled, pruned: pruned.length };
    },

    unregister(pid) {
      runningChecks.delete(pid);
      if (own.delete(pid)) {
        persist();
      }
    },
  };
}

export function getAgentPidFilePath(options: { stateRoot?: string } = {}) {
  return path.join(
    options.stateRoot ?? getSentinelStateRoot(),
    "run",
    "agents.json",
  );
}

const globalForPidRegistry = globalThis as unknown as {
  __sentinelAgentPidRegistry?: AgentPidRegistry;
};

/** The process-wide registry (on globalThis so HMR copies share it). */
export function getAgentPidRegistry(): AgentPidRegistry {
  globalForPidRegistry.__sentinelAgentPidRegistry ??= createAgentPidRegistry({
    filePath: () => getAgentPidFilePath(),
  });
  return globalForPidRegistry.__sentinelAgentPidRegistry;
}
