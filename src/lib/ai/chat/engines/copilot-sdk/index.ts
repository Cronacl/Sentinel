import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CopilotClient,
  RuntimeConnection,
  type CopilotClientOptions,
  type GetAuthStatusResponse,
  type ModelInfo,
  type ResumeSessionConfig,
  type SessionConfig,
} from "@github/copilot-sdk";

import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import {
  getLoginShellMarkers,
  lookupInLoginShell,
  parseLoginShellLookupOutput,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  findExecutableInPath,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
  isExecutableFile,
  isReadableFile,
  listWindowsWhereCandidates,
  normalizeCandidatePath,
  recordResolvedBinary,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { runCommandProbe } from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import { getInstanceResources } from "@/lib/ai/chat/engines/platform/instance-resources";
import { getLegacyEngineStatusFilePath } from "@/lib/ai/chat/engines/platform/paths";
import type { CopilotThreadState } from "@/lib/ai/chat/engines/types";
import { createLogger } from "@/lib/logger";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { readLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import { applyPrivateFsMode } from "@/lib/runtime/local-state";
import { buildManagedExecutablePathValue } from "@/lib/runtime/platform-paths";
import { SENTINEL_PRIVATE_ENV_KEYS } from "@/lib/runtime/process/spawn";
import { withTimeout } from "@/lib/runtime/process/with-timeout";

import { resolveBundledCopilotRuntime } from "./bundled-runtime";

const log = createLogger("CopilotSdk");
const COPILOT_RUNTIME_CACHE_TTL_MS = 15_000;
const COPILOT_STATUS_CACHE_TTL_MS = 15_000;
const COPILOT_STARTUP_TIMEOUT_MS = 10_000;
const COPILOT_STATUS_QUERY_TIMEOUT_MS = 3_000;
const COPILOT_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const COPILOT_STATUS_SNAPSHOT_FILE = "copilot-status.json";
const COPILOT_CLI_VERIFY_TIMEOUT_MS = 1_500;

export type CopilotAccountInfo = {
  authType: string | null;
  host: string | null;
  login: string | null;
  statusMessage: string | null;
};

export type CopilotEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_runtime"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type CopilotModelInfo = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort | null;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  supportedReasoningEfforts: Array<{
    description: string;
    effort: ReasoningEffort;
    label: string;
  }>;
};

/**
 * Where the Copilot runtime came from: an explicit path override
 * (COPILOT_CLI_PATH, COPILOT_PATH, or a SENTINEL_COPILOT_PATH that is not just
 * the value saved in desktop.env), the runtime the SDK ships in
 * `@github/copilot-sdk-<platform>`, or a user-installed `copilot`.
 */
export type CopilotRuntimeSource = "bundled" | "env_override" | "user_cli";

export type CopilotEngineStatus = {
  account: CopilotAccountInfo | null;
  authReady: boolean;
  availableModels: CopilotModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  engine: "copilot";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  runtimeSource: CopilotRuntimeSource | null;
  state: CopilotEngineState;
  usedCachedStatus: boolean;
};

type CopilotStatusSnapshot = {
  account: CopilotAccountInfo | null;
  availableModels: CopilotModelInfo[];
  cliPath: string;
  cliVersion: string | null;
  recordedAt: string;
};

type ResolvedCopilotRuntime = {
  cliDetected: boolean;
  error: string | null;
  cliPath: string | null;
  env: NodeJS.ProcessEnv;
  /** The platform's install source (runtime-paths.json, snapshots). */
  installSource: EngineInstallSource | null;
  source: CopilotRuntimeSource | null;
};

type CopilotShellLookupResult = {
  copilotPath: string | null;
  pathValue: string | null;
};

function getCopilotStatusSnapshotPath(
  instance: CopilotRuntimeInstance | null | undefined,
) {
  return getLegacyEngineStatusFilePath(COPILOT_STATUS_SNAPSHOT_FILE, instance);
}

async function writeCopilotStatusSnapshot(
  snapshotPath: string,
  snapshot: CopilotStatusSnapshot,
) {
  const localStateDirectory = path.dirname(snapshotPath);

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), {
    encoding: "utf8",
    mode: LOCAL_STATE_FILE_MODE,
  });
  await applyPrivateFsMode(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await applyPrivateFsMode(snapshotPath, LOCAL_STATE_FILE_MODE);
}

