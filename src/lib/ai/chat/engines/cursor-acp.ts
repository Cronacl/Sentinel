import "server-only";

import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CursorThreadState } from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { setLocalRuntimeEnvValue } from "@/lib/runtime/local-runtime-env";
import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
} from "@/lib/runtime/platform-paths";

const CURSOR_RUNTIME_CACHE_TTL_MS = 15_000;
const CURSOR_STATUS_CACHE_TTL_MS = 15_000;
const CURSOR_STATUS_QUERY_TIMEOUT_MS = 3_000;
const CURSOR_CLI_VERIFY_TIMEOUT_MS = 1_500;
const CURSOR_SHELL_LOOKUP_TIMEOUT_MS = 1_200;
const CURSOR_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const CURSOR_STATUS_SNAPSHOT_FILE = "cursor-status.json";
const CURSOR_PATH_START_MARKER = "__SENTINEL_CURSOR_PATH_START__";
const CURSOR_PATH_END_MARKER = "__SENTINEL_CURSOR_PATH_END__";
const CURSOR_SHELL_PATH_START_MARKER = "__SENTINEL_CURSOR_SHELL_PATH_START__";
const CURSOR_SHELL_PATH_END_MARKER = "__SENTINEL_CURSOR_SHELL_PATH_END__";

export type CursorEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_runtime"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type CursorModelInfo = {
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

export type CursorEngineStatus = {
  authReady: boolean;
  availableModels: CursorModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  engine: "cursor";
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  parameterizedModelPicker: boolean;
  state: CursorEngineState;
  usedCachedStatus: boolean;
};

type CursorStatusSnapshot = {
  availableModels: CursorModelInfo[];
  cliPath: string;
  cliVersion: string | null;
  parameterizedModelPicker: boolean;
  recordedAt: string;
};

type ResolvedCursorRuntime = {
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  env: NodeJS.ProcessEnv;
  error: string | null;
};

type CursorShellLookupResult = {
  cursorPath: string | null;
  pathValue: string | null;
};

type CursorJsonRpcEnvelope = {
  error?: {
    code?: number;
    data?: unknown;
    message?: string;
  };
  id?: number | string;
  jsonrpc?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type CursorConfigOption = {
  category?: string;
  currentValue?: unknown;
  id: string;
  name?: string;
  options?: Array<{
    description?: string;
    name?: string;
    value: string;
  }>;
  type?: string;
};

type CursorInitializeResponse = {
  agentCapabilities?: {
    loadSession?: boolean;
    session?: {
      resume?: Record<string, never>;
    };
  };
  protocolVersion?: number;
};

type CursorSessionSetupResponse = {
  configOptions?: CursorConfigOption[];
  modes?: {
    availableModes?: Array<{
      description?: string;
      id: string;
      name?: string;
    }>;
    currentModeId?: string;
  };
  sessionId?: string;
};

export type CursorSessionUpdateNotification = {
  sessionId?: string;
  update?: {
    [key: string]: unknown;
    sessionUpdate?: string;
  };
};

export type CursorPermissionRequest = {
  options?: Array<{
    kind?: string;
    name?: string;
    optionId: string;
  }>;
  sessionId?: string;
  toolCall?: {
    content?: Array<{
      content?: {
        text?: string;
        type?: string;
      };
      type?: string;
    }>;
    kind?: string;
    rawInput?: unknown;
    status?: string;
    title?: string;
    toolCallId?: string;
  };
};

export type CursorExtRequest = {
  method: string;
  params: unknown;
};

type PendingRpc = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

function getLocalStateDirectory() {
  return getSentinelStateRoot();
}

function getCursorStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), CURSOR_STATUS_SNAPSHOT_FILE);
}

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

function normalizeCandidatePath(candidatePath: string) {
  const trimmedPath = candidatePath.trim();
  if (!trimmedPath) {
    return null;
  }

  return path.isAbsolute(trimmedPath)
    ? path.normalize(trimmedPath)
    : path.resolve(process.cwd(), trimmedPath);
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
  return buildPreferredExecutablePathValue(pathValue);
}

