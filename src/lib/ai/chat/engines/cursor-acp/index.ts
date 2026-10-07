import "server-only";

import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EngineInstallSource } from "@/lib/ai/chat/engines/contract";
import { getLegacyEngineStatusFilePath } from "@/lib/ai/chat/engines/platform/paths";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
  lookupInLoginShell,
  parseLoginShellLookupOutput,
} from "@/lib/ai/chat/engines/platform/runtime/login-shell";
import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
  isExecutableFile,
  normalizeCandidatePath,
  recordResolvedBinary,
  type EngineBinaryInstance,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  readFirstOutputLine,
  runCommandProbe,
} from "@/lib/ai/chat/engines/platform/runtime/version-probe";
import type { CursorThreadState } from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { spawnManagedProcess } from "@/lib/runtime/process/spawn";
import { applyPrivateFsMode } from "@/lib/runtime/local-state";
import {
  buildManagedExecutablePathValue,
  buildPreferredExecutablePathValue,
} from "@/lib/runtime/platform-paths";
import { withTimeout } from "@/lib/runtime/process/with-timeout";

const CURSOR_RUNTIME_CACHE_TTL_MS = 15_000;
const CURSOR_STATUS_CACHE_TTL_MS = 15_000;
const CURSOR_STATUS_QUERY_TIMEOUT_MS = 3_000;
const CURSOR_CLI_VERIFY_TIMEOUT_MS = 1_500;
const CURSOR_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const CURSOR_STATUS_SNAPSHOT_FILE = "cursor-status.json";

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
  /** How the binary was found; null when it was not. */
  source: EngineInstallSource | null;
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

function getCursorStatusSnapshotPath(
  instance: CursorRuntimeInstance | null | undefined,
) {
  return getLegacyEngineStatusFilePath(CURSOR_STATUS_SNAPSHOT_FILE, instance);
}

const CURSOR_NAME_OPTIONS = { strategy: "pathext-or-bare" } as const;
const CURSOR_LOGIN_SHELL_MARKERS = getLoginShellMarkers("cursor");
// A broken $SHELL falls back to the common shells.
const CURSOR_FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/usr/bin/fish"];

export function parseCursorShellLookupOutput(
  stdout: string,
): CursorShellLookupResult {
  const { commandPath, pathValue } = parseLoginShellLookupOutput(stdout, {
    markers: CURSOR_LOGIN_SHELL_MARKERS,
  });
  return { cursorPath: commandPath, pathValue };
}

/** Executable, with the version it prints (even when it exits non-zero). */
async function verifyCursorCli(candidatePath: string, env: NodeJS.ProcessEnv) {
  const normalizedPath = normalizeCandidatePath(candidatePath);
  if (!normalizedPath || !(await isExecutableFile(normalizedPath))) {
    return null;
  }

  const output = await runCommandProbe({
    command: candidatePath,
    env,
    timeoutMs: CURSOR_CLI_VERIFY_TIMEOUT_MS,
  });

  return {
    cliPath: candidatePath,
    cliVersion: readFirstOutputLine(output.stdout, output.stderr),
  };
}

