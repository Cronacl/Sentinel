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

/** Pi's built-in options that take a value (t3code mcpInjection.ts). */
const ARGUMENTS_WITH_VALUES = new Set([
  "--api-key",
  "--append-system-prompt",
  "--exclude-tools",
  "-xt",
  "--extension",
  "-e",
  "--model",
  "--models",
  "--name",
  "-n",
  "--prompt-template",
  "--provider",
  "--session-dir",
  "--skill",
  "--system-prompt",
  "--theme",
  "--thinking",
  "--tools",
  "-t",
  "--tui-mode",
  "--use-theme",
]);

const ARGUMENTS_WITHOUT_VALUES = new Set([
  "--approve",
  "-a",
  "--no-approve",
  "-na",
  "--no-builtin-tools",
  "-nbt",
  "--no-context-files",
  "-nc",
  "--no-extensions",
  "-ne",
  "--no-prompt-templates",
  "-np",
  "--no-skills",
  "-ns",
  "--no-themes",
  "--no-tools",
  "-nt",
  "--offline",
  "--verbose",
]);

export class PiLaunchArgumentError extends Error {
  constructor(message: string) {
    super(`${message} Change the instance's launch arguments.`);
    this.name = "PiLaunchArgumentError";
  }
}

function reservedArgument(arg: string) {
  return RESERVED_ARGUMENTS.find(
    (name) =>
      arg === name || (name.startsWith("--") && arg.startsWith(`${name}=`)),
  );
}

/**
 * The instance's launch arguments as Pi gets them, or why they cannot be
 * used (t3code resolvePiLaunchArgs, MIT). Pi reads `--name=value` only as an
 * extension flag, so built-in options in that form are split; positional
 * prompts and unknown short flags are refused, and so is `--provider`
 * without `--model`, on which Pi 1.0 exits at startup.
 */
export function validatePiLaunchArgs(input: readonly string[]) {
  const args = input.flatMap((arg) => {
    const equals = arg.indexOf("=");
    const option = equals > 0 ? arg.slice(0, equals) : "";
    return ARGUMENTS_WITH_VALUES.has(option)
      ? [option, arg.slice(equals + 1)]
      : [arg];
  });
  let hasProvider = false;
  let hasModel = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const reserved = reservedArgument(arg);
    if (reserved) {
      throw new PiLaunchArgumentError(
        `Pi launch argument "${reserved}" is managed by Sentinel.`,
      );
    }
    if (ARGUMENTS_WITH_VALUES.has(arg)) {
      if (args[index + 1] === undefined) {
        throw new PiLaunchArgumentError(
          `Pi launch argument "${arg}" needs a value.`,
        );
      }
      hasProvider ||= arg === "--provider";
      hasModel ||= arg === "--model";
      index += 1;
      continue;
    }
    if (
      ARGUMENTS_WITHOUT_VALUES.has(arg) ||
      (arg.startsWith("--") && arg.includes("="))
    ) {
      continue;
    }
    if (arg.startsWith("--") && arg !== "--") {
      // An extension's own flag; one following non-flag token is its value.
      const next = args[index + 1];
      if (
        next !== undefined &&
        !next.startsWith("-") &&
        !next.startsWith("@")
      ) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("-") && arg !== "--") {
      throw new PiLaunchArgumentError(
        `Pi launch argument "${arg}" is not supported.`,
      );
    }
    throw new PiLaunchArgumentError(
      `Pi launch arguments cannot include a prompt ("${arg}").`,
    );
  }
  if (hasProvider && !hasModel) {
    throw new PiLaunchArgumentError(
      'Pi launch argument "--provider" needs "--model" as well.',
    );
  }
  return args;
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
