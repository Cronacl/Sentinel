import "server-only";

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import {
  CopilotClient,
  type GetAuthStatusResponse,
  type ModelInfo,
  type ResumeSessionConfig,
  type SessionConfig,
} from "@github/copilot-sdk";

import type { CopilotThreadState } from "@/lib/ai/chat/engines/types";
import { createLogger } from "@/lib/logger";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";

const log = createLogger("CopilotSdk");
const COPILOT_RUNTIME_CACHE_TTL_MS = 15_000;
const COPILOT_STATUS_CACHE_TTL_MS = 15_000;
const COPILOT_STARTUP_TIMEOUT_MS = 10_000;
const COPILOT_STATUS_QUERY_TIMEOUT_MS = 3_000;
const COPILOT_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const LOCAL_STATE_EXECUTABLE_MODE = 0o700;
const COPILOT_STATUS_SNAPSHOT_FILE = "copilot-status.json";
const COPILOT_CLI_SHIM_FILE = "copilot-cli";
const COPILOT_NODE_PROBE_TIMEOUT_MS = 5_000;
const execFileAsync = promisify(execFile);

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
  cliPath: string | null;
};

function getLocalStateDirectory() {
  return getSentinelStateRoot();
}

function getCopilotStatusSnapshotPath() {
  return path.join(getLocalStateDirectory(), COPILOT_STATUS_SNAPSHOT_FILE);
}