async function readCopilotStatusSnapshot(
  snapshotPath: string,
  options: { cliPath: string },
) {
  try {
    const rawSnapshot = await readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<CopilotStatusSnapshot>;

    if (
      typeof parsed.cliPath !== "string" ||
      parsed.cliPath !== options.cliPath ||
      typeof parsed.recordedAt !== "string" ||
      !Array.isArray(parsed.availableModels)
    ) {
      return null;
    }

    const recordedAt = new Date(parsed.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      return null;
    }

    if (
      Date.now() - recordedAt.getTime() >
      COPILOT_STATUS_SNAPSHOT_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      account:
        (parsed.account as CopilotAccountInfo | null | undefined) ?? null,
      availableModels: parsed.availableModels as CopilotModelInfo[],
      cliPath: parsed.cliPath,
      cliVersion:
        typeof parsed.cliVersion === "string" ? parsed.cliVersion : null,
      recordedAt: recordedAt.toISOString(),
    } satisfies CopilotStatusSnapshot;
  } catch {
    return null;
  }
}

function getCopilotReasoningEfforts(model: ModelInfo) {
  return (model.supportedReasoningEfforts ?? [])
    .map(toSentinelReasoningEffort)
    .filter((effort, index, array): effort is ReasoningEffort => {
      return effort != null && array.indexOf(effort) === index;
    })
    .map((effort) => ({
      description: `${model.name} supports ${effort} reasoning effort.`,
      effort,
      label: effort[0]!.toUpperCase() + effort.slice(1),
    }));
}

function toSentinelReasoningEffort(
  effort: string | null | undefined,
): ReasoningEffort | null {
  switch (effort) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return effort;
    default:
      return null;
  }
}

function toCopilotModelInfo(model: ModelInfo, index: number): CopilotModelInfo {
  const supportedReasoningEfforts = getCopilotReasoningEfforts(model);
  const defaultReasoningEffort = toSentinelReasoningEffort(
    model.defaultReasoningEffort,
  );

  return {
    ...(typeof model.capabilities.limits.max_context_window_tokens === "number"
      ? { contextWindow: model.capabilities.limits.max_context_window_tokens }
      : {}),
    defaultReasoningEffort,
    description: model.capabilities.supports.vision
      ? `${model.name} with text and image support.`
      : `${model.name} for Copilot chat and coding tasks.`,
    displayName: model.name,
    id: model.id,
    inputModalities: model.capabilities.supports.vision
      ? ["text", "image"]
      : ["text"],
    isDefault: index === 0,
    model: model.id,
    supportedReasoningEfforts,
  };
}

function toCopilotAccountInfo(
  authStatus: GetAuthStatusResponse,
): CopilotAccountInfo | null {
  if (
    !authStatus.authType &&
    !authStatus.host &&
    !authStatus.login &&
    !authStatus.statusMessage
  ) {
    return null;
  }

  return {
    authType: authStatus.authType ?? null,
    host: authStatus.host ?? null,
    login: authStatus.login ?? null,
    statusMessage: authStatus.statusMessage ?? null,
  };
}

function buildCopilotEngineStatus(input: {
  account: CopilotAccountInfo | null;
  authReady: boolean;
  availableModels: CopilotModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  runtimeSource: CopilotRuntimeSource | null;
  state: CopilotEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    account: input.account,
    authReady: input.authReady,
    availableModels: input.availableModels,
    cliDetected: input.cliDetected,
    cliPath: input.cliPath,
    cliVersion: input.cliVersion,
    engine: "copilot" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    runtimeSource: input.runtimeSource,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies CopilotEngineStatus;
}

function buildCachedCopilotStatus(input: {
  cliPath: string;
  runtimeSource: CopilotRuntimeSource | null;
  snapshot: CopilotStatusSnapshot;
}) {
  return buildCopilotEngineStatus({
    account: input.snapshot.account,
    authReady: true,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliPath: input.cliPath,
    cliVersion: input.snapshot.cliVersion,
    error:
      "GitHub Copilot took too long to respond. Showing the most recent cached model list.",
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    runtimeSource: input.runtimeSource,
    state: "timeout_using_cache",
    usedCachedStatus: true,
  });
}

function isCopilotAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("login") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("sign in") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("401")
  );
}

function isCopilotMissingRuntimeMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("copilot cli was not found") ||
    normalizedMessage.includes("copilot cli not found") ||
    normalizedMessage.includes("copilot cli is not installed") ||
    normalizedMessage.includes("copilot cli is unavailable") ||
    normalizedMessage.includes("copilot cli not found at") ||
    normalizedMessage.includes("copilot runtime is missing") ||
    normalizedMessage.includes("copilot runtime was not found") ||
    // SDK 1.x when its platform runtime package is absent or incomplete.
    normalizedMessage.includes("could not resolve @github/copilot-sdk-") ||
    normalizedMessage.includes("missing required copilot cli runtime files") ||
    normalizedMessage.includes("enoent")
  );
}

function isCopilotNodeVersionMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("no such built-in module: node:sqlite") ||
    (normalizedMessage.includes("err_unknown_builtin_module") &&
      normalizedMessage.includes("node:sqlite")) ||
    normalizedMessage.includes("requires node.js v24") ||
    (normalizedMessage.includes("node.js") &&
      normalizedMessage.includes("unsupported")) ||
    (normalizedMessage.includes("node") &&
      normalizedMessage.includes("version"))
  );
}

const COPILOT_NAME_OPTIONS = { strategy: "pathext-or-bare" } as const;
const COPILOT_LOGIN_SHELL_MARKERS = getLoginShellMarkers("copilot");

function isNodeScriptPath(candidatePath: string) {
  const extension = path.extname(candidatePath).toLowerCase();
  return extension === ".js" || extension === ".cjs" || extension === ".mjs";
}

function isLikelyCopilotCliPath(candidatePath: string) {
  const normalizedPath = candidatePath.replaceAll("\\", "/").toLowerCase();
  const baseName = path.basename(normalizedPath);

  return (
    baseName.startsWith("copilot") ||
    normalizedPath.includes("/@github/copilot/") ||
    normalizedPath.includes("/node_modules/.bin/copilot")
  );
}

async function isLaunchableCopilotCli(normalizedPath: string) {
  // Node scripts run under process.execPath and only need to exist.
  return isNodeScriptPath(normalizedPath)
    ? await isReadableFile(normalizedPath)
    : await isExecutableFile(normalizedPath);
}

/**
 * A candidate is accepted when `--help` succeeds, or when it fails but the
 * path looks like a Copilot CLI (a first run can fail while it unpacks).
 */
async function verifyCopilotExecutable(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath || !(await isLaunchableCopilotCli(normalizedPath))) {
    return null;
  }

  const nodeScript = isNodeScriptPath(normalizedPath);
  const result = await runCommandProbe({
    args: nodeScript ? [normalizedPath, "--help"] : ["--help"],
    command: nodeScript ? process.execPath : normalizedPath,
    env,
    timeoutMs: COPILOT_CLI_VERIFY_TIMEOUT_MS,
  });

  if (!result.error) {
    return normalizedPath;
  }

  if (isLikelyCopilotCliPath(normalizedPath)) {
    log.debug("copilot_cli_probe_failed", {
      cliPath: normalizedPath,
      message: result.error.message,
      stderr: result.stderr.trim() || null,
      stdout: result.stdout.trim() || null,
    });
    return normalizedPath;
  }

  return null;
}

export function parseCopilotShellLookupOutput(
  stdout: string,
): CopilotShellLookupResult {
  const { commandPath, pathValue } = parseLoginShellLookupOutput(stdout, {
    commandBasenamePrefix: "copilot",
    markers: COPILOT_LOGIN_SHELL_MARKERS,
  });
  return { copilotPath: commandPath, pathValue };
}

async function resolveCopilotCliFromWindowsWhere(env: NodeJS.ProcessEnv) {
  for (const candidatePath of await listWindowsWhereCandidates("copilot", {
    env,
  })) {
    const verifiedPath = await verifyCopilotExecutable(candidatePath, env);
    if (verifiedPath) {
      return {
        cliPath: verifiedPath,
        env,
      } satisfies Pick<ResolvedCopilotRuntime, "cliPath" | "env">;
    }
  }

  return null;
}

