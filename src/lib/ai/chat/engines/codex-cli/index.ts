import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";

import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getInstanceProcessEnv,
  listWindowsWhereCandidates,
  recordResolvedBinary,
  resolveFromLoginShellLookup,
  resolveRunnablePath,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  lookupInLoginShell,
  parseLoginShellLookupOutput,
  type LoginShellMarkers,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import { runCommandProbe } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import {
  buildSpawnInvocation,
  spawnManagedProcess,
  type SpawnInvocation,
} from "@/lib/runtime/process/spawn";
import { buildManagedExecutablePathValue } from "@/lib/runtime/platform-paths";

const CODEX_LOGIN_SHELL_MARKERS: LoginShellMarkers = {
  commandEnd: "__SENTINEL_CODEX_PATH_END__",
  commandStart: "__SENTINEL_CODEX_PATH_START__",
  pathEnd: "__SENTINEL_PATH_END__",
  pathStart: "__SENTINEL_PATH_START__",
};
const CODEX_LEGACY_ENV_KEYS = ["SENTINEL_CODEX_PATH", "CODEX_PATH"] as const;
const CODEX_RESOLUTION_CACHE_TTL_MS = 15_000;
const CLI_VERSION_TIMEOUT_MS = 1_200;

export type ResolvedCodexCli = {
  command: string;
  env: NodeJS.ProcessEnv;
  /** How the binary was found. */
  source: EngineInstallSource;
};

export type CodexCliInstance = EngineBinaryInstance;

// One cached resolution per instance (and per configuration of it).
const cachedResolutions = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedCodexCli | null> }
>();

function getResolutionCacheKey(instance: CodexCliInstance | null | undefined) {
  if (!instance) {
    return "default";
  }

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        instance.config.binaryPath ?? null,
        instance.envOverrides,
        instance.envUnset,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
  return `${instance.id}:${fingerprint}`;
}

/** The Windows candidates for `codex` are only names Node can spawn. */
const CODEX_NAME_OPTIONS = { strategy: "spawnable" } as const;

export function parseShellLookupOutput(stdout: string) {
  const { commandPath, pathValue } = parseLoginShellLookupOutput(stdout, {
    commandBasenamePrefix: "codex",
    markers: CODEX_LOGIN_SHELL_MARKERS,
  });
  return { codexPath: commandPath, pathValue };
}

/**
 * Resolution order: the instance's binaryPath, else (default instance)
 * SENTINEL_CODEX_PATH or CODEX_PATH; then the managed PATH, `where` on
 * Windows and the login shell. Without an instance this is the default
 * instance on process.env, exactly as before instances existed.
 */
async function resolveCodexCliUncached(
  instance: CodexCliInstance | null | undefined,
): Promise<ResolvedCodexCli | null> {
  const baseEnv = getInstanceProcessEnv(instance);
  const preferredPath = await buildManagedExecutablePathValue(baseEnv.PATH, {
    env: baseEnv,
  });
  const managedEnv = { ...baseEnv, PATH: preferredPath };
  const isDefault = !instance || instance.isDefault;
  const remember = async (resolved: ResolvedCodexCli) => {
    await recordResolvedBinary(
      { path: resolved.command, source: resolved.source, version: null },
      {
        instanceId: instance?.id ?? "codex",
        legacyEnvKey: isDefault ? "SENTINEL_CODEX_PATH" : null,
      },
    );
    return resolved;
  };

  const override = getConfiguredBinaryOverride(
    instance,
    baseEnv,
    CODEX_LEGACY_ENV_KEYS,
  );
  const overrideCommand = override
    ? await resolveRunnablePath(override.path, CODEX_NAME_OPTIONS)
    : null;
  if (override && overrideCommand) {
    return await remember({
      command: overrideCommand,
      env: managedEnv,
      source: override.source,
    });
  }
  // A configured path that cannot run is kept (not erased): a transient
  // launch or filesystem failure should not lose the user's choice.

  const directCommand = await findExecutableInPath(
    "codex",
    preferredPath,
    CODEX_NAME_OPTIONS,
  );
  if (directCommand) {
    return await remember({
      command: directCommand,
      env: managedEnv,
      source: "managed-path",
    });
  }

  for (const candidate of await listWindowsWhereCandidates("codex", {
    env: baseEnv,
  })) {
    const command = await resolveRunnablePath(candidate, CODEX_NAME_OPTIONS);
    if (command) {
      return await remember({ command, env: baseEnv, source: "login-shell" });
    }
  }

  const shellResolved = await resolveFromLoginShellLookup(
    await lookupInLoginShell({
      command: "codex",
      commandBasenamePrefix: "codex",
      env: baseEnv,
      markers: CODEX_LOGIN_SHELL_MARKERS,
    }),
    {
      ...CODEX_NAME_OPTIONS,
      accept: async (path, env) => ({
        env,
        path,
        source: "login-shell",
        version: null,
      }),
      baseEnv,
      command: "codex",
    },
  );
  return shellResolved
    ? await remember({
        command: shellResolved.path,
        env: shellResolved.env as NodeJS.ProcessEnv,
        source: shellResolved.source,
      })
    : null;
}

export async function resolveCodexCli(options?: {
  forceRefresh?: boolean;
  instance?: CodexCliInstance | null;
}) {
  const key = getResolutionCacheKey(options?.instance);
  const now = Date.now();
  const cached = cachedResolutions.get(key);

  if (!options?.forceRefresh && cached && cached.expiresAt > now) {
    return await cached.promise;
  }

  const promise = resolveCodexCliUncached(options?.instance);
  cachedResolutions.set(key, {
    expiresAt: now + CODEX_RESOLUTION_CACHE_TTL_MS,
    promise,
  });

  return await promise;
}

export function resetCodexCliResolutionCache() {
  cachedResolutions.clear();
}

export type CodexCliInvocation = SpawnInvocation;

/**
 * npm installs Codex on Windows as a `codex.cmd` shim, which runs through
 * `cmd.exe /d /s /c` with every argument quoted (see buildSpawnInvocation).
 */
export function buildCodexCliInvocation(
  command: string,
  args: string[],
  options?: { comSpec?: string; platform?: NodeJS.Platform },
): CodexCliInvocation {
  return buildSpawnInvocation(command, args, options);
}

export async function readCodexCliVersion(
  resolvedCliInput?: ResolvedCodexCli | null,
) {
  const resolvedCli = resolvedCliInput ?? (await resolveCodexCli());
  if (!resolvedCli) {
    return null;
  }

  const result = await runCommandProbe({
    command: resolvedCli.command,
    env: resolvedCli.env,
    timeoutMs: CLI_VERSION_TIMEOUT_MS,
  });
  return result.error ? null : result.stdout.trim();
}

/**
 * Starts Codex as a managed agent process: its own process group on POSIX,
 * the .cmd shim through cmd.exe on Windows, kill() ending the whole tree
 * (taskkill /T /F on Windows) and the pid recorded for shutdown.
 */
export async function spawnCodexCli(
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    instance?: CodexCliInstance | null;
  },
) {
  const resolvedCli = await resolveCodexCli({ instance: options?.instance });
  if (!resolvedCli) {
    throw new Error("Codex CLI is not installed or not available on PATH.");
  }

  return spawnManagedProcess({
    args,
    command: resolvedCli.command,
    cwd: options?.cwd,
    env: {
      ...resolvedCli.env,
      ...(options?.env ?? {}),
    },
    // resolvedCli.env already starts from process.env.
    extendEnv: false,
    instanceId: options?.instance?.id ?? "codex",
    label: `codex ${args[0] ?? ""}`.trim(),
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
}
