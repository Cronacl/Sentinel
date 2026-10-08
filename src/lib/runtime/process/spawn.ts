import "server-only";

import {
  spawn as nodeSpawn,
  type ChildProcess,
  type SpawnOptions,
  type StdioOptions,
} from "node:child_process";
import path from "node:path";

import { installTreeKill, type KillTreeDeps } from "./kill-tree";
import { getAgentPidRegistry, type AgentPidRegistry } from "./pid-registry";
import { installAgentShutdownHandlers } from "./shutdown";

/**
 * Sentinel's own secrets never reach agent processes, nor the shells, MCP
 * servers and tools those start. ENCRYPTION_KEY decrypts stored provider
 * credentials; SENTINEL_INTERNAL_TOKEN authorizes Electron's internal calls.
 */
export const SENTINEL_PRIVATE_ENV_KEYS = new Set([
  "ENCRYPTION_KEY",
  "SENTINEL_INTERNAL_TOKEN",
]);

export type ProcessEnv = Record<string, string | undefined>;

/**
 * `process.env` (unless `extendEnv` is false) under `env`, without unset
 * values and without Sentinel's private keys.
 */
export function buildChildProcessEnv(
  env: ProcessEnv | undefined,
  options: { baseEnv?: ProcessEnv; extendEnv?: boolean } = {},
): Record<string, string> {
  const merged: ProcessEnv = {
    ...(options.extendEnv === false ? {} : (options.baseEnv ?? process.env)),
    ...env,
  };

  return Object.fromEntries(
    Object.entries(merged).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        !SENTINEL_PRIVATE_ENV_KEYS.has(entry[0]),
    ),
  );
}

// cmd.exe metacharacters. The quoting below is ported from cross-spawn (MIT),
// lib/util/escape.js, which follows https://qntm.org/cmd.
const WINDOWS_CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

function escapeWindowsCmdCommand(command: string) {
  return command.replace(WINDOWS_CMD_META_CHARS, "^$1");
}

function escapeWindowsCmdArgument(argument: string) {
  let escaped = `${argument}`;
  // Backslashes before a quote are doubled and the quote is escaped.
  escaped = escaped.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  // Trailing backslashes are doubled (they precede the closing quote).
  escaped = escaped.replace(/(?=(\\+?)?)\1$/, "$1$1");
  escaped = `"${escaped}"`;
  return escaped.replace(WINDOWS_CMD_META_CHARS, "^$1");
}

export type SpawnInvocation = {
  args: string[];
  command: string;
  windowsVerbatimArguments?: boolean;
};

/**
 * npm installs agent CLIs on Windows as `.cmd` shims. Node refuses to spawn
 * `.cmd`/`.bat` files without a shell (CVE-2024-27980), and `shell: true`
 * would pass the arguments unescaped, so batch files run through
 * `cmd.exe /d /s /c` with every argument quoted for cmd. Everything else is
 * spawned directly.
 */
export function buildSpawnInvocation(
  command: string,
  args: readonly string[],
  options?: { comSpec?: string; platform?: NodeJS.Platform },
): SpawnInvocation {
  const platform = options?.platform ?? process.platform;
  if (platform !== "win32" || !/\.(?:cmd|bat)$/i.test(command)) {
    return { args: [...args], command };
  }

  const commandLine = [
    escapeWindowsCmdCommand(path.win32.normalize(command)),
    ...args.map(escapeWindowsCmdArgument),
  ].join(" ");

  return {
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    command: options?.comSpec ?? (process.env.ComSpec?.trim() || "cmd.exe"),
    windowsVerbatimArguments: true,
  };
}

export type ManagedSpawnOptions = KillTreeDeps & {
  args?: readonly string[];
  command: string;
  comSpec?: string;
  cwd?: string;
  env?: ProcessEnv;
  /** Start from process.env (default true). */
  extendEnv?: boolean;
  instanceId?: string | null;
  /** Shown in the pid registry (for example "codex app-server"). */
  label?: string;
  /**
   * Record the pid so shutdown and the next start can end it (default true).
   * Short-lived helpers (version probes, shell lookups) pass false.
   */
  register?: boolean;
  registry?: Pick<AgentPidRegistry, "register" | "unregister">;
  /** Injected in tests. */
  spawn?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
  stdio?: StdioOptions;
};

/**
 * Starts an agent process the platform can account for:
 * - POSIX: detached, so it leads its own process group and `kill()` ends the
 *   group (npm launchers, wrapper shells and the native binary together);
 * - Windows: `.cmd`/`.bat` shims run through cmd.exe with quoted arguments,
 *   and `kill()` ends the tree with taskkill /T /F;
 * - the pid is recorded in the agent pid registry until the process exits,
 *   and the shutdown handlers are installed on first use.
 */
export function spawnManagedProcess(
  options: ManagedSpawnOptions,
): ChildProcess {
  const platform = options.platform ?? process.platform;
  const group = platform !== "win32";
  const invocation = buildSpawnInvocation(options.command, options.args ?? [], {
    comSpec: options.comSpec,
    platform,
  });
  const child = (options.spawn ?? nodeSpawn)(
    invocation.command,
    invocation.args,
    {
      cwd: options.cwd,
      detached: group,
      env: buildChildProcessEnv(options.env, {
        extendEnv: options.extendEnv,
      }) as NodeJS.ProcessEnv,
      stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
      windowsHide: true,
      ...(invocation.windowsVerbatimArguments
        ? { windowsVerbatimArguments: true }
        : {}),
    },
  );

  installTreeKill(child, { ...options, group, platform });

  if (options.register !== false && child.pid != null) {
    const pid = child.pid;
    const registry = options.registry ?? getAgentPidRegistry();
    if (!options.registry) {
      installAgentShutdownHandlers();
    }
    // The agent's own command line, not cmd.exe's: the stale-pid sweep
    // matches on it, and a bare cmd.exe would match any shell.
    registry.register({
      args: [...(options.args ?? [])],
      command: options.command,
      group,
      instanceId: options.instanceId ?? null,
      isRunning: () => child.exitCode === null && child.signalCode === null,
      label: options.label ?? null,
      pid,
    });
    child.once("exit", () => registry.unregister(pid));
  }

  return child;
}