function getCopilotCliShimPath() {
  return path.join(getLocalStateDirectory(), COPILOT_CLI_SHIM_FILE);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
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
      .catch((error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      });
  });
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
  effort: ModelInfo["defaultReasoningEffort"] | undefined,
): ReasoningEffort | null {
  switch (effort) {
    case "low":
    case "medium":
    case "high":
      return effort;
    case "xhigh":
      return "high";
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
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies CopilotEngineStatus;
}

function buildCachedCopilotStatus(input: {
  cliPath: string;
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
    normalizedMessage.includes("could not find @github/copilot package") ||
    normalizedMessage.includes("copilot cli not found") ||
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

function toPosixShellString(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function getNodeCandidatePaths() {
  const candidates = new Set<string>();

  if (typeof process.env.SENTINEL_COPILOT_NODE_PATH === "string") {
    const configuredNodePath = process.env.SENTINEL_COPILOT_NODE_PATH.trim();
    if (configuredNodePath.length > 0) {
      candidates.add(configuredNodePath);
    }
  }

  if (typeof process.execPath === "string" && process.execPath.length > 0) {
    candidates.add(process.execPath);
  }

  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    candidates.add(
      path.join(entry, process.platform === "win32" ? "node.exe" : "node"),
    );
  }

  if (process.platform === "darwin") {
    candidates.add("/opt/homebrew/bin/node");
    candidates.add("/usr/local/bin/node");
  }

  return Array.from(candidates);
}

async function isCopilotNodeCompatible(
  nodePath: string,
  cliEntrypointPath: string,
) {
  try {
    await access(nodePath, fsConstants.X_OK);
  } catch {
    return false;
  }

  try {
    await execFileAsync(nodePath, [cliEntrypointPath, "--help"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
      timeout: COPILOT_NODE_PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    return true;
  } catch (error) {
    log.debug("copilot_node_probe_failed", { error, nodePath });
    return false;
  }
}

async function resolveCompatibleCopilotNodePath(cliEntrypointPath: string) {
  for (const nodePath of getNodeCandidatePaths()) {
    if (await isCopilotNodeCompatible(nodePath, cliEntrypointPath)) {
      return nodePath;
    }
  }

  return null;
}

async function ensureCopilotCliShim(options: {
  cliEntrypointPath: string;
  nodePath: string;
}) {
  const localStateDirectory = getLocalStateDirectory();
  const shimPath = getCopilotCliShimPath();
  const shimContents = [
    "#!/bin/sh",
    `exec ${toPosixShellString(options.nodePath)} ${toPosixShellString(options.cliEntrypointPath)} "$@"`,
    "",
  ].join("\n");

  await mkdir(localStateDirectory, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(shimPath, shimContents, {
    encoding: "utf8",
    mode: LOCAL_STATE_EXECUTABLE_MODE,
  });
  await chmod(shimPath, LOCAL_STATE_EXECUTABLE_MODE);
  await applyPrivateFsMode(localStateDirectory, LOCAL_STATE_DIRECTORY_MODE);
  await applyPrivateFsMode(shimPath, LOCAL_STATE_EXECUTABLE_MODE);

  return shimPath;
}

function normalizeCopilotError(error: unknown): {
  error: string;
  state: CopilotEngineState;
} {
  const message = error instanceof Error ? error.message : String(error);

  if (isCopilotMissingRuntimeMessage(message)) {
    return {
      error:
        "GitHub Copilot runtime is missing. Install the bundled Copilot CLI package and its platform binary for this machine.",
      state: "missing_runtime",
    };
  }

  if (isCopilotNodeVersionMessage(message)) {
    return {
      error:
        "GitHub Copilot needs a newer Node.js runtime than this Sentinel build is using. Upgrade the app runtime or run Sentinel with a Node.js version supported by the bundled Copilot CLI.",
      state: "error",
    };
  }

  if (isCopilotAuthErrorMessage(message)) {
    return {
      error:
        "GitHub Copilot needs authentication before it can be used here. Sign in with the Copilot CLI or provide a GitHub token.",
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

async function resolveCopilotRuntimeUncached(): Promise<ResolvedCopilotRuntime> {
  try {
    const require = createRequire(import.meta.url);
    const sdkEntrypoint = require.resolve("@github/copilot-sdk");
    const cliEntrypointPath = path.resolve(
      path.dirname(sdkEntrypoint),
      "..",
      "..",
      "..",
      "copilot",
      "index.js",
    );
    await access(cliEntrypointPath, fsConstants.R_OK);

    const compatibleNodePath =
      await resolveCompatibleCopilotNodePath(cliEntrypointPath);

    const cliPath =
      compatibleNodePath && compatibleNodePath !== process.execPath
        ? await ensureCopilotCliShim({
            cliEntrypointPath,
            nodePath: compatibleNodePath,
          })
        : cliEntrypointPath;

    log.info("resolved_copilot_runtime", {
      cliEntrypointPath,
      cliPath,
      compatibleNodePath,
      processExecPath: process.execPath,
    });

    return {
      cliDetected: true,
      cliPath,
    };
  } catch (error) {
    log.warn("resolve_copilot_runtime_failed", { error });
    return {
      cliDetected: false,
      cliPath: null,
    };
  }
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

class CopilotClientManager {
  private client: CopilotClient | null = null;
  private clientPromise: Promise<CopilotClient> | null = null;

  private buildClient(runtime: ResolvedCopilotRuntime) {
    return new CopilotClient({
      autoStart: false,
      ...(runtime.cliPath ? { cliPath: runtime.cliPath } : {}),
      cwd: process.cwd(),
      logLevel: process.env.NODE_ENV === "development" ? "debug" : "error",
    });
  }

  async getClient() {
    const runtime = await resolveCopilotRuntime();
    if (!runtime.cliDetected || !runtime.cliPath) {
      throw new Error(
        "GitHub Copilot runtime was not detected in this Sentinel session.",
      );
    }

    if (this.clientPromise) {
      return await this.clientPromise;
    }

    this.clientPromise = (async () => {
      if (!this.client) {
        this.client = this.buildClient(runtime);
      }

      if (this.client.getState() !== "connected") {
        await this.client.start();
      }

      return this.client;
    })().catch((error) => {
      this.clientPromise = null;
      this.client = null;
      throw error;
    });

    return await this.clientPromise;
  }

  async createSession(config: SessionConfig) {
    const client = await this.getClient();
    return await client.createSession(config);
  }

  async resumeSession(sessionId: string, config: ResumeSessionConfig) {
    const client = await this.getClient();
    return await client.resumeSession(sessionId, config);
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
      error:
        "GitHub Copilot runtime was not detected. Install the bundled Copilot CLI package for this machine.",
      lastSuccessfulProbeAt: null,
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
