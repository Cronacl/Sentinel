import "server-only";

import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import {
  query,
  type AccountInfo,
  type ModelInfo,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";

import { createLogger } from "@/lib/logger";
import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import type {
  ClaudePermissionMode,
  ClaudeThreadState,
} from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

const log = createLogger("ClaudeSdk");
const CLAUDE_STATUS_CACHE_TTL_MS = 15_000;
const CLAUDE_SETTING_SOURCES = ["user", "project", "local"] as const;
const CLAUDE_CODE_PATH_START_MARKER = "__SENTINEL_CLAUDE_PATH_START__";
const CLAUDE_CODE_PATH_END_MARKER = "__SENTINEL_CLAUDE_PATH_END__";
const CLAUDE_SHELL_PATH_START_MARKER = "__SENTINEL_CLAUDE_SHELL_PATH_START__";
const CLAUDE_SHELL_PATH_END_MARKER = "__SENTINEL_CLAUDE_SHELL_PATH_END__";
const CLAUDE_RUNTIME_CACHE_TTL_MS = 15_000;
const CLAUDE_BINARY_VERIFY_TIMEOUT_MS = 1_500;
const SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const CLAUDE_STATUS_QUERY_TIMEOUT_MS = 3_000;
const CLAUDE_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const CLAUDE_STATUS_SNAPSHOT_FILE = "claude-status.json";

type ClaudeSdkEffort = "low" | "medium" | "high" | "max";
export type ClaudeEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_binary"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";
type ClaudeShellLookupResult = {
  claudePath: string | null;
  pathValue: string | null;
};

export type ResolvedClaudeCodeRuntime = {
  binaryDetected: boolean;
  binaryVersion: string | null;
  env: NodeJS.ProcessEnv;
  executablePath: string | null;
};

export type ClaudeModelInfo = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort;
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

export type ClaudeEngineStatus = {
  account: AccountInfo | null;
  authReady: boolean;
  availableModels: ClaudeModelInfo[];
  binaryDetected: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  engine: "claude";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  sdkDetected: boolean;
  state: ClaudeEngineState;
  usedCachedStatus: boolean;
};

type ClaudeStatusSnapshot = {
  account: AccountInfo | null;
  availableModels: ClaudeModelInfo[];
  binaryPath: string;
  binaryVersion: string | null;
  recordedAt: string;
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(null);
    }, timeoutMs);

    void promise
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve(null);
      });
  });
}

let cachedStatus: {
  expiresAt: number;
  promise: Promise<ClaudeEngineStatus>;
} | null = null;
let cachedRuntime: {
  expiresAt: number;
  promise: Promise<ResolvedClaudeCodeRuntime>;
} | null = null;
let backgroundStatusRefresh: Promise<void> | null = null;

function getLocalStateDirectory() {
  return path.join(process.env.HOME?.trim() || os.homedir(), ".sentinel");
}

function getClaudeStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), CLAUDE_STATUS_SNAPSHOT_FILE);
}

async function persistResolvedClaudeCodePath(executablePath: string | null) {
  try {
    await setLocalRuntimeEnvValue("SENTINEL_CLAUDE_PATH", executablePath);
  } catch (error) {
    log.warn("persist_claude_path_failed", { error });
  }
}

async function writeClaudeStatusSnapshot(snapshot: ClaudeStatusSnapshot) {
  const snapshotPath = getClaudeStatusSnapshotPath();
  const localStateDirectory = getLocalStateDirectory();

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), {
    encoding: "utf8",
    mode: LOCAL_STATE_FILE_MODE,
  });
  await chmod(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await chmod(snapshotPath, LOCAL_STATE_FILE_MODE);
}