async function resolveCopilotCliFromShell(baseEnv: NodeJS.ProcessEnv) {
  const lookup = await lookupInLoginShell({
    command: "copilot",
    commandBasenamePrefix: "copilot",
    env: baseEnv,
    markers: COPILOT_LOGIN_SHELL_MARKERS,
  });
  if (!lookup) {
    return null;
  }

  const env = lookup.pathValue
    ? {
        ...baseEnv,
        PATH: lookup.pathValue,
      }
    : baseEnv;
  const shellReportedCommand = lookup.commandPath
    ? await verifyCopilotExecutable(lookup.commandPath, env)
    : null;
  const resolvedCommand =
    shellReportedCommand ??
    (await findExecutableInPath(
      "copilot",
      lookup.pathValue,
      COPILOT_NAME_OPTIONS,
    ));
  const verifiedCommand =
    resolvedCommand && (await verifyCopilotExecutable(resolvedCommand, env));

  if (!verifiedCommand) {
    return null;
  }

  return {
    cliPath: verifiedCommand,
    env,
  } satisfies Pick<ResolvedCopilotRuntime, "cliPath" | "env">;
}

function normalizeCopilotError(error: unknown): {
  error: string;
  state: CopilotEngineState;
} {
  const message = error instanceof Error ? error.message : String(error);

  if (isCopilotMissingRuntimeMessage(message)) {
    return {
      error: message.startsWith("GitHub Copilot")
        ? message
        : "GitHub Copilot CLI is not installed or could not be launched from this Sentinel session.",
      state: "missing_runtime",
    };
  }

  if (isCopilotNodeVersionMessage(message)) {
    return {
      error:
        "GitHub Copilot needs a newer Node.js runtime than this Sentinel build is using. Upgrade the app runtime or use a Copilot CLI build supported by this Node.js version.",
      state: "error",
    };
  }

  if (isCopilotAuthErrorMessage(message)) {
    return {
      error:
        "GitHub Copilot needs authentication before it can be used here. Sign in with the GitHub CLI (gh auth login) or the Copilot CLI, or provide a GitHub token.",
      state: "auth_unavailable",
    };
  }

  return {
    error: `GitHub Copilot failed to start: ${message}`,
    state: "error",
  };
}

// One cached resolution per instance (and per configuration of it).
const cachedRuntimes = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedCopilotRuntime> }
>();

export type CopilotRuntimeInstance = EngineBinaryInstance;

const COPILOT_PATH_OVERRIDE_VARIABLES = [
  "SENTINEL_COPILOT_PATH",
  "COPILOT_CLI_PATH",
  "COPILOT_PATH",
] as const;

type CopilotPathOverride = {
  path: string;
  /** The env variable it came from; null for the instance's binaryPath. */
  variable: (typeof COPILOT_PATH_OVERRIDE_VARIABLES)[number] | null;
};

/**
 * Older Sentinel builds wrote every Copilot CLI they discovered to desktop.env
 * as SENTINEL_COPILOT_PATH, and desktop.env is loaded into the server
 * environment, so a SENTINEL_COPILOT_PATH equal to the saved value is a
 * remembered CLI location rather than a choice: it ranks after the bundled
 * runtime (`savedPath`). Any other SENTINEL_COPILOT_PATH, COPILOT_CLI_PATH or
 * COPILOT_PATH is an explicit override. Sentinel no longer writes the value.
 * An instance's binaryPath always overrides; the variables only apply to the
 * default instance.
 */
async function getCopilotPathSettings(
  instance: CopilotRuntimeInstance | null | undefined,
  env: NodeJS.ProcessEnv,
): Promise<{
  override: CopilotPathOverride | null;
  savedPath: string | null;
}> {
  const configured = instance?.config.binaryPath?.trim();
  if (configured) {
    return { override: { path: configured, variable: null }, savedPath: null };
  }
  if (instance && !instance.isDefault) {
    return { override: null, savedPath: null };
  }

  const savedSentinelPath =
    (
      await readLocalRuntimeEnvValue("SENTINEL_COPILOT_PATH").catch(() => null)
    )?.trim() || null;
  let savedPath: string | null = null;

  for (const variable of COPILOT_PATH_OVERRIDE_VARIABLES) {
    const value = env[variable]?.trim();
    if (!value) {
      continue;
    }

    if (variable === "SENTINEL_COPILOT_PATH" && value === savedSentinelPath) {
      savedPath = value;
      continue;
    }

    return { override: { path: value, variable }, savedPath };
  }

  return { override: null, savedPath };
}

const COPILOT_RUNTIME_NOT_FOUND_ERROR =
  "GitHub Copilot runtime was not found. Reinstall Sentinel to restore the bundled runtime, install the Copilot CLI, or set SENTINEL_COPILOT_PATH to its executable path.";

