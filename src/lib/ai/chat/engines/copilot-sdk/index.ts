import "server-only";

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

import type { CopilotThreadState } from "@/lib/ai/chat/engines/types";
import { createLogger } from "@/lib/logger";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { readLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  getPlatformHomeDirectory,
} from "@/lib/runtime/platform-paths";
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
const SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const COPILOT_PATH_START_MARKER = "__SENTINEL_COPILOT_PATH_START__";
const COPILOT_PATH_END_MARKER = "__SENTINEL_COPILOT_PATH_END__";
const COPILOT_SHELL_PATH_START_MARKER = "__SENTINEL_COPILOT_SHELL_PATH_START__";
const COPILOT_SHELL_PATH_END_MARKER = "__SENTINEL_COPILOT_SHELL_PATH_END__";

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
  source: CopilotRuntimeSource | null;
};

type CopilotShellLookupResult = {
  copilotPath: string | null;
  pathValue: string | null;
};

function getLocalStateDirectory() {
  return getSentinelStateRoot();
}

function getCopilotStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), COPILOT_STATUS_SNAPSHOT_FILE);
}

async function writeCopilotStatusSnapshot(snapshot: CopilotStatusSnapshot) {
  const snapshotPath = getCopilotStatusSnapshotPath();
  const localStateDirectory = getLocalStateDirectory();

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

async function readCopilotStatusSnapshot(options: { cliPath: string }) {
  try {
    const rawSnapshot = await readFile(getCopilotStatusSnapshotPath(), "utf8");
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

function getExecutableNames(command: string) {
  if (process.platform !== "win32") {
    return [command];
  }

  const pathExt = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);

  const names = new Set<string>([command]);
  const lowerCommand = command.toLowerCase();
  for (const extension of pathExt) {
    if (lowerCommand.endsWith(extension.toLowerCase())) {
      continue;
    }

    names.add(`${command}${extension}`);
  }

  return [...names];
}

function isNodeScriptPath(candidatePath: string) {
  const extension = path.extname(candidatePath).toLowerCase();
  return extension === ".js" || extension === ".cjs" || extension === ".mjs";
}

function normalizeCandidatePath(candidatePath: string) {
  const trimmedPath = candidatePath.trim();
  if (!trimmedPath) {
    return null;
  }

  return path.isAbsolute(trimmedPath)
    ? path.normalize(trimmedPath)
    : path.resolve(process.cwd(), trimmedPath);
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

async function isExecutable(candidatePath: string) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath) {
    return false;
  }

  try {
    await access(
      normalizedPath,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

async function isLaunchableCopilotCli(candidatePath: string) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath) {
    return false;
  }

  if (isNodeScriptPath(normalizedPath)) {
    try {
      await access(normalizedPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  return await isExecutable(normalizedPath);
}

async function findExecutableInPath(
  command: string,
  pathValue?: string | null,
) {
  if (!pathValue) {
    return null;
  }

  const searchPaths = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const directory of searchPaths) {
    const resolvedDirectory = path.isAbsolute(directory)
      ? directory
      : path.resolve(process.cwd(), directory);
    for (const executableName of getExecutableNames(command)) {
      const candidatePath = path.join(resolvedDirectory, executableName);
      if (await isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

async function verifyCopilotExecutable(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath || !(await isLaunchableCopilotCli(normalizedPath))) {
    return null;
  }

  const verifiedPath = await new Promise<string | null>((resolve) => {
    const command = isNodeScriptPath(normalizedPath)
      ? process.execPath
      : normalizedPath;
    const args = isNodeScriptPath(normalizedPath)
      ? [normalizedPath, "--help"]
      : ["--help"];

    execFile(
      command,
      args,
      {
        env,
        timeout: COPILOT_CLI_VERIFY_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          if (isLikelyCopilotCliPath(normalizedPath)) {
            log.debug("copilot_cli_probe_failed", {
              cliPath: normalizedPath,
              message: error.message,
              stderr: stderr.trim() || null,
              stdout: stdout.trim() || null,
            });
            resolve(normalizedPath);
            return;
          }

          resolve(null);
          return;
        }

        resolve(normalizedPath);
      },
    );
  });

  return verifiedPath;
}

async function getManagedPathValue(pathValue?: string | null) {
  return buildManagedExecutablePathValue(pathValue);
}

function buildLoginShellLookupArgs(script: string) {
  return ["-l", "-c", script];
}

function buildPosixShellLookupScript() {
  return [
    "if command -v copilot >/dev/null 2>&1; then",
    `  printf '%s\\n' '${COPILOT_PATH_START_MARKER}'`,
    "command -v copilot",
    `  printf '%s\\n' '${COPILOT_PATH_END_MARKER}'`,
    "fi",
    `printf '%s\\n' '${COPILOT_SHELL_PATH_START_MARKER}'`,
    `printf '%s\\n' "$PATH"`,
    `printf '%s\\n' '${COPILOT_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function buildFishShellLookupScript() {
  return [
    "if command -v copilot >/dev/null 2>/dev/null",
    `  printf '%s\\n' '${COPILOT_PATH_START_MARKER}'`,
    "command -v copilot",
    `  printf '%s\\n' '${COPILOT_PATH_END_MARKER}'`,
    "end",
    `printf '%s\\n' '${COPILOT_SHELL_PATH_START_MARKER}'`,
    "printf '%s\\n' (string join : -- $PATH)",
    `printf '%s\\n' '${COPILOT_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

export function parseCopilotShellLookupOutput(
  stdout: string,
): CopilotShellLookupResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const readBlock = (startMarker: string, endMarker: string) => {
    const startIndex = lines.indexOf(startMarker);
    const endIndex = lines.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return [];
    }

    return lines.slice(startIndex + 1, endIndex);
  };

  const copilotPathBlock = readBlock(
    COPILOT_PATH_START_MARKER,
    COPILOT_PATH_END_MARKER,
  );
  const pathBlock = readBlock(
    COPILOT_SHELL_PATH_START_MARKER,
    COPILOT_SHELL_PATH_END_MARKER,
  );

  const copilotPath =
    copilotPathBlock.find((line) =>
      path.basename(line).startsWith("copilot"),
    ) ?? null;
  const pathValue = pathBlock.find(Boolean) ?? null;

  return {
    copilotPath,
    pathValue,
  };
}

async function resolveCopilotCliFromWindowsWhere() {
  if (process.platform !== "win32") {
    return null;
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("where", ["copilot"], { env: process.env }, (error, output) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(output.trim());
    });
  }).catch(() => null);

  if (!stdout) {
    return null;
  }

  const candidates = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const candidatePath of candidates) {
    const verifiedPath = await verifyCopilotExecutable(
      candidatePath,
      process.env,
    );
    if (verifiedPath) {
      return {
        cliPath: verifiedPath,
        env: process.env,
      } satisfies Pick<ResolvedCopilotRuntime, "cliPath" | "env">;
    }
  }

  return null;
}

async function resolveCopilotCliFromShell() {
  if (process.platform === "win32") {
    return null;
  }

  const shellPath = process.env.SHELL?.trim() || "/bin/zsh";
  const shellName = path.basename(shellPath).toLowerCase();
  const shellLookupScript =
    shellName === "fish"
      ? buildFishShellLookupScript()
      : buildPosixShellLookupScript();

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      shellPath,
      buildLoginShellLookupArgs(shellLookupScript),
      {
        env: {
          ...process.env,
          HOME: getPlatformHomeDirectory(),
          TERM: process.env.TERM ?? "dumb",
        },
        timeout: SHELL_LOOKUP_TIMEOUT_MS,
      },
      (error, shellStdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(shellStdout.trim());
      },
    );
  }).catch(() => null);

  if (!stdout) {
    return null;
  }

  const { copilotPath, pathValue } = parseCopilotShellLookupOutput(stdout);
  const env = pathValue
    ? {
        ...process.env,
        PATH: pathValue,
      }
    : process.env;
  const shellReportedCommand = copilotPath
    ? await verifyCopilotExecutable(copilotPath, env)
    : null;
  const resolvedCommand =
    shellReportedCommand ?? (await findExecutableInPath("copilot", pathValue));
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

let cachedRuntime: {
  expiresAt: number;
  promise: Promise<ResolvedCopilotRuntime>;
} | null = null;

const COPILOT_PATH_OVERRIDE_VARIABLES = [
  "SENTINEL_COPILOT_PATH",
  "COPILOT_CLI_PATH",
  "COPILOT_PATH",
] as const;

type CopilotPathOverride = {
  path: string;
  variable: (typeof COPILOT_PATH_OVERRIDE_VARIABLES)[number];
};

/**
 * Older Sentinel builds wrote every Copilot CLI they discovered to desktop.env
 * as SENTINEL_COPILOT_PATH, and desktop.env is loaded into the server
 * environment, so a SENTINEL_COPILOT_PATH equal to the saved value is a
 * remembered CLI location rather than a choice: it ranks after the bundled
 * runtime (`savedPath`). Any other SENTINEL_COPILOT_PATH, COPILOT_CLI_PATH or
 * COPILOT_PATH is an explicit override. Sentinel no longer writes the value.
 */
async function getCopilotPathSettings(): Promise<{
  override: CopilotPathOverride | null;
  savedPath: string | null;
}> {
  const savedSentinelPath =
    (
      await readLocalRuntimeEnvValue("SENTINEL_COPILOT_PATH").catch(() => null)
    )?.trim() || null;
  let savedPath: string | null = null;

  for (const variable of COPILOT_PATH_OVERRIDE_VARIABLES) {
    const value = process.env[variable]?.trim();
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
async function resolveCopilotRuntimeUncached(): Promise<ResolvedCopilotRuntime> {
  const managedPath = await getManagedPathValue(process.env.PATH);
  const runtimeEnv = {
    ...process.env,
    PATH: managedPath,
  };
  const { override, savedPath } = await getCopilotPathSettings();

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
      return {
        cliDetected: true,
        error: null,
        cliPath: verifiedOverride,
        env: runtimeEnv,
        source: "env_override",
      };
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
    return {
      cliDetected: true,
      error: null,
      cliPath: bundledRuntime.cliPath,
      env: runtimeEnv,
      source: "bundled",
    };
  }

  const verifiedSavedPath = savedPath
    ? await verifyCopilotExecutable(savedPath, runtimeEnv)
    : null;
  if (verifiedSavedPath) {
    log.info("copilot_cli_resolved", {
      cliPath: verifiedSavedPath,
      source: "saved_path",
    });
    return {
      cliDetected: true,
      error: null,
      cliPath: verifiedSavedPath,
      env: runtimeEnv,
      source: "user_cli",
    };
  }

  const directCommand = await findExecutableInPath("copilot", managedPath);
  const verifiedDirectCommand = directCommand
    ? await verifyCopilotExecutable(directCommand, runtimeEnv)
    : null;
  if (verifiedDirectCommand) {
    log.info("copilot_cli_resolved", {
      cliPath: verifiedDirectCommand,
      source: "managed_path",
    });
    return {
      cliDetected: true,
      error: null,
      cliPath: verifiedDirectCommand,
      env: runtimeEnv,
      source: "user_cli",
    };
  }

  const windowsWhereCommand = await resolveCopilotCliFromWindowsWhere();
  const windowsWherePath = windowsWhereCommand?.cliPath ?? null;
  if (windowsWhereCommand) {
    log.info("copilot_cli_resolved", {
      cliPath: windowsWhereCommand.cliPath,
      source: "windows_where",
    });
    return {
      cliDetected: true,
      error: null,
      cliPath: windowsWhereCommand.cliPath,
      env: windowsWhereCommand.env,
      source: "user_cli",
    };
  }

  const shellResolution = await resolveCopilotCliFromShell();
  const shellResolvedPath = shellResolution?.cliPath ?? null;
  if (shellResolution) {
    log.info("copilot_cli_resolved", {
      cliPath: shellResolution.cliPath,
      source: "login_shell",
    });
    return {
      cliDetected: true,
      error: null,
      cliPath: shellResolution.cliPath,
      env: shellResolution.env,
      source: "user_cli",
    };
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
      ? `GitHub Copilot runtime path from ${override.variable} is not launchable, and no bundled or installed runtime was found.`
      : COPILOT_RUNTIME_NOT_FOUND_ERROR,
    cliPath: override?.path ?? null,
    env: process.env,
    source: null,
  };
}

export async function resolveCopilotRuntime() {
  if (cachedRuntime && cachedRuntime.expiresAt > Date.now()) {
    return await cachedRuntime.promise;
  }

  const promise = resolveCopilotRuntimeUncached().catch((error) => {
    const current = cachedRuntime;
    if (current?.promise === promise) {
      cachedRuntime = null;
    }
    throw error;
  });

  cachedRuntime = {
    expiresAt: Date.now() + COPILOT_RUNTIME_CACHE_TTL_MS,
    promise,
  };

  return await promise;
}

export function resetCopilotRuntimeCache() {
  cachedRuntime = null;
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
 * GH_TOKEN/GITHUB_TOKEN from the environment) and COPILOT_HOME stays at
 * ~/.copilot, so sessions and logins are shared with the user's Copilot CLI.
 */
export function buildCopilotClientOptions(runtime: {
  env: NodeJS.ProcessEnv;
  runtimePath: string;
}): CopilotClientOptions {
  return {
    clientInfo: { applicationName: "sentinel" },
    connection: RuntimeConnection.forStdio({
      env: toCopilotRuntimeEnv(runtime.env),
      path: runtime.runtimePath,
    }),
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "error",
    workingDirectory: process.cwd(),
  };
}

class CopilotClientManager {
  private client: CopilotClient | null = null;

  async getClient() {
    const runtime = await resolveCopilotRuntime();
    if (!runtime.cliDetected || !runtime.cliPath) {
      throw new Error(
        runtime.error ??
          "GitHub Copilot runtime was not detected in this Sentinel session.",
      );
    }

    const client = (this.client ??= new CopilotClient(
      buildCopilotClientOptions({
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

let globalCopilotClientManager: CopilotClientManager | null = null;

export function getCopilotClientManager() {
  globalCopilotClientManager ??= new CopilotClientManager();
  return globalCopilotClientManager;
}

let cachedStatus: {
  expiresAt: number;
  promise: Promise<CopilotEngineStatus>;
} | null = null;

async function probeCopilotEngineStatus(): Promise<CopilotEngineStatus> {
  const runtime = await resolveCopilotRuntime();

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

  const cachedSnapshot = await readCopilotStatusSnapshot({
    cliPath: runtime.cliPath,
  });

  try {
    const client = await withTimeout(
      getCopilotClientManager().getClient(),
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

    await writeCopilotStatusSnapshot({
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
}) {
  if (
    !options?.forceRefresh &&
    cachedStatus &&
    cachedStatus.expiresAt > Date.now()
  ) {
    return await cachedStatus.promise;
  }

  const promise = probeCopilotEngineStatus().catch((error) => {
    const current = cachedStatus;
    if (current?.promise === promise) {
      cachedStatus = null;
    }
    throw error;
  });

  cachedStatus = {
    expiresAt: Date.now() + COPILOT_STATUS_CACHE_TTL_MS,
    promise,
  };

  return await promise;
}

export function resetCopilotEngineStatusCache() {
  cachedStatus = null;
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