async function readClaudeStatusSnapshot(options: { binaryPath: string }) {
  try {
    const rawSnapshot = await readFile(getClaudeStatusSnapshotPath(), "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<ClaudeStatusSnapshot>;

    if (
      typeof parsed.binaryPath !== "string" ||
      parsed.binaryPath !== options.binaryPath ||
      typeof parsed.recordedAt !== "string" ||
      !Array.isArray(parsed.availableModels)
    ) {
      return null;
    }

    const recordedAt = new Date(parsed.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) {
      return null;
    }

    if (Date.now() - recordedAt.getTime() > CLAUDE_STATUS_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return {
      account: (parsed.account as AccountInfo | null | undefined) ?? null,
      availableModels: parsed.availableModels as ClaudeModelInfo[],
      binaryPath: parsed.binaryPath,
      binaryVersion:
        typeof parsed.binaryVersion === "string" ? parsed.binaryVersion : null,
      recordedAt: recordedAt.toISOString(),
    } satisfies ClaudeStatusSnapshot;
  } catch {
    return null;
  }
}

function normalizeClaudeEffort(effort: ClaudeSdkEffort): ReasoningEffort {
  switch (effort) {
    case "low":
    case "medium":
    case "high":
      return effort;
    case "max":
      return "high";
  }
}

function normalizeClaudeReasoningEfforts(model: ModelInfo) {
  const levels = (model.supportedEffortLevels ?? ["low", "medium", "high"])
    .map(normalizeClaudeEffort)
    .filter(
      (effort, index, array) =>
        array.indexOf(effort) === index &&
        (effort === "low" || effort === "medium" || effort === "high"),
    );

  return levels.map((effort) => ({
    description: `${model.displayName} supports ${effort} reasoning effort.`,
    effort,
    label: effort[0]!.toUpperCase() + effort.slice(1),
  }));
}

function getClaudeModelInputModalities(model: ModelInfo) {
  return model.description.toLowerCase().includes("vision")
    ? ["text", "image"]
    : ["text"];
}

const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-opus-4-5": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-sonnet-4-5-20250929": 200_000,
  "claude-opus-4-1": 200_000,
  "claude-opus-4-0": 200_000,
  "claude-sonnet-4-0": 200_000,
  "claude-4-sonnet-20250514": 200_000,
  "claude-3-7-sonnet-latest": 200_000,
  "claude-3-7-sonnet-20250219": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-5-haiku-latest": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
};

function resolveClaudeContextWindow(model: ModelInfo) {
  return CLAUDE_CONTEXT_WINDOWS[model.value];
}

function toClaudeModelInfo(model: ModelInfo): ClaudeModelInfo {
  const supportedReasoningEfforts = normalizeClaudeReasoningEfforts(model);

  return {
    contextWindow: resolveClaudeContextWindow(model),
    defaultReasoningEffort: supportedReasoningEfforts[0]?.effort ?? "medium",
    description: model.description,
    displayName: model.displayName,
    id: model.value,
    inputModalities: getClaudeModelInputModalities(model),
    isDefault: false,
    model: model.value,
    supportedReasoningEfforts,
  };
}

export function resolveClaudeSdkExecutable(command: string) {
  if (command === "node" || command === "bun") {
    return process.execPath;
  }

  return command;
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

async function isExecutable(candidatePath: string) {
  try {
    await access(
      candidatePath,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
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
    for (const executableName of getExecutableNames(command)) {
      const candidatePath = path.join(directory, executableName);
      if (await isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

async function verifyClaudeExecutable(
  candidatePath: string,
  env: NodeJS.ProcessEnv,
) {
  if (!(await isExecutable(candidatePath))) {
    return null;
  }

  const output = await new Promise<{
    stderr: string;
    stdout: string;
  } | null>((resolve) => {
    execFile(
      candidatePath,
      ["--version"],
      {
        env,
        timeout: CLAUDE_BINARY_VERIFY_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }

        resolve({ stderr, stdout });
      },
    );
  });

  if (!output) {
    return null;
  }

  const version =
    `${output.stdout}\n${output.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null;

  return {
    binaryVersion: version,
    executablePath: candidatePath,
  };
}

function buildClaudeEngineStatus(input: {
  account: AccountInfo | null;
  authReady: boolean;
  availableModels: ClaudeModelInfo[];
  binaryDetected: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  state: ClaudeEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    account: input.account,
    authReady: input.authReady,
    availableModels: input.availableModels,
    binaryDetected: input.binaryDetected,
    binaryPath: input.binaryPath,
    binaryVersion: input.binaryVersion,
    engine: "claude" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    sdkDetected: input.binaryDetected,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies ClaudeEngineStatus;
}

function buildCachedClaudeStatus(input: {
  binaryPath: string;
  binaryVersion: string | null;
  snapshot: ClaudeStatusSnapshot;
}) {
  return buildClaudeEngineStatus({
    account: input.snapshot.account,
    authReady: input.snapshot.availableModels.length > 0,
    availableModels: input.snapshot.availableModels,
    binaryDetected: true,
    binaryPath: input.binaryPath,
    binaryVersion: input.binaryVersion,
    error: null,
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    state: "ready",
    usedCachedStatus: true,
  });
}

function isClaudeAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("login") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("unauth")
  );
}

export function isClaudeEngineAvailable(status: ClaudeEngineStatus) {
  return status.state === "ready" || status.state === "timeout_no_cache";
}

function getPreferredPathValue(pathValue?: string | null) {
  const homePath = process.env.HOME ?? os.homedir();
  const candidateEntries =
    process.platform === "win32"
      ? []
      : [
          path.join(homePath, ".bun", "bin"),
          path.join(homePath, ".local", "bin"),
          path.join(homePath, "bin"),
          path.join(homePath, ".volta", "bin"),
          path.join(homePath, ".asdf", "shims"),
          path.join(homePath, ".nodenv", "shims"),
          path.join(homePath, ".nvm", "current", "bin"),
          path.join(homePath, ".fnm", "current", "bin"),
          path.join(homePath, "Library", "pnpm"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/opt/local/bin",
          "/usr/bin",
          "/bin",
        ];
  const entries = [
    ...(pathValue ?? "")
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean),
    ...candidateEntries,
  ];

  return Array.from(new Set(entries)).join(path.delimiter);
}

async function listSubdirectories(rootPath: string) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name));
  } catch {
    return [];
  }
}

async function getManagedPathValue(pathValue?: string | null) {
  const homePath = process.env.HOME ?? os.homedir();
  const managedEntries =
    process.platform === "win32"
      ? []
      : [
          ...(
            await listSubdirectories(
              path.join(homePath, ".nvm", "versions", "node"),
            )
          ).map((directory) => path.join(directory, "bin")),
          ...(
            await listSubdirectories(
              path.join(homePath, ".fnm", "node-versions"),
            )
          ).map((directory) => path.join(directory, "installation", "bin")),
          ...(
            await listSubdirectories(
              path.join(homePath, ".local", "share", "fnm", "node-versions"),
            )
          ).map((directory) => path.join(directory, "installation", "bin")),
        ];

  return getPreferredPathValue(
    [pathValue, ...managedEntries].filter(Boolean).join(path.delimiter),
  );
}

function buildLoginShellLookupArgs(script: string) {
  return ["-l", "-c", script];
}

function buildPosixShellLookupScript() {
  return [
    "if command -v claude >/dev/null 2>&1; then",
    `  printf '%s\\n' '${CLAUDE_CODE_PATH_START_MARKER}'`,
    "  command -v claude",
    `  printf '%s\\n' '${CLAUDE_CODE_PATH_END_MARKER}'`,
    "fi",
    `printf '%s\\n' '${CLAUDE_SHELL_PATH_START_MARKER}'`,
    `printf '%s\\n' "$PATH"`,
    `printf '%s\\n' '${CLAUDE_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function buildFishShellLookupScript() {
  return [
    "if command -v claude >/dev/null 2>/dev/null",
    `  printf '%s\\n' '${CLAUDE_CODE_PATH_START_MARKER}'`,
    "  command -v claude",
    `  printf '%s\\n' '${CLAUDE_CODE_PATH_END_MARKER}'`,
    "end",
    `printf '%s\\n' '${CLAUDE_SHELL_PATH_START_MARKER}'`,
    "printf '%s\\n' (string join : -- $PATH)",
    `printf '%s\\n' '${CLAUDE_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

export function parseClaudeShellLookupOutput(
  stdout: string,
): ClaudeShellLookupResult {
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

  const claudePathBlock = readBlock(
    CLAUDE_CODE_PATH_START_MARKER,
    CLAUDE_CODE_PATH_END_MARKER,
  );
  const pathBlock = readBlock(
    CLAUDE_SHELL_PATH_START_MARKER,
    CLAUDE_SHELL_PATH_END_MARKER,
  );

  const claudePath =
    claudePathBlock.find((line) => path.basename(line).startsWith("claude")) ??
    null;
  const pathValue = pathBlock.find(Boolean) ?? null;

  return {
    claudePath,
    pathValue,
  };
}

async function resolveClaudeCodeRuntimeFromWindowsWhere() {
  if (process.platform !== "win32") {
    return null;
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("where", ["claude"], { env: process.env }, (error, output) => {
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
    const env = {
      ...process.env,
      HOME: process.env.HOME ?? os.homedir(),
    };
    const verified = await verifyClaudeExecutable(candidatePath, env);
    if (verified) {
      return {
        binaryDetected: true,
        binaryVersion: verified.binaryVersion,
        env,
        executablePath: verified.executablePath,
      } satisfies ResolvedClaudeCodeRuntime;
    }
  }

  return null;
}

async function resolveClaudeCodeRuntimeFromShell() {
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
          HOME: process.env.HOME ?? os.homedir(),
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

  const { claudePath, pathValue } = parseClaudeShellLookupOutput(stdout);
  const resolvedCommand =
    (claudePath && (await isExecutable(claudePath)) ? claudePath : null) ??
    (await findExecutableInPath("claude", pathValue));

  const env = {
    ...process.env,
    HOME: process.env.HOME ?? os.homedir(),
    ...(pathValue ? { PATH: pathValue } : {}),
  };
  const verifiedCommand = resolvedCommand
    ? await verifyClaudeExecutable(resolvedCommand, env)
    : null;

  if (!verifiedCommand) {
    return null;
  }

  return {
    binaryDetected: true,
    binaryVersion: verifiedCommand.binaryVersion,
    env,
    executablePath: verifiedCommand.executablePath,
  } satisfies ResolvedClaudeCodeRuntime;
}

export async function resolveClaudeCodeRuntime(options?: {
  forceRefresh?: boolean;
}) {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedRuntime && cachedRuntime.expiresAt > now) {
    return await cachedRuntime.promise;
  }

  const promise = (async () => {
    const preferredPath = await getManagedPathValue(process.env.PATH);
    const baseEnv = {
      ...process.env,
      HOME: process.env.HOME ?? os.homedir(),
      PATH: preferredPath,
    };
    const overridePath =
      process.env.SENTINEL_CLAUDE_PATH?.trim() ||
      process.env.CLAUDE_PATH?.trim();
    if (overridePath) {
      const verifiedOverride = await verifyClaudeExecutable(
        overridePath,
        baseEnv,
      );
      if (verifiedOverride) {
        const runtime = {
          binaryDetected: true,
          binaryVersion: verifiedOverride.binaryVersion,
          env: baseEnv,
          executablePath: verifiedOverride.executablePath,
        } satisfies ResolvedClaudeCodeRuntime;
        await persistResolvedClaudeCodePath(runtime.executablePath);
        return runtime;
      }
    }

    const directCommand = await findExecutableInPath("claude", preferredPath);
    if (directCommand) {
      const verifiedDirectCommand = await verifyClaudeExecutable(
        directCommand,
        baseEnv,
      );
      if (verifiedDirectCommand) {
        const runtime = {
          binaryDetected: true,
          binaryVersion: verifiedDirectCommand.binaryVersion,
          env: baseEnv,
          executablePath: verifiedDirectCommand.executablePath,
        } satisfies ResolvedClaudeCodeRuntime;
        await persistResolvedClaudeCodePath(runtime.executablePath);
        return runtime;
      }
    }

    const windowsWhereCommand =
      await resolveClaudeCodeRuntimeFromWindowsWhere();
    if (windowsWhereCommand) {
      await persistResolvedClaudeCodePath(windowsWhereCommand.executablePath);
      return windowsWhereCommand;
    }

    const shellRuntime = await resolveClaudeCodeRuntimeFromShell();
    if (shellRuntime) {
      await persistResolvedClaudeCodePath(shellRuntime.executablePath);
      return shellRuntime;
    }

    const runtime = {
      binaryDetected: false,
      binaryVersion: null,
      env: {
        ...process.env,
        HOME: process.env.HOME ?? os.homedir(),
      },
      executablePath: null,
    } satisfies ResolvedClaudeCodeRuntime;
    await persistResolvedClaudeCodePath(null);
    return runtime;
  })();

  cachedRuntime = {
    expiresAt: now + CLAUDE_RUNTIME_CACHE_TTL_MS,
    promise,
  };

  return await promise;
}

export function resetClaudeCodeRuntimeCache() {
  cachedRuntime = null;
}

export function resetClaudeEngineStatusCache() {
  cachedStatus = null;
}

export function buildClaudeSdkBaseOptions(options?: Partial<Options>): Options {
  const baseEnv = options?.env ?? process.env;
  const runtimeEnv = {
    ...baseEnv,
    CLAUDE_AGENT_SDK_CLIENT_APP:
      baseEnv.CLAUDE_AGENT_SDK_CLIENT_APP ??
      process.env.CLAUDE_AGENT_SDK_CLIENT_APP ??
      "sentinel",
  };

  return {
    ...options,
    cwd: options?.cwd ?? process.cwd(),
    env: runtimeEnv,
    spawnClaudeCodeProcess: (spawnOptions) => {
      const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
        resolveClaudeSdkExecutable(spawnOptions.command),
        spawnOptions.args,
        {
          cwd: spawnOptions.cwd,
          env: {
            ...spawnOptions.env,
            NODE_ENV: spawnOptions.env.NODE_ENV ?? process.env.NODE_ENV,
          } as NodeJS.ProcessEnv,
          signal: spawnOptions.signal,
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        },
      );

      return {
        stdin: child.stdin,
        stdout: child.stdout,
        get killed() {
          return child.killed;
        },
        get exitCode() {
          return child.exitCode;
        },
        kill: child.kill.bind(child),
        on: child.on.bind(child),
        once: child.once.bind(child),
        off: child.off.bind(child),
      };
    },
    persistSession: options?.persistSession ?? true,
    settingSources: options?.settingSources ?? [...CLAUDE_SETTING_SOURCES],
    systemPrompt: options?.systemPrompt ?? {
      type: "preset",
      preset: "claude_code",
    },
    tools: options?.tools ?? { type: "preset", preset: "claude_code" },
  };
}

async function readClaudeStatus(options?: {
  forceRefreshRuntime?: boolean;
}): Promise<ClaudeEngineStatus> {
  const runtime = await resolveClaudeCodeRuntime({
    forceRefresh: options?.forceRefreshRuntime,
  });
  if (!runtime.binaryDetected || !runtime.executablePath) {
    return buildClaudeEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      binaryDetected: false,
      binaryPath: null,
      binaryVersion: null,
      error: "Claude Code is not installed or not available on PATH.",
      lastSuccessfulProbeAt: null,
      state: "missing_binary",
      usedCachedStatus: false,
    });
  }

  const snapshot = await readClaudeStatusSnapshot({
    binaryPath: runtime.executablePath,
  });

  if (!options?.forceRefreshRuntime && snapshot) {
    if (!backgroundStatusRefresh) {
      backgroundStatusRefresh = probeClaudeStatus({
        fallbackSnapshot: snapshot,
        runtime,
      })
        .then((status) => {
          if (!status.usedCachedStatus && status.state === "ready") {
            cachedStatus = {
              expiresAt: Date.now() + CLAUDE_STATUS_CACHE_TTL_MS,
              promise: Promise.resolve(status),
            };
          }
        })
        .finally(() => {
          backgroundStatusRefresh = null;
        });
    }

    return buildCachedClaudeStatus({
      binaryPath: runtime.executablePath,
      binaryVersion: runtime.binaryVersion,
      snapshot,
    });
  }

  return await probeClaudeStatus({
    fallbackSnapshot: snapshot,
    runtime,
  });
}

async function probeClaudeStatus(input: {
  fallbackSnapshot: ClaudeStatusSnapshot | null;
  runtime: ResolvedClaudeCodeRuntime;
}): Promise<ClaudeEngineStatus> {
  let claudeQuery: ReturnType<typeof query> | null = null;

  try {
    claudeQuery = query({
      prompt: "",
      options: buildClaudeSdkBaseOptions({
        cwd: process.cwd(),
        env: input.runtime.env,
        includePartialMessages: false,
        maxTurns: 1,
        pathToClaudeCodeExecutable: input.runtime.executablePath,
        persistSession: false,
      }),
    });

    const initialization = await withTimeout(
      claudeQuery.initializationResult(),
      CLAUDE_STATUS_QUERY_TIMEOUT_MS,
    );

    if (!initialization) {
      if (input.fallbackSnapshot) {
        return buildCachedClaudeStatus({
          binaryPath: input.runtime.executablePath!,
          binaryVersion: input.runtime.binaryVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildClaudeEngineStatus({
        account: null,
        authReady: false,
        availableModels: [],
        binaryDetected: true,
        binaryPath: input.runtime.executablePath,
        binaryVersion: input.runtime.binaryVersion,
        error: "Timed out while querying Claude Code runtime.",
        lastSuccessfulProbeAt: null,
        state: "timeout_no_cache",
        usedCachedStatus: false,
      });
    }

    const models = initialization.models ?? [];
    const account = initialization.account ?? null;
    if (models.length === 0) {
      if (input.fallbackSnapshot) {
        return buildCachedClaudeStatus({
          binaryPath: input.runtime.executablePath!,
          binaryVersion: input.runtime.binaryVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildClaudeEngineStatus({
        account,
        authReady: false,
        availableModels: [],
        binaryDetected: true,
        binaryPath: input.runtime.executablePath,
        binaryVersion: input.runtime.binaryVersion,
        error: "Claude Code is not authenticated.",
        lastSuccessfulProbeAt: null,
        state: "auth_unavailable",
        usedCachedStatus: false,
      });
    }

    const availableModels = models.map(toClaudeModelInfo);
    const recordedAt = new Date().toISOString();
    await writeClaudeStatusSnapshot({
      account,
      availableModels,
      binaryPath: input.runtime.executablePath!,
      binaryVersion: input.runtime.binaryVersion,
      recordedAt,
    });

    return buildClaudeEngineStatus({
      account,
      authReady: true,
      availableModels,
      binaryDetected: true,
      binaryPath: input.runtime.executablePath,
      binaryVersion: input.runtime.binaryVersion,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    log.warn("status_probe_failed", { error });
    const message =
      error instanceof Error
        ? error.message
        : "Claude Code is unavailable in this Sentinel runtime.";

    if (input.fallbackSnapshot) {
      return buildCachedClaudeStatus({
        binaryPath: input.runtime.executablePath!,
        binaryVersion: input.runtime.binaryVersion,
        snapshot: input.fallbackSnapshot,
      });
    }

    return buildClaudeEngineStatus({
      account: null,
      authReady: false,
      availableModels: [],
      binaryDetected: input.runtime.binaryDetected,
      binaryPath: input.runtime.executablePath,
      binaryVersion: input.runtime.binaryVersion,
      error: message,
      lastSuccessfulProbeAt: null,
      state: isClaudeAuthErrorMessage(message) ? "auth_unavailable" : "error",
      usedCachedStatus: false,
    });
  } finally {
    claudeQuery?.close();
  }
}

export async function getClaudeEngineStatus(options?: {
  forceRefresh?: boolean;
}) {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedStatus && cachedStatus.expiresAt > now) {
    return await cachedStatus.promise;
  }

  if (forceRefresh) {
    resetClaudeCodeRuntimeCache();
  }

  const pending = readClaudeStatus({
    forceRefreshRuntime: forceRefresh,
  });
  cachedStatus = {
    expiresAt: now + CLAUDE_STATUS_CACHE_TTL_MS,
    promise: pending,
  };

  return await pending;
}

export function buildClaudeThreadState(input: {
  cwd: string | null;
  modelId: string | null;
  permissionMode: ClaudePermissionMode;
  sessionId: string;
}): ClaudeThreadState {
  return {
    cwd: input.cwd,
    modelId: input.modelId,
    permissionMode: input.permissionMode,
    sessionId: input.sessionId,
  };
}