/**
 * Resolution order: an explicit path override, then the runtime bundled with
 * @github/copilot-sdk, then a user-installed `copilot` (the CLI location an
 * older Sentinel saved in desktop.env, managed PATH, `where` on Windows, login
 * shell).
 */
async function resolveCopilotRuntimeUncached(
  instance: CopilotRuntimeInstance | null | undefined,
): Promise<ResolvedCopilotRuntime> {
  const baseEnv = getInstanceProcessEnv(instance);
  const managedPath = await buildManagedExecutablePathValue(baseEnv.PATH, {
    env: baseEnv,
  });
  const runtimeEnv = {
    ...baseEnv,
    PATH: managedPath,
  };
  const { override, savedPath } = await getCopilotPathSettings(
    instance,
    baseEnv,
  );

  if (override) {
    const verifiedOverride = await verifyCopilotExecutable(
      override.path,
      runtimeEnv,
    );

    if (verifiedOverride) {
      log.info("copilot_cli_resolved", {
        cliPath: verifiedOverride,
        source: "env_override",
        variable: override.variable,
      });
      return await rememberCopilotRuntime(instance, {
        cliDetected: true,
        error: null,
        cliPath: verifiedOverride,
        env: runtimeEnv,
        installSource: override.variable ? "env" : "config",
        source: "env_override",
      });
    }

    log.warn("copilot_cli_override_invalid", {
      overridePath: override.path,
      variable: override.variable,
    });
  }

  const bundledRuntime = await resolveBundledCopilotRuntime();
  if (bundledRuntime) {
    log.info("copilot_cli_resolved", {
      cliPath: bundledRuntime.cliPath,
      runtimePackage: bundledRuntime.packageName,
      source: "bundled",
    });
    return await rememberCopilotRuntime(instance, {
      cliDetected: true,
      error: null,
      cliPath: bundledRuntime.cliPath,
      env: runtimeEnv,
      installSource: "sdk-bundled",
      source: "bundled",
    });
  }

  const verifiedSavedPath = savedPath
    ? await verifyCopilotExecutable(savedPath, runtimeEnv)
    : null;
  if (verifiedSavedPath) {
    log.info("copilot_cli_resolved", {
      cliPath: verifiedSavedPath,
      source: "saved_path",
    });
    return await rememberCopilotRuntime(instance, {
      cliDetected: true,
      error: null,
      cliPath: verifiedSavedPath,
      env: runtimeEnv,
      installSource: "env",
      source: "user_cli",
    });
  }

  const directCommand = await findExecutableInPath(
    "copilot",
    managedPath,
    COPILOT_NAME_OPTIONS,
  );
  const verifiedDirectCommand = directCommand
    ? await verifyCopilotExecutable(directCommand, runtimeEnv)
    : null;
  if (verifiedDirectCommand) {
    log.info("copilot_cli_resolved", {
      cliPath: verifiedDirectCommand,
      source: "managed_path",
    });
    return await rememberCopilotRuntime(instance, {
      cliDetected: true,
      error: null,
      cliPath: verifiedDirectCommand,
      env: runtimeEnv,
      installSource: "managed-path",
      source: "user_cli",
    });
  }

  const windowsWhereCommand = await resolveCopilotCliFromWindowsWhere(baseEnv);
  const windowsWherePath = windowsWhereCommand?.cliPath ?? null;
  if (windowsWhereCommand) {
    log.info("copilot_cli_resolved", {
      cliPath: windowsWhereCommand.cliPath,
      source: "windows_where",
    });
    return await rememberCopilotRuntime(instance, {
      cliDetected: true,
      error: null,
      cliPath: windowsWhereCommand.cliPath,
      env: windowsWhereCommand.env,
      installSource: "login-shell",
      source: "user_cli",
    });
  }

  const shellResolution = await resolveCopilotCliFromShell(baseEnv);
  const shellResolvedPath = shellResolution?.cliPath ?? null;
  if (shellResolution) {
    log.info("copilot_cli_resolved", {
      cliPath: shellResolution.cliPath,
      source: "login_shell",
    });
    return await rememberCopilotRuntime(instance, {
      cliDetected: true,
      error: null,
      cliPath: shellResolution.cliPath,
      env: shellResolution.env,
      installSource: "login-shell",
      source: "user_cli",
    });
  }

  log.warn("copilot_cli_not_found", {
    checkedPaths: {
      envOverride: override?.path ?? null,
      managedPathHit: directCommand,
      savedPath,
      shellResolvedPath,
      windowsWherePath,
    },
  });

  return {
    cliDetected: false,
    error: override
      ? `GitHub Copilot runtime path from ${override.variable ?? "the instance's binary path"} is not launchable, and no bundled or installed runtime was found.`
      : COPILOT_RUNTIME_NOT_FOUND_ERROR,
    cliPath: override?.path ?? null,
    env: baseEnv,
    installSource: null,
    source: null,
  };
}