async function writeCursorStatusSnapshot(
  snapshotPath: string,
  snapshot: CursorStatusSnapshot,
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

async function readCursorStatusSnapshot(
  snapshotPath: string,
  options: { cliPath: string },
) {
  try {
    const rawSnapshot = await readFile(snapshotPath, "utf8");
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
    // Cursor's top level is extra-high.
    case "max":
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

// One cached resolution per instance (and per configuration of it).
const cachedRuntimes = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedCursorRuntime> }
>();
// One cached status per instance (and per configuration of it).
const cachedStatuses = new Map<
  string,
  { expiresAt: number; promise: Promise<CursorEngineStatus> }
>();

export function resetCursorRuntimeCache() {
  cachedRuntimes.clear();
}

export function resetCursorEngineStatusCache() {
  cachedStatuses.clear();
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

export type CursorRuntimeInstance = EngineBinaryInstance;

/**
 * Resolution order: the instance's binaryPath, else (default instance)
 * SENTINEL_CURSOR_PATH; then `agent` on the managed PATH and in a login
 * shell. Without an instance this is the default instance on process.env.
 */
async function resolveCursorRuntimeUncached(
  instance: CursorRuntimeInstance | null | undefined,
): Promise<ResolvedCursorRuntime> {
  const baseEnv = getInstanceProcessEnv(instance);
  const preferredPathValue = buildPreferredExecutablePathValue(baseEnv.PATH, {
    env: baseEnv,
  });
  const managedPathValue = await buildManagedExecutablePathValue(
    preferredPathValue,
    { env: baseEnv },
  );
  const runtimeEnv = { ...baseEnv, PATH: managedPathValue };
  const isDefault = !instance || instance.isDefault;
  const remember = async (
    cliPath: string,
    cliVersion: string | null,
    source: EngineInstallSource,
  ) => {
    await recordResolvedBinary(
      { path: cliPath, source, version: cliVersion },
      {
        instanceId: instance?.id ?? "cursor",
        legacyEnvKey: isDefault ? "SENTINEL_CURSOR_PATH" : null,
      },
    );
  };

  const override = getConfiguredBinaryOverride(instance, baseEnv, [
    "SENTINEL_CURSOR_PATH",
  ]);
  const explicitCandidate = override
    ? await verifyCursorCli(override.path, baseEnv)
    : null;

  if (override && explicitCandidate?.cliPath) {
    await remember(
      explicitCandidate.cliPath,
      explicitCandidate.cliVersion,
      override.source,
    );
    return {
      cliDetected: true,
      cliPath: explicitCandidate.cliPath,
      cliVersion: explicitCandidate.cliVersion,
      env: runtimeEnv,
      error: null,
      source: override.source,
    } satisfies ResolvedCursorRuntime;
  }

  const fromPath = await findExecutableInPath(
    "agent",
    managedPathValue,
    CURSOR_NAME_OPTIONS,
  );
  const candidatePath =
    fromPath ??
    (
      await lookupInLoginShell({
        command: "agent",
        env: baseEnv,
        markers: CURSOR_LOGIN_SHELL_MARKERS,
        shells: getLoginShellCandidates(baseEnv, CURSOR_FALLBACK_SHELLS),
        stopWhen: "command",
      })
    )?.commandPath;

  if (!candidatePath) {
    return {
      cliDetected: false,
      cliPath: override?.path ?? null,
      cliVersion: null,
      env: runtimeEnv,
      error: override
        ? "Cursor Agent path is retained but is not currently launchable."
        : "Cursor Agent was not found in PATH.",
      source: null,
    } satisfies ResolvedCursorRuntime;
  }

  const source: EngineInstallSource = fromPath ? "managed-path" : "login-shell";
  const verified = await verifyCursorCli(candidatePath, runtimeEnv);
  await remember(candidatePath, verified?.cliVersion ?? null, source);

  return {
    cliDetected: true,
    cliPath: candidatePath,
    cliVersion: verified?.cliVersion ?? null,
    env: runtimeEnv,
    error: null,
    source,
  } satisfies ResolvedCursorRuntime;
}

export async function resolveCursorRuntime(options?: {
  forceRefresh?: boolean;
  instance?: CursorRuntimeInstance | null;
}): Promise<ResolvedCursorRuntime> {
  const key = getInstanceRuntimeKey(options?.instance);
  const cached = cachedRuntimes.get(key);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = resolveCursorRuntimeUncached(options?.instance);
  cachedRuntimes.set(key, {
    expiresAt: Date.now() + CURSOR_RUNTIME_CACHE_TTL_MS,
    promise,
  });

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
    // A managed agent process: kill() ends the whole tree (the Windows
    // .cmd shim and the agent under it) and the pid is recorded so a server
    // shutdown cannot orphan it.
    this.child = spawnManagedProcess({
      args: ["acp"],
      command: input.command,
      cwd: input.cwd,
      env: input.env,
      extendEnv: false,
      label: "cursor acp",
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

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

  /**
   * ACP defines `session/cancel` as a notification: the agent never replies,
   * it finishes the pending `session/prompt` with `stopReason: "cancelled"`.
   */
  cancel(sessionId: string) {
    if (this.closed) {
      return;
    }

    this.notify("session/cancel", { sessionId });
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

async function probeCursorEngineStatus(
  runtime: ResolvedCursorRuntime,
  snapshotPath: string,
  signal?: AbortSignal,
) {
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
  const closeOnAbort = () => client.close();
  signal?.addEventListener("abort", closeOnAbort, { once: true });

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

    await writeCursorStatusSnapshot(snapshotPath, {
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
    signal?.removeEventListener("abort", closeOnAbort);
    client.close();
  }
}

export async function getCursorEngineStatus(options?: {
  forceRefresh?: boolean;
  instance?: CursorRuntimeInstance | null;
}): Promise<CursorEngineStatus> {
  const key = getInstanceRuntimeKey(options?.instance);
  const cached = cachedStatuses.get(key);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const snapshotPath = getCursorStatusSnapshotPath(options?.instance);
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

    // On timeout the probe's signal closes its ACP client, which kills the
    // `agent acp` child instead of leaving it running in the background.
    const status = await withTimeout(
      (signal) => probeCursorEngineStatus(runtime, snapshotPath, signal),
      CURSOR_STATUS_QUERY_TIMEOUT_MS,
      { nullOnError: true },
    );

    if (status) {
      return status;
    }

    const snapshot = await readCursorStatusSnapshot(snapshotPath, {
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

  cachedStatuses.set(key, {
    expiresAt: Date.now() + CURSOR_STATUS_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

export async function startCursorAcpSession(input: {
  cwd: string;
  /** The thread's instance: its binary and environment. */
  instance?: CursorRuntimeInstance | null;
  onExtRequest?: (request: CursorExtRequest) => Promise<unknown>;
  onExtNotification?: (request: CursorExtRequest) => void;
  onProcessExit?: (error: Error) => void;
  onRequestPermission?: (request: CursorPermissionRequest) => Promise<unknown>;
  onSessionUpdate?: (notification: CursorSessionUpdateNotification) => void;
  resumeSessionId?: string | null;
}) {
  const runtime = await resolveCursorRuntime({ instance: input.instance });
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