async function getManagedPathValue(pathValue?: string | null) {
  return buildManagedExecutablePathValue(pathValue);
}

function buildLoginShellLookupArgs(script: string) {
  return ["-l", "-c", script];
}

function buildPosixShellLookupScript() {
  return [
    "if command -v agent >/dev/null 2>&1; then",
    `  printf '%s\\n' '${CURSOR_PATH_START_MARKER}'`,
    "  command -v agent",
    `  printf '%s\\n' '${CURSOR_PATH_END_MARKER}'`,
    "fi",
    `printf '%s\\n' '${CURSOR_SHELL_PATH_START_MARKER}'`,
    `printf '%s\\n' \"$PATH\"`,
    `printf '%s\\n' '${CURSOR_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

function buildFishShellLookupScript() {
  return [
    "if command -v agent >/dev/null 2>/dev/null",
    `  printf '%s\\n' '${CURSOR_PATH_START_MARKER}'`,
    "  command -v agent",
    `  printf '%s\\n' '${CURSOR_PATH_END_MARKER}'`,
    "end",
    `printf '%s\\n' '${CURSOR_SHELL_PATH_START_MARKER}'`,
    "printf '%s\\n' (string join : -- $PATH)",
    `printf '%s\\n' '${CURSOR_SHELL_PATH_END_MARKER}'`,
  ].join("\n");
}

export function parseCursorShellLookupOutput(
  stdout: string,
): CursorShellLookupResult {
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

  const cursorPathBlock = readBlock(
    CURSOR_PATH_START_MARKER,
    CURSOR_PATH_END_MARKER,
  );
  const pathBlock = readBlock(
    CURSOR_SHELL_PATH_START_MARKER,
    CURSOR_SHELL_PATH_END_MARKER,
  );

  return {
    cursorPath: cursorPathBlock.find(Boolean) ?? null,
    pathValue: pathBlock.find(Boolean) ?? null,
  };
}

async function resolveCursorCliFromShell() {
  if (process.platform === "win32") {
    return null;
  }

  const shells = [process.env.SHELL, "/bin/zsh", "/bin/bash", "/usr/bin/fish"]
    .map((candidate) => candidate?.trim())
    .filter(Boolean) as string[];

  const seen = new Set<string>();
  for (const shellPath of shells) {
    if (seen.has(shellPath)) {
      continue;
    }
    seen.add(shellPath);

    const shellName = path.basename(shellPath);
    const script =
      shellName === "fish"
        ? buildFishShellLookupScript()
        : buildPosixShellLookupScript();

    const stdout = await new Promise<string | null>((resolve) => {
      execFile(
        shellPath,
        buildLoginShellLookupArgs(script),
        {
          env: process.env,
          timeout: CURSOR_SHELL_LOOKUP_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, output) => resolve(error ? null : output),
      );
    });

    if (!stdout) {
      continue;
    }

    const { cursorPath, pathValue } = parseCursorShellLookupOutput(stdout);
    if (!cursorPath) {
      continue;
    }

    return {
      cliPath: cursorPath,
      env: {
        ...process.env,
        PATH: pathValue ? getPreferredPathValue(pathValue) : process.env.PATH,
      },
    };
  }

  return null;
}

async function verifyCursorCli(candidatePath: string, env: NodeJS.ProcessEnv) {
  if (!(await isExecutable(candidatePath))) {
    return null;
  }

  const output = await new Promise<{ stderr: string; stdout: string } | null>(
    (resolve) => {
      execFile(
        candidatePath,
        ["--version"],
        {
          env,
          timeout: CURSOR_CLI_VERIFY_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              stderr,
              stdout,
            });
            return;
          }

          resolve({ stderr, stdout });
        },
      );
    },
  );

  const version =
    `${output?.stdout ?? ""}\n${output?.stderr ?? ""}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null;

  return {
    cliPath: candidatePath,
    cliVersion: version,
  };
}

function setProcessCursorPath(command: string | null) {
  if (command?.trim()) {
    process.env.SENTINEL_CURSOR_PATH = command;
    return;
  }

  delete process.env.SENTINEL_CURSOR_PATH;
}

function isPersistableCursorPath(command: string) {
  const normalized = command.replaceAll("\\", "/");
  return !normalized.includes("/fnm_multishells/");
}

async function persistResolvedCursorCli(
  command: string | null,
  options?: { persist?: boolean },
) {
  const persist = options?.persist ?? Boolean(command?.trim());

  try {
    if (persist) {
      await setLocalRuntimeEnvValue("SENTINEL_CURSOR_PATH", command);
      return;
    }

    await setLocalRuntimeEnvValue("SENTINEL_CURSOR_PATH", null);
    setProcessCursorPath(command);
  } catch {
    setProcessCursorPath(command);
  }
}

async function writeCursorStatusSnapshot(snapshot: CursorStatusSnapshot) {
  const snapshotPath = getCursorStatusSnapshotPath();
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

async function readCursorStatusSnapshot(options: { cliPath: string }) {
  try {
    const rawSnapshot = await readFile(getCursorStatusSnapshotPath(), "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<CursorStatusSnapshot>;

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

    if (Date.now() - recordedAt.getTime() > CURSOR_STATUS_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return {
      availableModels: parsed.availableModels as CursorModelInfo[],
      cliPath: parsed.cliPath,
      cliVersion:
        typeof parsed.cliVersion === "string" ? parsed.cliVersion : null,
      parameterizedModelPicker: parsed.parameterizedModelPicker === true,
      recordedAt: recordedAt.toISOString(),
    } satisfies CursorStatusSnapshot;
  } catch {
    return null;
  }
}

function toCursorConfigOptions(
  response:
    | CursorSessionSetupResponse
    | { configOptions?: CursorConfigOption[] }
    | null
    | undefined,
) {
  return Array.isArray(response?.configOptions) ? response.configOptions : [];
}

function findCursorConfigOption(
  configOptions: CursorConfigOption[],
  predicate: (option: CursorConfigOption) => boolean,
) {
  return configOptions.find(predicate) ?? null;
}

function getCursorModelConfigOption(configOptions: CursorConfigOption[]) {
  return findCursorConfigOption(
    configOptions,
    (option) =>
      option.category === "model" ||
      option.id === "model" ||
      option.name?.toLowerCase() === "model",
  );
}

function normalizeCursorReasoningEffort(
  value: string | null | undefined,
): ReasoningEffort | null {
  switch (value?.trim().toLowerCase()) {
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
      return value.trim().toLowerCase() as ReasoningEffort;
    case "extra-high":
    case "xhigh":
      return "xhigh";
    default:
      return null;
  }
}

function toCursorReasoningEfforts(option: CursorConfigOption | null) {
  const values = (option?.options ?? [])
    .map((entry) => normalizeCursorReasoningEffort(entry.value))
    .filter((effort, index, array): effort is ReasoningEffort => {
      return effort != null && array.indexOf(effort) === index;
    });

  return values.map((effort) => ({
    description: `${option?.name ?? "This model"} supports ${effort} reasoning effort.`,
    effort,
    label:
      effort === "xhigh"
        ? "Extra high"
        : effort[0]!.toUpperCase() + effort.slice(1),
  }));
}

function buildCursorModelInfo(input: {
  modelOption: NonNullable<ReturnType<typeof getCursorModelConfigOption>>;
  optionValue: {
    description?: string;
    name?: string;
    value: string;
  };
  perModelConfigOptions: CursorConfigOption[];
}) {
  const reasoningOption = findCursorConfigOption(
    input.perModelConfigOptions,
    (option) =>
      option.category === "thought_level" ||
      option.id === "reasoning" ||
      option.name?.toLowerCase() === "reasoning",
  );
  const supportedReasoningEfforts = toCursorReasoningEfforts(reasoningOption);
  const defaultReasoningEffort = normalizeCursorReasoningEffort(
    typeof reasoningOption?.currentValue === "string"
      ? reasoningOption.currentValue
      : null,
  );

  return {
    defaultReasoningEffort,
    description:
      input.optionValue.description ??
      `${input.optionValue.name ?? input.optionValue.value} in Cursor Agent.`,
    displayName: input.optionValue.name ?? input.optionValue.value,
    id: input.optionValue.value,
    inputModalities: ["text"],
    isDefault:
      input.optionValue.value ===
      (typeof input.modelOption.currentValue === "string"
        ? input.modelOption.currentValue
        : undefined),
    model: input.optionValue.value,
    supportedReasoningEfforts,
  } satisfies CursorModelInfo;
}

function buildCursorEngineStatus(input: {
  authReady: boolean;
  availableModels: CursorModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  error: string | null;
  lastSuccessfulProbeAt: string | null;
  parameterizedModelPicker: boolean;
  state: CursorEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    authReady: input.authReady,
    availableModels: input.availableModels,
    cliDetected: input.cliDetected,
    cliPath: input.cliPath,
    cliVersion: input.cliVersion,
    engine: "cursor" as const,
    error: input.error,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    parameterizedModelPicker: input.parameterizedModelPicker,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies CursorEngineStatus;
}

function buildCachedCursorStatus(input: {
  cliPath: string;
  snapshot: CursorStatusSnapshot;
}) {
  return buildCursorEngineStatus({
    authReady: input.snapshot.availableModels.length > 0,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliPath: input.cliPath,
    cliVersion: input.snapshot.cliVersion,
    error:
      "Cursor Agent took too long to respond. Showing the most recent cached model list.",
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    parameterizedModelPicker: input.snapshot.parameterizedModelPicker,
    state: "timeout_using_cache",
    usedCachedStatus: true,
  });
}

function isCursorAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("login") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("cursor_login") ||
    normalizedMessage.includes("unauth")
  );
}

function getCursorValueForReasoning(
  effort: ReasoningEffort | null | undefined,
) {
  switch (effort) {
    case "xhigh":
      return "extra-high";
    case "none":
    case "minimal":
    case "low":
    case "medium":
    case "high":
      return effort;
    default:
      return null;
  }
}

let cachedRuntime: {
  expiresAt: number;
  promise: Promise<ResolvedCursorRuntime>;
} | null = null;
let cachedStatus: {
  expiresAt: number;
  promise: Promise<CursorEngineStatus>;
} | null = null;

export function resetCursorRuntimeCache() {
  cachedRuntime = null;
}

export function resetCursorEngineStatusCache() {
  cachedStatus = null;
}

export function isCursorEngineAvailable(status: CursorEngineStatus) {
  return (
    (status.state === "ready" && status.authReady) ||
    (status.state === "timeout_using_cache" &&
      status.authReady &&
      status.availableModels.length > 0)
  );
}

export function buildCursorThreadState(input: {
  cwd?: string | null;
  modelId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  sessionId: string;
}): CursorThreadState {
  return {
    cwd: input.cwd ?? null,
    modelId: input.modelId ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    sessionId: input.sessionId,
  };
}

export async function resolveCursorRuntime(options?: {
  forceRefresh?: boolean;
}): Promise<ResolvedCursorRuntime> {
  if (
    !options?.forceRefresh &&
    cachedRuntime &&
    cachedRuntime.expiresAt > Date.now()
  ) {
    return cachedRuntime.promise;
  }

  const promise = (async () => {
    const explicitPath = process.env.SENTINEL_CURSOR_PATH?.trim();
    const preferredPathValue = getPreferredPathValue(process.env.PATH);
    const managedPathValue = await getManagedPathValue(preferredPathValue);

    const explicitCandidate = explicitPath
      ? await verifyCursorCli(explicitPath, process.env)
      : null;

    if (explicitCandidate?.cliPath) {
      await persistResolvedCursorCli(explicitCandidate.cliPath, {
        persist: isPersistableCursorPath(explicitCandidate.cliPath),
      });
      return {
        cliDetected: true,
        cliPath: explicitCandidate.cliPath,
        cliVersion: explicitCandidate.cliVersion,
        env: {
          ...process.env,
          PATH: managedPathValue,
        },
        error: null,
      } satisfies ResolvedCursorRuntime;
    }

    const candidatePath =
      (await findExecutableInPath("agent", managedPathValue)) ??
      (await resolveCursorCliFromShell())?.cliPath;

    if (!candidatePath) {
      await persistResolvedCursorCli(null, { persist: false });
      return {
        cliDetected: false,
        cliPath: null,
        cliVersion: null,
        env: {
          ...process.env,
          PATH: managedPathValue,
        },
        error: "Cursor Agent was not found in PATH.",
      } satisfies ResolvedCursorRuntime;
    }

    const verified = await verifyCursorCli(candidatePath, {
      ...process.env,
      PATH: managedPathValue,
    });
    await persistResolvedCursorCli(candidatePath, {
      persist: isPersistableCursorPath(candidatePath),
    });

    return {
      cliDetected: true,
      cliPath: candidatePath,
      cliVersion: verified?.cliVersion ?? null,
      env: {
        ...process.env,
        PATH: managedPathValue,
      },
      error: null,
    } satisfies ResolvedCursorRuntime;
  })();

  cachedRuntime = {
    expiresAt: Date.now() + CURSOR_RUNTIME_CACHE_TTL_MS,
    promise,
  };

  return promise;
}

export class CursorAcpClient {
  private readonly child: ChildProcessWithoutNullStreams;

  private readonly pending = new Map<number | string, PendingRpc>();
  private readonly stderrLines: string[] = [];
  private readonly onExtRequest?: (
    request: CursorExtRequest,
  ) => Promise<unknown>;
  private readonly onExtNotification?: (request: CursorExtRequest) => void;
  private readonly onProcessExit?: (error: Error) => void;
  private readonly onRequestPermission?: (
    request: CursorPermissionRequest,
  ) => Promise<unknown>;
  private readonly onSessionUpdate?: (
    notification: CursorSessionUpdateNotification,
  ) => void;
  private nextId = 1;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private closed = false;

  constructor(input: {
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    onExtRequest?: (request: CursorExtRequest) => Promise<unknown>;
    onExtNotification?: (request: CursorExtRequest) => void;
    onProcessExit?: (error: Error) => void;
    onRequestPermission?: (
      request: CursorPermissionRequest,
    ) => Promise<unknown>;
    onSessionUpdate?: (notification: CursorSessionUpdateNotification) => void;
  }) {
    this.onExtRequest = input.onExtRequest;
    this.onExtNotification = input.onExtNotification;
    this.onProcessExit = input.onProcessExit;
    this.onRequestPermission = input.onRequestPermission;
    this.onSessionUpdate = input.onSessionUpdate;
    this.child = spawn(input.command, ["acp"], {
      cwd: input.cwd,
      env: input.env,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string | Buffer) => {
      this.handleStdoutChunk(String(chunk));
    });
    this.child.stderr.on("data", (chunk: string | Buffer) => {
      this.handleStderrChunk(String(chunk));
    });
    this.child.on("error", (error) => {
      this.failAllPending(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
    this.child.on("exit", (code, signal) => {
      if (this.closed) {
        return;
      }

      const error = new Error(
        [
          `Cursor Agent exited unexpectedly`,
          code != null ? `with code ${code}` : null,
          signal ? `(${signal})` : null,
          this.getStderrTail(),
        ]
          .filter(Boolean)
          .join(" "),
      );
      this.failAllPending(error);
      this.onProcessExit?.(error);
    });
  }

  async initialize(clientCapabilities?: Record<string, unknown>) {
    return (await this.call("initialize", {
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        ...(clientCapabilities ?? {}),
      },
      clientInfo: {
        name: "sentinel",
        version: "0.0.0",
      },
      protocolVersion: 1,
    })) as CursorInitializeResponse;
  }

  async authenticate(methodId = "cursor_login") {
    return await this.call("authenticate", { methodId });
  }

  async createSession(input: { cwd: string }) {
    return (await this.call("session/new", {
      cwd: input.cwd,
      mcpServers: [],
    })) as CursorSessionSetupResponse;
  }

  async loadSession(input: { cwd: string; sessionId: string }) {
    return (await this.call("session/load", {
      cwd: input.cwd,
      mcpServers: [],
      sessionId: input.sessionId,
    })) as CursorSessionSetupResponse;
  }

  async prompt(input: {
    prompt: Array<{ text: string; type: "text" }>;
    sessionId: string;
  }) {
    return await this.call("session/prompt", input);
  }

  async cancel(sessionId: string) {
    await this.call("session/cancel", { sessionId });
  }

  async setSessionConfigOption(input: {
    configId: string;
    sessionId: string;
    value: boolean | string;
  }) {
    return (await this.call("session/set_config_option", input)) as {
      configOptions?: CursorConfigOption[];
    };
  }

  async request(method: string, params: unknown) {
    return await this.call(method, params);
  }

  notify(method: string, params: unknown) {
    this.write({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.child.kill("SIGTERM");
    this.failAllPending(new Error("Cursor ACP client closed."));
  }

  private call(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.write({
        id,
        jsonrpc: "2.0",
        method,
        params,
      });
    });
  }

  private write(message: Record<string, unknown>) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleStdoutChunk(chunk: string) {
    this.stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const rawLine = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (!rawLine) {
        continue;
      }

      this.handleEnvelope(rawLine);
    }
  }

  private handleStderrChunk(chunk: string) {
    this.stderrBuffer += chunk;

    while (true) {
      const newlineIndex = this.stderrBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const rawLine = this.stderrBuffer.slice(0, newlineIndex).trim();
      this.stderrBuffer = this.stderrBuffer.slice(newlineIndex + 1);
      if (!rawLine) {
        continue;
      }

      this.stderrLines.push(rawLine);
      if (this.stderrLines.length > 20) {
        this.stderrLines.shift();
      }
    }
  }

  private handleEnvelope(rawLine: string) {
    let envelope: CursorJsonRpcEnvelope | null = null;
    try {
      envelope = JSON.parse(rawLine) as CursorJsonRpcEnvelope;
    } catch {
      return;
    }

    if (envelope.id != null && envelope.method == null) {
      const pending = this.pending.get(envelope.id);
      if (!pending) {
        return;
      }

      this.pending.delete(envelope.id);
      if (envelope.error) {
        pending.reject(
          new Error(
            envelope.error.message ??
              `Cursor ACP request failed (${envelope.error.code ?? "unknown"})`,
          ),
        );
        return;
      }

      pending.resolve(envelope.result);
      return;
    }

    if (!envelope.method) {
      return;
    }

    if (envelope.method === "session/update") {
      this.onSessionUpdate?.(
        (envelope.params ?? {}) as CursorSessionUpdateNotification,
      );
      return;
    }

    if (envelope.id == null) {
      this.onExtNotification?.({
        method: envelope.method,
        params: envelope.params,
      });
      return;
    }

    const respond = async () => {
      try {
        let result: unknown = {};

        if (envelope.method === "session/request_permission") {
          result = (await this.onRequestPermission?.(
            (envelope.params ?? {}) as CursorPermissionRequest,
          )) ?? {
            outcome: {
              outcome: "selected",
              optionId: "reject-once",
            },
          };
        } else {
          if (!envelope.method) {
            throw new Error("Cursor ACP request was missing a method name.");
          }
          result =
            (await this.onExtRequest?.({
              method: envelope.method,
              params: envelope.params,
            })) ?? {};
        }

        this.write({
          id: envelope?.id,
          jsonrpc: "2.0",
          result,
        });
      } catch (error) {
        this.write({
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
          id: envelope?.id,
          jsonrpc: "2.0",
        });
      }
    };

    void respond();
  }

  private getStderrTail() {
    const stderrTail = [
      ...this.stderrLines,
      ...this.stderrBuffer
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ]
      .slice(-5)
      .join(" ");

    return stderrTail ? `(${stderrTail})` : "";
  }

  private failAllPending(error: Error) {
    if (this.closed && this.pending.size === 0) {
      return;
    }

    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

async function discoverCursorModels(
  client: CursorAcpClient,
  sessionId: string,
  initialConfigOptions: CursorConfigOption[],
) {
  const modelOption = getCursorModelConfigOption(initialConfigOptions);
  if (!modelOption?.options?.length) {
    return {
      models: [] as CursorModelInfo[],
      parameterizedModelPicker: false,
    };
  }

  const originalModelValue =
    typeof modelOption.currentValue === "string"
      ? modelOption.currentValue
      : null;
  const models: CursorModelInfo[] = [];

  for (const optionValue of modelOption.options) {
    let perModelConfigOptions = initialConfigOptions;
    if (optionValue.value !== originalModelValue) {
      const response = await client.setSessionConfigOption({
        configId: modelOption.id,
        sessionId,
        value: optionValue.value,
      });
      perModelConfigOptions = toCursorConfigOptions(response);
    }

    models.push(
      buildCursorModelInfo({
        modelOption,
        optionValue,
        perModelConfigOptions,
      }),
    );
  }

  if (originalModelValue) {
    await client
      .setSessionConfigOption({
        configId: modelOption.id,
        sessionId,
        value: originalModelValue,
      })
      .catch(() => undefined);
  }

  const parameterizedModelPicker = models.some(
    (model) => model.supportedReasoningEfforts.length > 0,
  );

  return { models, parameterizedModelPicker };
}

async function probeCursorEngineStatus(runtime: ResolvedCursorRuntime) {
  if (!runtime.cliDetected || !runtime.cliPath) {
    return buildCursorEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: false,
      cliPath: null,
      cliVersion: null,
      error: runtime.error,
      lastSuccessfulProbeAt: null,
      parameterizedModelPicker: false,
      state: "missing_runtime",
      usedCachedStatus: false,
    });
  }

  const client = new CursorAcpClient({
    command: runtime.cliPath,
    cwd: process.cwd(),
    env: runtime.env,
  });

  try {
    const initializeResult = await client.initialize({
      _meta: {
        parameterizedModelPicker: true,
      },
    });
    await client.authenticate("cursor_login");
    const session = await client.createSession({ cwd: process.cwd() });
    const { models, parameterizedModelPicker } = await discoverCursorModels(
      client,
      session.sessionId ?? "unknown-session",
      toCursorConfigOptions(session),
    );
    const recordedAt = new Date().toISOString();

    await writeCursorStatusSnapshot({
      availableModels: models,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      parameterizedModelPicker:
        parameterizedModelPicker ||
        initializeResult.agentCapabilities?.session?.resume != null,
      recordedAt,
    }).catch(() => undefined);

    return buildCursorEngineStatus({
      authReady: true,
      availableModels: models,
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      error: null,
      lastSuccessfulProbeAt: recordedAt,
      parameterizedModelPicker,
      state: "ready",
      usedCachedStatus: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCursorAuthErrorMessage(message)) {
      return buildCursorEngineStatus({
        authReady: false,
        availableModels: [],
        cliDetected: true,
        cliPath: runtime.cliPath,
        cliVersion: runtime.cliVersion,
        error: message,
        lastSuccessfulProbeAt: null,
        parameterizedModelPicker: false,
        state: "auth_unavailable",
        usedCachedStatus: false,
      });
    }

    return buildCursorEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      error: message,
      lastSuccessfulProbeAt: null,
      parameterizedModelPicker: false,
      state: "error",
      usedCachedStatus: false,
    });
  } finally {
    client.close();
  }
}

export async function getCursorEngineStatus(options?: {
  forceRefresh?: boolean;
}): Promise<CursorEngineStatus> {
  if (
    !options?.forceRefresh &&
    cachedStatus &&
    cachedStatus.expiresAt > Date.now()
  ) {
    return cachedStatus.promise;
  }

  const promise = (async () => {
    const runtime = await resolveCursorRuntime(options);
    if (!runtime.cliDetected || !runtime.cliPath) {
      return buildCursorEngineStatus({
        authReady: false,
        availableModels: [],
        cliDetected: false,
        cliPath: null,
        cliVersion: null,
        error: runtime.error,
        lastSuccessfulProbeAt: null,
        parameterizedModelPicker: false,
        state: "missing_runtime",
        usedCachedStatus: false,
      });
    }

    const status = await withTimeout(
      probeCursorEngineStatus(runtime),
      CURSOR_STATUS_QUERY_TIMEOUT_MS,
    );

    if (status) {
      return status;
    }

    const snapshot = await readCursorStatusSnapshot({
      cliPath: runtime.cliPath,
    });
    if (snapshot) {
      return buildCachedCursorStatus({
        cliPath: runtime.cliPath,
        snapshot,
      });
    }

    return buildCursorEngineStatus({
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: runtime.cliPath,
      cliVersion: runtime.cliVersion,
      error:
        "Cursor Agent took too long to respond. Retry after reopening Cursor authentication if needed.",
      lastSuccessfulProbeAt: null,
      parameterizedModelPicker: false,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    });
  })();

  cachedStatus = {
    expiresAt: Date.now() + CURSOR_STATUS_CACHE_TTL_MS,
    promise,
  };

  return promise;
}

export async function startCursorAcpSession(input: {
  cwd: string;
  onExtRequest?: (request: CursorExtRequest) => Promise<unknown>;
  onExtNotification?: (request: CursorExtRequest) => void;
  onProcessExit?: (error: Error) => void;
  onRequestPermission?: (request: CursorPermissionRequest) => Promise<unknown>;
  onSessionUpdate?: (notification: CursorSessionUpdateNotification) => void;
  resumeSessionId?: string | null;
}) {
  const runtime = await resolveCursorRuntime();
  if (!runtime.cliDetected || !runtime.cliPath) {
    throw new Error(runtime.error ?? "Cursor Agent is unavailable.");
  }

  const client = new CursorAcpClient({
    command: runtime.cliPath,
    cwd: input.cwd,
    env: runtime.env,
    ...(input.onExtRequest ? { onExtRequest: input.onExtRequest } : {}),
    ...(input.onExtNotification
      ? { onExtNotification: input.onExtNotification }
      : {}),
    ...(input.onProcessExit ? { onProcessExit: input.onProcessExit } : {}),
    ...(input.onRequestPermission
      ? { onRequestPermission: input.onRequestPermission }
      : {}),
    ...(input.onSessionUpdate
      ? { onSessionUpdate: input.onSessionUpdate }
      : {}),
  });

  const initializeResult = await client.initialize({
    _meta: {
      parameterizedModelPicker: true,
    },
  });
  await client.authenticate("cursor_login");
  const sessionSetup = input.resumeSessionId
    ? await client
        .loadSession({
          cwd: input.cwd,
          sessionId: input.resumeSessionId,
        })
        .catch(() => client.createSession({ cwd: input.cwd }))
    : await client.createSession({ cwd: input.cwd });

  return {
    client,
    configOptions: toCursorConfigOptions(sessionSetup),
    initializeResult,
    runtime,
    sessionId:
      sessionSetup.sessionId ?? input.resumeSessionId ?? crypto.randomUUID(),
  };
}

export async function applyCursorSessionConfig(input: {
  client: CursorAcpClient;
  configOptions: CursorConfigOption[];
  modelId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  sessionId: string;
}) {
  let configOptions = input.configOptions;
  const modelOption = getCursorModelConfigOption(configOptions);
  if (
    input.modelId &&
    modelOption &&
    typeof modelOption.currentValue === "string" &&
    input.modelId !== modelOption.currentValue
  ) {
    const response = await input.client.setSessionConfigOption({
      configId: modelOption.id,
      sessionId: input.sessionId,
      value: input.modelId,
    });
    configOptions = toCursorConfigOptions(response);
  }

  const reasoningValue = getCursorValueForReasoning(input.reasoningEffort);
  if (!reasoningValue) {
    return configOptions;
  }

  const reasoningOption = findCursorConfigOption(
    configOptions,
    (option) =>
      option.category === "thought_level" ||
      option.id === "reasoning" ||
      option.name?.toLowerCase() === "reasoning",
  );
  const allowedValues = new Set(
    (reasoningOption?.options ?? []).map((entry) => entry.value),
  );
  if (!reasoningOption || !allowedValues.has(reasoningValue)) {
    return configOptions;
  }

  const response = await input.client.setSessionConfigOption({
    configId: reasoningOption.id,
    sessionId: input.sessionId,
    value: reasoningValue,
  });
  return toCursorConfigOptions(response);
}