/** Records the runtime in runtime-paths.json (never in desktop.env). */
async function rememberCopilotRuntime(
  instance: CopilotRuntimeInstance | null | undefined,
  runtime: ResolvedCopilotRuntime,
) {
  if (runtime.cliPath && runtime.installSource) {
    await recordResolvedBinary(
      { path: runtime.cliPath, source: runtime.installSource, version: null },
      { instanceId: instance?.id ?? "copilot" },
    );
  }
  return runtime;
}

export async function resolveCopilotRuntime(options?: {
  instance?: CopilotRuntimeInstance | null;
}) {
  const key = getInstanceRuntimeKey(options?.instance);
  const cached = cachedRuntimes.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return await cached.promise;
  }

  const promise = resolveCopilotRuntimeUncached(options?.instance).catch(
    (error) => {
      if (cachedRuntimes.get(key)?.promise === promise) {
        cachedRuntimes.delete(key);
      }
      throw error;
    },
  );

  cachedRuntimes.set(key, {
    expiresAt: Date.now() + COPILOT_RUNTIME_CACHE_TTL_MS,
    promise,
  });

  return await promise;
}

export function resetCopilotRuntimeCache() {
  cachedRuntimes.clear();
}

// Sentinel's own secrets stay out of the runtime and of the shell commands,
// MCP servers and extensions it starts (an extension can be granted env access
// without a prompt in full access mode); see SENTINEL_PRIVATE_ENV_KEYS.

function toCopilotRuntimeEnv(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        !SENTINEL_PRIVATE_ENV_KEYS.has(entry[0]),
    ),
  );
}

/**
 * Client options for SDK 1.x, which dropped the CLI path, auto-start and cwd
 * client options: the resolved runtime is spawned over stdio and starts on
 * first use. Auth stays on the SDK default (the logged-in user, or
 * GH_TOKEN/GITHUB_TOKEN from the environment). COPILOT_HOME stays at
 * ~/.copilot, so sessions and logins are shared with the user's Copilot CLI,
 * unless an instance has a home of its own (`baseDirectory`).
 */
export function buildCopilotClientOptions(runtime: {
  baseDirectory?: string | null;
  env: NodeJS.ProcessEnv;
  runtimePath: string;
}): CopilotClientOptions {
  return {
    ...(runtime.baseDirectory ? { baseDirectory: runtime.baseDirectory } : {}),
    clientInfo: { applicationName: "sentinel" },
    connection: RuntimeConnection.forStdio({
      env: toCopilotRuntimeEnv(runtime.env),
      path: runtime.runtimePath,
    }),
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "error",
    workingDirectory: process.cwd(),
  };
}

export type CopilotClientManagerOptions = {
  /** The engine instance this client runs for (default: the default). */
  instance?: CopilotRuntimeInstance | null;
};

export class CopilotClientManager {
  private client: CopilotClient | null = null;

  private readonly instance: CopilotRuntimeInstance | null;

  constructor(options: CopilotClientManagerOptions = {}) {
    this.instance = options.instance ?? null;
  }

  /** Stops the client and its runtime; the next use starts them again. */
  async dispose() {
    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }

