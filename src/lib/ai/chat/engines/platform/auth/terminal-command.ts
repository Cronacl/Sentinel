import "server-only";

import {
  buildSpawnInvocation,
  SENTINEL_PRIVATE_ENV_KEYS,
} from "@/lib/runtime/process/spawn";

import type { EngineAuthTerminalCommand } from "./controller";

// Turning a driver's sign-in command into what the embedded terminal runs
// (absolute command, args, cwd, non-secret env) and what a browser user
// copies into their own terminal.

/** What Electron main receives when it redeems a launch ticket. */
export type EngineAuthTerminalLaunchSpec = {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string>;
  title: string;
  windowsVerbatimArguments?: boolean;
};

/**
 * The command as the platform spawns it: Windows `.cmd`/`.bat` shims run
 * through cmd.exe with quoted arguments (see spawn.ts), anything else as is.
 */
export function toAuthTerminalInvocation(
  command: string,
  args: readonly string[],
  options?: { comSpec?: string; platform?: NodeJS.Platform },
): Pick<
  EngineAuthTerminalCommand,
  "args" | "command" | "windowsVerbatimArguments"
> {
  const invocation = buildSpawnInvocation(command, args, options);
  return {
    args: invocation.args,
    command: invocation.command,
    ...(invocation.windowsVerbatimArguments
      ? { windowsVerbatimArguments: true }
      : {}),
  };
}

function withoutPrivateKeys(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        !SENTINEL_PRIVATE_ENV_KEYS.has(entry[0]),
    ),
  );
}

/**
 * The variables a sign-in command runs with: PATH as the instance resolves
 * binaries (so a script CLI finds its interpreter from a GUI-launched app),
 * the instance's non-secret variables (its home: CLAUDE_CONFIG_DIR,
 * COPILOT_HOME…) and the command's own. Secrets are never included: they
 * travel to the renderer and back.
 */
export function buildAuthTerminalEnv(input: {
  commandEnv?: Record<string, string>;
  path?: string | null;
  publicOverrides: Record<string, string>;
}): Record<string, string> {
  return withoutPrivateKeys({
    ...(input.path ? { PATH: input.path } : {}),
    ...input.publicOverrides,
    ...input.commandEnv,
  });
}

const POSIX_SAFE_ARGUMENT = /^[A-Za-z0-9_\-./:=@%+,]+$/;

export function quotePosixArgument(value: string) {
  if (value && POSIX_SAFE_ARGUMENT.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function quotePowerShellArgument(value: string) {
  if (value && POSIX_SAFE_ARGUMENT.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * One line to paste into a terminal: POSIX shell syntax, or PowerShell on
 * Windows. PATH is left out (the user's own terminal has one).
 */
export function formatAuthDisplayCommand(
  input: {
    args: readonly string[];
    command: string;
    env: Record<string, string>;
  },
  platform: NodeJS.Platform = process.platform,
) {
  const env = Object.entries(input.env).filter(([name]) => name !== "PATH");

  if (platform === "win32") {
    return [
      ...env.map(
        ([name, value]) => `$env:${name}=${quotePowerShellArgument(value)};`,
      ),
      `& ${quotePowerShellArgument(input.command)}`,
      ...input.args.map(quotePowerShellArgument),
    ].join(" ");
  }

  return [
    ...env.map(([name, value]) => `${name}=${quotePosixArgument(value)}`),
    quotePosixArgument(input.command),
    ...input.args.map(quotePosixArgument),
  ].join(" ");
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Sign-in pages a flow may show: https anywhere, http only on loopback
 * (local callback servers). Anything else (javascript:, file:) is refused.
 */
export function isSafeAuthUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}
