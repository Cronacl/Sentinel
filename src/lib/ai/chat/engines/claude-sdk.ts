import "server-only";

import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, readdir } from "node:fs/promises";
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
const SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const CLAUDE_STATUS_QUERY_TIMEOUT_MS = 3_000;

type ClaudeSdkEffort = "low" | "medium" | "high" | "max";
type ClaudeShellLookupResult = {
  claudePath: string | null;
  pathValue: string | null;
};

export type ResolvedClaudeCodeRuntime = {
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
  engine: "claude";
  error: string | null;
  sdkDetected: boolean;
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

async function persistResolvedClaudeCodePath(executablePath: string | null) {
  try {
    await setLocalRuntimeEnvValue("SENTINEL_CLAUDE_PATH", executablePath);
  } catch (error) {
    log.warn("persist_claude_path_failed", { error });
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
    if (await isExecutable(candidatePath)) {
      return {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
        },
        executablePath: candidatePath,
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

  return {
    env: {
      ...process.env,
      HOME: process.env.HOME ?? os.homedir(),
      ...(pathValue ? { PATH: pathValue } : {}),
    },
    executablePath: resolvedCommand,
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
    const overridePath =
      process.env.SENTINEL_CLAUDE_PATH?.trim() ||
      process.env.CLAUDE_PATH?.trim();
    if (overridePath && (await isExecutable(overridePath))) {
      const runtime = {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
          PATH: preferredPath,
        },
        executablePath: overridePath,
      } satisfies ResolvedClaudeCodeRuntime;
      await persistResolvedClaudeCodePath(runtime.executablePath);
      return runtime;
    }

    const directCommand = await findExecutableInPath("claude", preferredPath);
    if (directCommand) {
      const runtime = {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? os.homedir(),
          PATH: preferredPath,
        },
        executablePath: directCommand,
      } satisfies ResolvedClaudeCodeRuntime;
      await persistResolvedClaudeCodePath(runtime.executablePath);
      return runtime;
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
  let claudeQuery: ReturnType<typeof query> | null = null;

  try {
    const runtime = await resolveClaudeCodeRuntime({
      forceRefresh: options?.forceRefreshRuntime,
    });
    if (!runtime.executablePath) {
      return {
        account: null,
        authReady: false,
        availableModels: [],
        engine: "claude",
        error: "Claude Code is not installed or not available on PATH.",
        sdkDetected: false,
      };
    }

    claudeQuery = query({
      prompt: "",
      options: buildClaudeSdkBaseOptions({
        cwd: process.cwd(),
        env: runtime.env,
        includePartialMessages: false,
        maxTurns: 1,
        pathToClaudeCodeExecutable: runtime.executablePath,
        persistSession: false,
      }),
    });

    const initialization = await withTimeout(
      claudeQuery.initializationResult(),
      CLAUDE_STATUS_QUERY_TIMEOUT_MS,
    );

    if (!initialization) {
      return {
        account: null,
        authReady: false,
        availableModels: [],
        engine: "claude",
        error: "Timed out while querying Claude Code runtime.",
        sdkDetected: true,
      };
    }

    const models = initialization.models ?? [];
    const account = initialization.account ?? null;

    return {
      account,
      authReady: models.length > 0,
      availableModels: models.map(toClaudeModelInfo),
      engine: "claude",
      error: null,
      sdkDetected: true,
    };
  } catch (error) {
    log.warn("status_probe_failed", { error });

    return {
      account: null,
      authReady: false,
      availableModels: [],
      engine: "claude",
      error:
        error instanceof Error
          ? error.message
          : "Claude Code is unavailable in this Sentinel runtime.",
      sdkDetected: true,
    };
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