    const errors = await client.stop().catch((error: unknown) => [error]);
    if (errors.length > 0) {
      await client.forceStop().catch(() => undefined);
    }
  }

  async getClient() {
    const runtime = await resolveCopilotRuntime({ instance: this.instance });
    if (!runtime.cliDetected || !runtime.cliPath) {
      throw new Error(
        runtime.error ??
          "GitHub Copilot runtime was not detected in this Sentinel session.",
      );
    }

    const client = (this.client ??= new CopilotClient(
      buildCopilotClientOptions({
        // An instance home (config.homePath or COPILOT_HOME in its env)
        // isolates sessions, config and logins from ~/.copilot.
        baseDirectory: this.instance?.envOverrides.COPILOT_HOME ?? null,
        env: runtime.env,
        runtimePath: runtime.cliPath,
      }),
    ));

    try {
      // A no-op once connected; concurrent callers share one in-flight start,
      // and a runtime whose connection closed is started again.
      await client.start();
    } catch (error) {
      if (this.client === client) {
        this.client = null;
      }
      throw error;
    }

    return client;
  }

  async createSession(config: SessionConfig) {
    const client = await this.getClient();
    return await client.createSession(config);
  }

  async resumeSession(sessionId: string, config: ResumeSessionConfig) {
    const client = await this.getClient();
    return await client.resumeSession(sessionId, config);
  }

  /**
   * The reasoning efforts the runtime lists for a model, or null when the
   * model list is unavailable. The SDK caches listModels per connection.
   */
  async getSupportedReasoningEfforts(modelId: string) {
    try {
      const client = await this.getClient();
      const models = await withTimeout(
        client.listModels(),
        COPILOT_STATUS_QUERY_TIMEOUT_MS,
      );
      const model = models?.find((candidate) => candidate.id === modelId);
      return model ? (model.supportedReasoningEfforts ?? []) : null;
    } catch {
      return null;
    }
  }
}

const copilotClientManagers = getInstanceResources<CopilotClientManager>(
  "copilot-client",
  {
    dispose: (manager) => manager.dispose(),
    onDisposeError: (error, instanceId) =>
      log.warn("dispose_failed", { error, instanceId }),
  },
);

/**
 * The client manager for an instance: one Copilot runtime per instance,
 * keyed by its runtime configuration (binary, COPILOT_HOME, env), so a
 * configuration change starts a fresh runtime. Without an instance, the
 * default instance's manager.
 */
export function getCopilotClientManager(
  instance?: CopilotRuntimeInstance | null,
) {
  return copilotClientManagers.get(
    instance?.id ?? "copilot",
    getInstanceRuntimeKey(instance),
    () => new CopilotClientManager({ instance }),
  );
}

// One cached status per instance (and per configuration of it).
const cachedStatuses = new Map<
  string,
  { expiresAt: number; promise: Promise<CopilotEngineStatus> }
>();

async function probeCopilotEngineStatus(
  instance: CopilotRuntimeInstance | null | undefined,
): Promise<CopilotEngineStatus> {
  const runtime = await resolveCopilotRuntime({ instance });
  const snapshotPath = getCopilotStatusSnapshotPath(instance);

  if (!runtime.cliDetected || !runtime.cliPath) {
    return buildCopilotEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: false,
      cliPath: null,
      cliVersion: null,
      error: runtime.error ?? COPILOT_RUNTIME_NOT_FOUND_ERROR,
      lastSuccessfulProbeAt: null,
      runtimeSource: null,
      state: "missing_runtime",
      usedCachedStatus: false,
    });
  }

  const cachedSnapshot = await readCopilotStatusSnapshot(snapshotPath, {
    cliPath: runtime.cliPath,
  });

  try {
    const client = await withTimeout(
      getCopilotClientManager(instance).getClient(),
      COPILOT_STARTUP_TIMEOUT_MS,
    );

    if (!client) {
      return cachedSnapshot
        ? buildCachedCopilotStatus({
            cliPath: runtime.cliPath,
            runtimeSource: runtime.source,
            snapshot: cachedSnapshot,
          })
        : buildCopilotEngineStatus({
            account: null,
            authReady: false,
            availableModels: [],
            cliDetected: true,
            cliPath: runtime.cliPath,
            cliVersion: null,
            error:
              "GitHub Copilot took too long to start. Try again after the runtime finishes booting.",
            lastSuccessfulProbeAt: null,
            runtimeSource: runtime.source,
            state: "timeout_no_cache",
            usedCachedStatus: false,
          });
    }

    const statusResult = await withTimeout(
      Promise.all([client.getStatus(), client.getAuthStatus()]),
      COPILOT_STATUS_QUERY_TIMEOUT_MS,
    );

    if (!statusResult) {
      return cachedSnapshot
        ? buildCachedCopilotStatus({
            cliPath: runtime.cliPath,
            runtimeSource: runtime.source,
            snapshot: cachedSnapshot,
          })
        : buildCopilotEngineStatus({
            account: null,
            authReady: false,
            availableModels: [],
            cliDetected: true,
            cliPath: runtime.cliPath,
            cliVersion: null,
            error:
              "GitHub Copilot took too long to answer the status check. Try reloading the runtime.",
            lastSuccessfulProbeAt: null,
            runtimeSource: runtime.source,
            state: "timeout_no_cache",
            usedCachedStatus: false,
          });
    }

    const [status, authStatus] = statusResult;
    const account = toCopilotAccountInfo(authStatus);

    if (!authStatus.isAuthenticated) {
      return buildCopilotEngineStatus({
        account,
        authReady: false,
        availableModels: [],
        cliDetected: true,
        cliPath: runtime.cliPath,
        cliVersion: status.version ?? null,
        error:
          authStatus.statusMessage ??
          "GitHub Copilot needs authentication before it can be used here.",
        lastSuccessfulProbeAt: null,
        runtimeSource: runtime.source,
        state: "auth_unavailable",
        usedCachedStatus: false,
      });
    }

    const modelsResult = await withTimeout(
      client.listModels(),
      COPILOT_STATUS_QUERY_TIMEOUT_MS,
    );

    if (!modelsResult) {
      return cachedSnapshot
        ? buildCachedCopilotStatus({
            cliPath: runtime.cliPath,
            runtimeSource: runtime.source,
            snapshot: cachedSnapshot,
          })
        : buildCopilotEngineStatus({
            account,
            authReady: true,
            availableModels: [],
            cliDetected: true,
            cliPath: runtime.cliPath,
            cliVersion: status.version ?? null,
            error:
              "GitHub Copilot took too long to return its model list. Try reloading the runtime.",
            lastSuccessfulProbeAt: null,
            runtimeSource: runtime.source,
            state: "timeout_no_cache",
            usedCachedStatus: false,
          });
    }

    const availableModels = modelsResult.map((model, index) =>
      toCopilotModelInfo(model, index),
    );
    const recordedAt = new Date().toISOString();

    await writeCopilotStatusSnapshot(snapshotPath, {
      account,
      availableModels,
      cliPath: runtime.cliPath,
      cliVersion: status.version ?? null,
      recordedAt,
    });

    return buildCopilotEngineStatus({
      account,
      authReady: true,
      availableModels,
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: status.version ?? null,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      runtimeSource: runtime.source,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    const normalized = normalizeCopilotError(error);

    return buildCopilotEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: null,
      error: normalized.error,
      lastSuccessfulProbeAt: cachedSnapshot?.recordedAt ?? null,
      runtimeSource: runtime.source,
      state: normalized.state,
      usedCachedStatus: false,
    });
  }
}

export async function getCopilotEngineStatus(options?: {
  forceRefresh?: boolean;
  instance?: CopilotRuntimeInstance | null;
}) {
  const key = getInstanceRuntimeKey(options?.instance);
  const cached = cachedStatuses.get(key);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return await cached.promise;
  }

  const promise = probeCopilotEngineStatus(options?.instance).catch((error) => {
    if (cachedStatuses.get(key)?.promise === promise) {
      cachedStatuses.delete(key);
    }
    throw error;
  });

  cachedStatuses.set(key, {
    expiresAt: Date.now() + COPILOT_STATUS_CACHE_TTL_MS,
    promise,
  });

  return await promise;
}

export function resetCopilotEngineStatusCache() {
  cachedStatuses.clear();
}

export function isCopilotEngineAvailable(status: CopilotEngineStatus) {
  return (
    status.cliDetected &&
    ((status.state === "ready" && status.authReady) ||
      (status.state === "timeout_using_cache" &&
        status.authReady &&
        status.availableModels.length > 0))
  );
}

export function buildCopilotThreadState(input: {
  cwd?: string | null;
  modelId?: string | null;
  reasoningEffort?: CopilotThreadState["reasoningEffort"];
  sessionId: string;
}) {
  return {
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
    ...(input.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: input.reasoningEffort }),
    sessionId: input.sessionId,
  } satisfies CopilotThreadState;
}

export function normalizeCopilotErrorMessage(
  error: unknown,
  fallback = "GitHub Copilot failed to start.",
) {
  if (!error) {
    return fallback;
  }

  const normalized = normalizeCopilotError(error);
  return normalized.error || fallback;
}
