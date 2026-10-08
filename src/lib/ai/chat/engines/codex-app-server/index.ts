import "server-only";

import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createLogger } from "@/lib/logger";
import { applyPrivateFsMode } from "@/lib/runtime/local-state";
import { createLineSplitter } from "@/lib/runtime/process/line-splitter";
import { withTimeout } from "@/lib/runtime/process/with-timeout";
import type {
  CodexApprovalPolicy,
  CodexSandboxMode,
} from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  readCodexCliVersion,
  resolveCodexCli,
  spawnCodexCli,
  type CodexCliInstance,
  type ResolvedCodexCli,
} from "../codex-cli";
import { getInstanceResources } from "../platform/instance-resources";
import { getLegacyEngineStatusFilePath } from "../platform/paths";
import {
  getConfiguredBinaryOverride,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
} from "../platform/runtime/resolve-binary";
import {
  buildCodexApprovalResult,
  buildCodexDeclinedServerRequestResult,
  buildCodexInitializeParams,
  buildCodexUserInputResult,
  CODEX_METHOD_NOT_FOUND_ERROR_CODE,
  CODEX_PROTOCOL_BASELINE_VERSION,
  getCodexMcpElicitationDeclineReason,
  isCodexAlreadyInitializedError,
  isCodexApprovalRequestMethod,
  isCodexUserInputRequestMethod,
  isCodexVersionAtLeast,
  parseCodexVersion,
  revertCodexThreadTurns,
  type CodexApprovalDecision,
  type CodexApprovalRequestMethod,
  type CodexUserInputRequestMethod,
} from "./protocol";

const log = createLogger("CodexAppServer");
const CODEX_STATUS_QUERY_TIMEOUT_MS = 1_200;
const CODEX_STATUS_CACHE_TTL_MS = 15_000;
const CODEX_STATUS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_STATE_FILE_MODE = 0o600;
const CODEX_STATUS_SNAPSHOT_FILE = "codex-status.json";
const CODEX_MODEL_LIST_MAX_PAGES = 10;

type JsonRpcId = number | string;

type JsonRpcError = {
  code: number;
  data?: unknown;
  message: string;
};

type JsonRpcResultMessage = {
  id: JsonRpcId;
  jsonrpc?: "2.0";
  result: unknown;
};

type JsonRpcErrorMessage = {
  error: JsonRpcError;
  id: JsonRpcId;
  jsonrpc?: "2.0";
};

type JsonRpcNotificationMessage = {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcRequestMessage = JsonRpcNotificationMessage & {
  id: JsonRpcId;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

/** A JSON-RPC error reply from Codex, keeping its numeric `code`. */
export class CodexJsonRpcError extends Error {
  readonly code: number;

  readonly data: unknown;

  readonly method: string;

  constructor(method: string, error: JsonRpcError) {
    super(error.message);
    this.name = "CodexJsonRpcError";
    this.code = error.code;
    this.data = error.data;
    this.method = method;
  }
}

type CodexWireReasoningEffort = ReasoningEffort;

function normalizeCodexReasoningEffort(
  effort: string | null | undefined,
): ReasoningEffort {
  switch (effort) {
    case "none":
    case "xhigh":
    case "low":
    case "medium":
    case "high":
    case "minimal":
      return effort;
    default:
      return "medium";
  }
}

type CodexWireModel = {
  defaultReasoningEffort?: CodexWireReasoningEffort | null;
  description: string;
  displayName: string;
  id: string;
  inputModalities?: string[];
  isDefault?: boolean;
  model: string;
  supportedReasoningEfforts?: Array<{
    description?: string;
    reasoningEffort?: CodexWireReasoningEffort | null;
  }>;
  supportsPersonality?: boolean;
};

function toCodexModelInfo(model: CodexWireModel): CodexModelInfo {
  return {
    defaultReasoningEffort: normalizeCodexReasoningEffort(
      model.defaultReasoningEffort,
    ),
    description: model.description,
    displayName: model.displayName,
    id: model.id,
    inputModalities: model.inputModalities ?? ["text"],
    isDefault: Boolean(model.isDefault),
    model: model.model,
    supportedReasoningEfforts: (model.supportedReasoningEfforts ?? [])
      .map((option) => {
        const normalizedEffort = normalizeCodexReasoningEffort(
          option.reasoningEffort,
        );

        return {
          description: option.description ?? "",
          effort: normalizedEffort,
          label:
            normalizedEffort.charAt(0).toUpperCase() +
            normalizedEffort.slice(1),
        };
      })
      .filter(
        (option, index, array) =>
          array.findIndex((candidate) => candidate.effort === option.effort) ===
          index,
      ),
    supportsPersonality: Boolean(model.supportsPersonality),
  };
}

function getCodexStatusSnapshotPath(
  instance: CodexCliInstance | null | undefined,
) {
  return getLegacyEngineStatusFilePath(CODEX_STATUS_SNAPSHOT_FILE, instance);
}

async function writeCodexStatusSnapshot(
  snapshotPath: string,
  snapshot: CodexStatusSnapshot,
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

async function readCodexStatusSnapshot(
  snapshotPath: string,
  options: { cliPath: string },
) {
  try {
    const rawSnapshot = await readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(rawSnapshot) as Partial<CodexStatusSnapshot>;

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

    if (Date.now() - recordedAt.getTime() > CODEX_STATUS_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return {
      account: (parsed.account as CodexAccountInfo | null | undefined) ?? null,
      availableModels: parsed.availableModels as CodexModelInfo[],
      cliPath: parsed.cliPath,
      cliVersion:
        typeof parsed.cliVersion === "string" ? parsed.cliVersion : null,
      recordedAt: recordedAt.toISOString(),
      requiresOpenaiAuth: Boolean(parsed.requiresOpenaiAuth),
    } satisfies CodexStatusSnapshot;
  } catch {
    return null;
  }
}

function buildCodexEngineStatus(input: {
  account: CodexAccountInfo | null;
  authReady: boolean;
  availableModels: CodexModelInfo[];
  cliDetected: boolean;
  cliPath?: string | null;
  cliVersion: string | null;
  error: string | null;
  isDesktopRuntime: boolean;
  lastSuccessfulProbeAt: string | null;
  requiresOpenaiAuth: boolean;
  serverReachable: boolean;
  state: CodexEngineState;
  usedCachedStatus: boolean;
}) {
  return {
    account: input.account,
    authReady: input.authReady,
    availableModels: input.availableModels,
    cliDetected: input.cliDetected,
    cliPath: input.cliPath ?? null,
    cliVersion: input.cliVersion,
    engine: "codex" as const,
    error: input.error,
    isDesktopRuntime: input.isDesktopRuntime,
    lastSuccessfulProbeAt: input.lastSuccessfulProbeAt,
    requiresOpenaiAuth: input.requiresOpenaiAuth,
    serverReachable: input.serverReachable,
    state: input.state,
    usedCachedStatus: input.usedCachedStatus,
  } satisfies CodexEngineStatus;
}

function buildCachedCodexStatus(input: {
  cliVersion: string | null;
  snapshot: CodexStatusSnapshot;
}) {
  return buildCodexEngineStatus({
    account: input.snapshot.account,
    authReady:
      input.snapshot.account != null || !input.snapshot.requiresOpenaiAuth,
    availableModels: input.snapshot.availableModels,
    cliDetected: true,
    cliPath: input.snapshot.cliPath,
    cliVersion: input.cliVersion,
    error: null,
    isDesktopRuntime: true,
    lastSuccessfulProbeAt: input.snapshot.recordedAt,
    requiresOpenaiAuth: input.snapshot.requiresOpenaiAuth,
    serverReachable: false,
    state: "ready",
    usedCachedStatus: true,
  });
}

function isCodexAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("login") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("unauth")
  );
}

export type { CodexApprovalDecision };

export type CodexModelInfo = {
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
  supportsPersonality: boolean;
};

export type CodexAccountInfo =
  | {
      type: "apiKey";
    }
  | {
      email: string | null;
      planType: string;
      type: "chatgpt";
    }
  | {
      type: "amazonBedrock";
      usesCodexManagedCredentials?: boolean;
    };

export type CodexConfigMergeStrategy = "replace" | "upsert";

export type CodexConfigEdit = {
  keyPath: string;
  mergeStrategy?: CodexConfigMergeStrategy;
  value: unknown;
};

export type CodexConfigWriteResponse = {
  filePath: string;
  overriddenMetadata?: {
    effectiveValue: unknown;
    message: string;
    overridingLayer: unknown;
  } | null;
  status: "ok" | "okOverridden";
  version: string;
};

export type CodexLoginParams =
  | { apiKey: string; type: "apiKey" }
  | { type: "chatgpt" }
  | { type: "chatgptDeviceCode" };

export type CodexLoginResponse =
  | { type: "apiKey" }
  | { authUrl: string; loginId: string; type: "chatgpt" }
  | {
      loginId: string;
      type: "chatgptDeviceCode";
      userCode: string;
      verificationUrl: string;
    };

export type CodexRateLimitWindow = {
  resetsAt?: number | null;
  usedPercent: number;
  windowDurationMins?: number | null;
};

export type CodexRateLimitSnapshot = {
  credits?: {
    balance?: string | null;
    hasCredits: boolean;
    unlimited: boolean;
  } | null;
  limitId?: string | null;
  limitName?: string | null;
  planType?: string | null;
  primary?: CodexRateLimitWindow | null;
  secondary?: CodexRateLimitWindow | null;
};

export type CodexSkillInfo = {
  description: string;
  enabled: boolean;
  /** The skill's absolute path, which is what `skills/config/write` selects. */
  id: string;
  name: string;
  path: string;
  scope: string | null;
};

export type CodexEngineState =
  | "auth_unavailable"
  | "error"
  | "missing_cli"
  | "ready"
  | "timeout_no_cache"
  | "timeout_using_cache";

export type CodexEngineStatus = {
  account: CodexAccountInfo | null;
  authReady: boolean;
  availableModels: CodexModelInfo[];
  cliDetected: boolean;
  cliPath: string | null;
  cliVersion: string | null;
  engine: "codex";
  error: string | null;
  isDesktopRuntime: boolean;
  lastSuccessfulProbeAt: string | null;
  requiresOpenaiAuth: boolean;
  serverReachable: boolean;
  state: CodexEngineState;
  usedCachedStatus: boolean;
};

type CodexStatusSnapshot = {
  account: CodexAccountInfo | null;
  availableModels: CodexModelInfo[];
  cliPath: string;
  cliVersion: string | null;
  recordedAt: string;
  requiresOpenaiAuth: boolean;
};

type CodexInitializeResult = {
  codexHome?: string;
  platformFamily?: string;
  platformOs?: string;
  userAgent?: string;
};

type CodexThread = {
  cliVersion: string;
  createdAt: number;
  cwd: string;
  id: string;
  modelProvider: string;
  path: string | null;
  preview: string;
  turns: CodexTurn[];
  updatedAt: number;
};

export type CodexTurn = {
  error: { message?: string } | null;
  id: string;
  /** Empty when the turn was read with `itemsView: "notLoaded"`. */
  items?: CodexThreadItem[];
  status: "completed" | "failed" | "inProgress" | "interrupted";
};

type CodexItemStatus = "completed" | "declined" | "failed" | "inProgress";

// `ThreadItem` from codex-rs/app-server-protocol v2 (rust-v0.160.1). Optional
// fields are `Option<_>` upstream and may be omitted on the wire.
export type CodexThreadItem =
  | {
      id: string;
      phase?: string | null;
      text: string;
      type: "agentMessage";
    }
  | {
      id: string;
      text: string;
      type: "plan";
    }
  | {
      content?: string[];
      id: string;
      summary?: string[];
      type: "reasoning";
    }
  | {
      aggregatedOutput?: string | null;
      command: string;
      commandActions?: unknown[];
      cwd: string;
      durationMs?: number | null;
      exitCode?: number | null;
      id: string;
      processId?: string | null;
      status: CodexItemStatus;
      type: "commandExecution";
    }
  | {
      changes?: unknown[];
      id: string;
      status: CodexItemStatus;
      type: "fileChange";
    }
  | {
      action?: unknown | null;
      id: string;
      query: string;
      type: "webSearch";
    }
  | {
      arguments: unknown;
      durationMs?: number | null;
      error?: { message?: string } | string | null;
      id: string;
      result?: unknown;
      server: string;
      status: "completed" | "failed" | "inProgress";
      tool: string;
      type: "mcpToolCall";
    }
  | {
      arguments: unknown;
      contentItems?: unknown[] | null;
      durationMs?: number | null;
      id: string;
      namespace?: string | null;
      status: "completed" | "failed" | "inProgress";
      success?: boolean | null;
      tool: string;
      type: "dynamicToolCall";
    }
  | {
      id: string;
      path: string;
      type: "imageView";
    }
  | {
      failure?: unknown | null;
      id: string;
      /** Base64 image data; never copied into the transcript. */
      result?: string;
      revisedPrompt?: string | null;
      savedPath?: string | null;
      status: string;
      type: "imageGeneration";
    }
  | {
      id: string;
      review: string;
      type: "enteredReviewMode" | "exitedReviewMode";
    }
  | {
      agentsStates: Record<string, unknown>;
      id: string;
      model?: string | null;
      prompt?: string | null;
      receiverThreadIds: string[];
      senderThreadId: string;
      status: string;
      tool: string;
      type: "collabAgentToolCall";
    }
  | {
      agentPath: string;
      agentThreadId: string;
      id: string;
      kind: string;
      type: "subAgentActivity";
    }
  | {
      durationMs: number;
      id: string;
      type: "sleep";
    }
  | {
      id: string;
      type: "contextCompaction";
    }
  | {
      fragments?: Array<{ text?: string }>;
      id: string;
      type: "hookPrompt";
    }
  | {
      id: string;
      name: string;
      namespace?: string | null;
      output?: unknown;
      type: "functionCallOutput";
    }
  | {
      content: Array<{
        path?: string;
        text?: string;
        type: string;
        url?: string;
      }>;
      id: string;
      type: "userMessage";
    };

export type CodexNotificationEvent = {
  method: string;
  params: unknown;
  type: "notification";
};

export type CodexApprovalRequestEvent = {
  id: string;
  method: CodexApprovalRequestMethod;
  params: unknown;
  type: "approval-request";
};

export type CodexUserInputRequestEvent = {
  id: string;
  method: CodexUserInputRequestMethod;
  params: unknown;
  type: "user-input-request";
};

export type CodexServerEvent =
  | CodexApprovalRequestEvent
  | CodexNotificationEvent
  | CodexUserInputRequestEvent;

type CodexPendingServerRequest =
  | {
      id: JsonRpcId;
      kind: "approval";
      method: CodexApprovalRequestMethod;
      params: unknown;
    }
  | {
      id: JsonRpcId;
      kind: "user-input";
      method: CodexUserInputRequestMethod;
      params: unknown;
    };

function isJsonRpcResult(
  value: unknown,
): value is JsonRpcResultMessage | JsonRpcErrorMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    ("result" in value || "error" in value),
  );
}

function isJsonRpcServerRequest(
  value: unknown,
): value is JsonRpcRequestMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    "method" in value &&
    typeof (value as { method?: unknown }).method === "string",
  );
}

function isJsonRpcNotification(
  value: unknown,
): value is JsonRpcNotificationMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    !("id" in value) &&
    "method" in value &&
    typeof (value as { method?: unknown }).method === "string",
  );
}

function toCodexError(message: string, error?: unknown) {
  if (error instanceof Error) {
    return new Error(`${message}: ${error.message}`);
  }

  return new Error(message);
}

export type CodexAppServerManagerOptions = {
  /** The engine instance this app-server runs for (default: the default). */
  instance?: CodexCliInstance | null;
};

export class CodexAppServerManager {
  private backgroundStatusRefresh: Promise<void> | null = null;

  private cachedStatus: {
    expiresAt: number;
    promise: Promise<CodexEngineStatus>;
  } | null = null;

  private readonly instance: CodexCliInstance | null;

  constructor(options: CodexAppServerManagerOptions = {}) {
    this.instance = options.instance ?? null;
  }

  // NDJSON framing of the app-server's stdout (LF-delimited; a fresh one
  // per process so a partial line never leaks into the next process).
  private stdoutLines = this.createStdoutSplitter();

  private child: ChildProcessWithoutNullStreams | null = null;

  private initialized = false;

  private listeners = new Set<(event: CodexServerEvent) => void>();

  private notificationListeners = new Set<
    (event: CodexNotificationEvent) => void
  >();

  private initializeResult: CodexInitializeResult | null = null;

  private lastKnownModels: CodexModelInfo[] = [];

  private nextRequestId = 0;

  private pendingRequests = new Map<
    string,
    PendingRequest & { method: string }
  >();

  private pendingServerRequests = new Map<string, CodexPendingServerRequest>();

  private starting: Promise<void> | null = null;

  async ensureStarted() {
    if (this.child && this.initialized) {
      return;
    }

    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = this.startProcess();

    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  subscribe(listener: (event: CodexServerEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifications only (account/login/completed…), for listeners that are
   * not a run: unlike `subscribe`, they do not count as someone who can
   * answer Codex's approval requests.
   */
  subscribeNotifications(listener: (event: CodexNotificationEvent) => void) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /** `initialize.userAgent` of the running app-server, if it started. */
  getServerUserAgent() {
    return this.initializeResult?.userAgent ?? null;
  }

  getServerVersion() {
    return parseCodexVersion(this.initializeResult?.userAgent);
  }

  /**
   * True unless the running app-server reports a version below the protocol
   * baseline (0.156): `turn/start.collaborationMode` is then sent natively.
   */
  supportsCollaborationMode() {
    return isCodexVersionAtLeast(
      this.getServerVersion(),
      CODEX_PROTOCOL_BASELINE_VERSION,
    );
  }

  /** The `isDefault` model from the latest `model/list`, if any. */
  getDefaultModel() {
    return (
      this.lastKnownModels.find((model) => model.isDefault) ??
      this.lastKnownModels[0] ??
      null
    );
  }

  getKnownModel(modelId: string | null | undefined) {
    if (!modelId) {
      return null;
    }

    return (
      this.lastKnownModels.find(
        (model) => model.id === modelId || model.model === modelId,
      ) ?? null
    );
  }

  async listModels() {
    const models: CodexModelInfo[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let page = 0; page < CODEX_MODEL_LIST_MAX_PAGES; page += 1) {
      const response = (await this.call(
        "model/list",
        cursor ? { cursor } : {},
      )) as {
        data?: Array<Partial<CodexWireModel> & { hidden?: boolean }>;
        nextCursor?: string | null;
      };

      for (const model of response.data ?? []) {
        if (
          typeof model?.id !== "string" ||
          typeof model?.model !== "string" ||
          typeof model?.displayName !== "string" ||
          typeof model?.description !== "string" ||
          model.hidden === true
        ) {
          continue;
        }

        models.push(
          toCodexModelInfo({
            ...model,
            description: model.description,
            displayName: model.displayName,
            id: model.id,
            model: model.model,
          }),
        );
      }

      cursor = response.nextCursor ?? null;
      if (!cursor || seenCursors.has(cursor)) {
        break;
      }
      seenCursors.add(cursor);
    }

    this.lastKnownModels = models;
    return models;
  }

  async readAccount() {
    const response = (await this.call("account/read", {})) as {
      account: CodexAccountInfo | null;
      requiresOpenaiAuth: boolean;
    };

    return response;
  }

  /**
   * `account/login/start`. ChatGPT login answers `{loginId, authUrl}` and
   * finishes with an `account/login/completed` notification; device-code
   * login answers `{loginId, verificationUrl, userCode}`.
   */
  async startLogin(params: CodexLoginParams) {
    return (await this.call(
      "account/login/start",
      params,
    )) as CodexLoginResponse;
  }

  async cancelLogin(loginId: string) {
    return (await this.call("account/login/cancel", { loginId })) as {
      status: "canceled" | "notFound";
    };
  }

  async logout() {
    // `account/logout` takes no params (`Option<()>` upstream); send none.
    await this.call("account/logout", undefined);
  }

  async readRateLimits() {
    return (await this.call("account/rateLimits/read", undefined)) as {
      rateLimits: CodexRateLimitSnapshot;
      rateLimitsByLimitId?: Record<string, CodexRateLimitSnapshot> | null;
    };
  }

  async readConfig() {
    return (await this.call("config/read", {})) as {
      config: Record<string, unknown>;
    };
  }

  /**
   * Writes one dotted `keyPath` in the user's config.toml. A null (or
   * missing) value removes the key.
   */
  async writeConfigValue(
    keyPath: string,
    value: unknown,
    mergeStrategy: CodexConfigMergeStrategy = "replace",
  ) {
    return (await this.call("config/value/write", {
      keyPath,
      mergeStrategy,
      value: value ?? null,
    })) as CodexConfigWriteResponse;
  }

  async batchWriteConfig(edits: CodexConfigEdit[]) {
    return (await this.call("config/batchWrite", {
      edits: edits.map((edit) => ({
        keyPath: edit.keyPath,
        mergeStrategy: edit.mergeStrategy ?? "replace",
        value: edit.value ?? null,
      })),
    })) as CodexConfigWriteResponse;
  }

  async listSkills(options?: { cwds?: string[] }) {
    const response = (await this.call("skills/list", {
      ...(options?.cwds?.length ? { cwds: options.cwds } : {}),
    })) as {
      data?: Array<{
        skills?: Array<{
          description?: string;
          enabled?: boolean;
          name?: string;
          path?: string;
          scope?: string;
        }>;
      }>;
    };

    // Skills are grouped per cwd; flatten them and key each one by path,
    // which is the selector `skills/config/write` accepts.
    const skills = new Map<string, CodexSkillInfo>();
    for (const entry of response.data ?? []) {
      for (const skill of entry?.skills ?? []) {
        if (typeof skill?.name !== "string" || typeof skill.path !== "string") {
          continue;
        }

        skills.set(skill.path, {
          description: skill.description ?? "",
          enabled: skill.enabled !== false,
          id: skill.path,
          name: skill.name,
          path: skill.path,
          scope: typeof skill.scope === "string" ? skill.scope : null,
        });
      }
    }

    return { skills: [...skills.values()] };
  }

  /** `skillPath` is a `CodexSkillInfo.id` (the skill's absolute path). */
  async writeSkillConfig(skillPath: string, enabled: boolean) {
    return (await this.call("skills/config/write", {
      enabled,
      path: skillPath,
    })) as { effectiveEnabled: boolean };
  }

  async listMcpServerStatus() {
    return (await this.call("mcpServerStatus/list", {})) as {
      servers: Array<{
        name: string;
        status: string;
        tools: string[];
      }>;
    };
  }

  /** Reloads every configured MCP server; the method takes no params. */
  async reloadMcpServers() {
    await this.call("config/mcpServer/reload", undefined);
  }

  async listExperimentalFeatures() {
    return (await this.call("experimentalFeature/list", {})) as {
      features: Array<{
        description: string;
        enabled: boolean;
        id: string;
        name: string;
      }>;
    };
  }

  async reloadRuntime() {
    const child = this.child;
    this.resetProcess(new Error("Codex runtime was reloaded."));

    if (child && !child.killed) {
      child.kill();
    }
  }

  /** Forgets the cached status; the next getStatus() probes again. */
  resetStatusCache() {
    this.cachedStatus = null;
  }

  /** Ends the app-server process; the manager restarts it on next use. */
  async dispose() {
    await this.reloadRuntime();
  }

  private cacheStatus(status: CodexEngineStatus) {
    this.cachedStatus = {
      expiresAt: Date.now() + CODEX_STATUS_CACHE_TTL_MS,
      promise: Promise.resolve(status),
    };
  }

  private async probeStatus(input: {
    cliVersion: string | null;
    fallbackSnapshot: CodexStatusSnapshot | null;
    forceRefresh: boolean;
    resolvedCli: ResolvedCodexCli;
  }): Promise<CodexEngineStatus> {
    if (input.forceRefresh) {
      await this.reloadRuntime();
    }

    try {
      const statusPayload = await withTimeout(
        (async () => {
          await this.ensureStarted();
          const [{ account, requiresOpenaiAuth }, availableModels] =
            await Promise.all([this.readAccount(), this.listModels()]);
          return { account, availableModels, requiresOpenaiAuth };
        })(),
        CODEX_STATUS_QUERY_TIMEOUT_MS,
        { nullOnError: true },
      );

      if (!statusPayload) {
        if (input.fallbackSnapshot) {
          return buildCachedCodexStatus({
            cliVersion: input.cliVersion,
            snapshot: input.fallbackSnapshot,
          });
        }

        return buildCodexEngineStatus({
          account: null,
          authReady: false,
          availableModels: [],
          cliDetected: true,
          cliPath: input.resolvedCli.command,
          cliVersion: input.cliVersion,
          error: "Timed out while querying Codex runtime.",
          isDesktopRuntime: true,
          lastSuccessfulProbeAt: null,
          requiresOpenaiAuth: false,
          serverReachable: false,
          state: "timeout_no_cache",
          usedCachedStatus: false,
        });
      }

      if (statusPayload.requiresOpenaiAuth && statusPayload.account == null) {
        if (input.fallbackSnapshot) {
          return buildCachedCodexStatus({
            cliVersion: input.cliVersion,
            snapshot: input.fallbackSnapshot,
          });
        }

        return buildCodexEngineStatus({
          account: null,
          authReady: false,
          availableModels: [],
          cliDetected: true,
          cliPath: input.resolvedCli.command,
          cliVersion: input.cliVersion,
          error: "Codex CLI is not authenticated.",
          isDesktopRuntime: true,
          lastSuccessfulProbeAt: null,
          requiresOpenaiAuth: true,
          serverReachable: true,
          state: "auth_unavailable",
          usedCachedStatus: false,
        });
      }

      const recordedAt = new Date().toISOString();
      await writeCodexStatusSnapshot(
        getCodexStatusSnapshotPath(this.instance),
        {
          account: statusPayload.account,
          availableModels: statusPayload.availableModels,
          cliPath: input.resolvedCli.command,
          cliVersion: input.cliVersion,
          recordedAt,
          requiresOpenaiAuth: statusPayload.requiresOpenaiAuth,
        },
      );

      return buildCodexEngineStatus({
        account: statusPayload.account,
        authReady:
          statusPayload.account != null || !statusPayload.requiresOpenaiAuth,
        availableModels: statusPayload.availableModels,
        cliDetected: true,
        cliPath: input.resolvedCli.command,
        cliVersion: input.cliVersion,
        error: null,
        isDesktopRuntime: true,
        lastSuccessfulProbeAt: recordedAt,
        requiresOpenaiAuth: statusPayload.requiresOpenaiAuth,
        serverReachable: true,
        state: "ready",
        usedCachedStatus: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to reach Codex.";

      if (input.fallbackSnapshot) {
        return buildCachedCodexStatus({
          cliVersion: input.cliVersion,
          snapshot: input.fallbackSnapshot,
        });
      }

      return buildCodexEngineStatus({
        account: null,
        authReady: false,
        availableModels: [],
        cliDetected: true,
        cliPath: input.resolvedCli.command,
        cliVersion: input.cliVersion,
        error: message,
        isDesktopRuntime: true,
        lastSuccessfulProbeAt: null,
        requiresOpenaiAuth: isCodexAuthErrorMessage(message),
        serverReachable: false,
        state: isCodexAuthErrorMessage(message) ? "auth_unavailable" : "error",
        usedCachedStatus: false,
      });
    }
  }

  private scheduleBackgroundStatusRefresh(input: {
    cliVersion: string | null;
    resolvedCli: ResolvedCodexCli;
    snapshot: CodexStatusSnapshot;
  }) {
    if (this.backgroundStatusRefresh) {
      return;
    }

    this.backgroundStatusRefresh = (async () => {
      const status = await this.probeStatus({
        cliVersion: input.cliVersion,
        fallbackSnapshot: input.snapshot,
        forceRefresh: false,
        resolvedCli: input.resolvedCli,
      });

      if (!status.usedCachedStatus && status.state === "ready") {
        this.cacheStatus(status);
      }
    })().finally(() => {
      this.backgroundStatusRefresh = null;
    });
  }

  async getStatus(options?: {
    forceRefresh?: boolean;
  }): Promise<CodexEngineStatus> {
    const forceRefresh = options?.forceRefresh ?? false;
    const now = Date.now();

    if (
      !forceRefresh &&
      this.cachedStatus &&
      this.cachedStatus.expiresAt > now
    ) {
      return await this.cachedStatus.promise;
    }

    const snapshotPath = getCodexStatusSnapshotPath(this.instance);
    const pending = (async () => {
      const resolvedCli = await resolveCodexCli({
        forceRefresh,
        instance: this.instance,
      });
      if (!resolvedCli) {
        const retainedPath =
          getConfiguredBinaryOverride(
            this.instance,
            getInstanceProcessEnv(this.instance),
            ["SENTINEL_CODEX_PATH"],
          )?.path ?? null;
        return buildCodexEngineStatus({
          account: null,
          authReady: false,
          availableModels: [],
          cliDetected: false,
          cliPath: retainedPath,
          cliVersion: null,
          error: retainedPath
            ? "Codex CLI path is retained but is not currently launchable."
            : "Codex CLI is not installed or not available on PATH.",
          isDesktopRuntime: false,
          lastSuccessfulProbeAt: null,
          requiresOpenaiAuth: false,
          serverReachable: false,
          state: "missing_cli",
          usedCachedStatus: false,
        });
      }

      const cliVersion = await readCodexCliVersion(resolvedCli);

      const snapshot = await readCodexStatusSnapshot(snapshotPath, {
        cliPath: resolvedCli.command,
      });

      if (!forceRefresh && snapshot) {
        const status = buildCachedCodexStatus({
          cliVersion,
          snapshot,
        });
        this.scheduleBackgroundStatusRefresh({
          cliVersion,
          resolvedCli,
          snapshot,
        });
        return status;
      }

      return await this.probeStatus({
        cliVersion,
        fallbackSnapshot: snapshot,
        forceRefresh,
        resolvedCli,
      });
    })();

    this.cachedStatus = {
      expiresAt: now + CODEX_STATUS_CACHE_TTL_MS,
      promise: pending,
    };

    return await pending;
  }

  async startThread(params: {
    approvalPolicy: CodexApprovalPolicy;
    cwd: string | null;
    model: string | null;
    sandboxMode: CodexSandboxMode;
  }) {
    return (await this.call("thread/start", {
      approvalPolicy: params.approvalPolicy,
      cwd: params.cwd,
      ephemeral: false,
      experimentalRawEvents: false,
      model: params.model,
      sandbox: params.sandboxMode,
    })) as {
      approvalPolicy: CodexApprovalPolicy;
      cwd: string;
      model: string;
      modelProvider: string;
      reasoningEffort: ReasoningEffort | null;
      sandbox: unknown;
      thread: CodexThread;
    };
  }

  async readThread(threadId: string) {
    return (await this.call("thread/read", {
      includeTurns: true,
      threadId,
    })) as {
      thread: CodexThread;
    };
  }

  async resumeThread(threadId: string) {
    return (await this.call("thread/resume", {
      threadId,
    })) as {
      approvalPolicy: CodexApprovalPolicy;
      cwd: string;
      model: string;
      modelProvider: string;
      reasoningEffort: ReasoningEffort | null;
      sandbox: unknown;
      thread: CodexThread;
    };
  }

  async startTurn(params: {
    approvalPolicy?: CodexApprovalPolicy | null;
    collaborationMode?: {
      mode: "default" | "plan";
      settings: {
        model: string;
        reasoning_effort: string;
        developer_instructions: string;
      };
    };
    cwd?: string | null;
    effort?: ReasoningEffort | null;
    input: unknown[];
    model?: string | null;
    sandboxPolicy?: unknown;
    threadId: string;
  }) {
    return (await this.call("turn/start", params)) as {
      turn: CodexTurn;
    };
  }

  async interruptTurn(threadId: string, turnId: string) {
    await this.call("turn/interrupt", {
      threadId,
      turnId,
    });
  }

  /**
   * `turn/steer` appends input to the active turn; `expectedTurnId` must name
   * that turn or Codex rejects the steer.
   */
  async steerTurn(params: {
    expectedTurnId: string;
    input: unknown[];
    threadId: string;
  }) {
    return (await this.call("turn/steer", params)) as {
      turnId: string;
    };
  }

  /** Inline review of the working tree (the TUI's `/review` default). */
  async startReview(threadId: string) {
    return (await this.call("review/start", {
      target: { type: "uncommittedChanges" },
      threadId,
    })) as {
      reviewThreadId: string;
      turn: CodexTurn;
    };
  }

  async listThreadTurns(params: {
    cursor?: string | null;
    itemsView?: "full" | "notLoaded" | "summary";
    limit?: number;
    sortDirection?: "asc" | "desc";
    threadId: string;
  }) {
    return (await this.call("thread/turns/list", params)) as {
      backwardsCursor?: string | null;
      data: CodexTurn[];
      nextCursor?: string | null;
    };
  }

  /**
   * Replaces the thread's persisted history with the prefix before
   * `beforeTurnId`. Local file changes are not reverted.
   */
  async revertThread(threadId: string, beforeTurnId: string) {
    return (await this.call("thread/revert", {
      beforeTurnId,
      threadId,
    })) as {
      itemsBackwardsCursor?: string | null;
      thread: CodexThread;
      turnsBackwardsCursor?: string | null;
    };
  }

  /** Drops the last `numTurns` turns from the thread's history. */
  async revertThreadTurns(threadId: string, numTurns: number) {
    await this.ensureStarted();
    return await revertCodexThreadTurns(
      (method, params) => this.call(method, params),
      threadId,
      numTurns,
    );
  }

  async compactThread(threadId: string) {
    return (await this.call("thread/compact/start", {
      threadId,
    })) as Record<string, never>;
  }

  async forkThread(threadId: string) {
    return (await this.call("thread/fork", {
      threadId,
    })) as { thread: CodexThread };
  }

  async archiveThread(threadId: string) {
    await this.call("thread/archive", { threadId });
  }

  async unarchiveThread(threadId: string) {
    await this.call("thread/unarchive", { threadId });
  }

  /**
   * Answers an approval-style server request. `declinedReason` is set when
   * an accept had to be sent as a decline (MCP elicitations Sentinel cannot
   * complete), so the caller can show the request as denied.
   */
  async respondToApproval(
    approvalId: string,
    decision: CodexApprovalDecision,
  ): Promise<{ declinedReason: string | null }> {
    await this.ensureStarted();

    const pending = this.pendingServerRequests.get(approvalId);
    if (!pending || pending.kind !== "approval") {
      throw new Error("That Codex approval request is no longer active.");
    }

    this.pendingServerRequests.delete(approvalId);
    this.writeMessage({
      id: pending.id,
      result: buildCodexApprovalResult(
        pending.method,
        pending.params,
        decision,
      ),
    });

    return {
      declinedReason:
        pending.method === "mcpServer/elicitation/request"
          ? getCodexMcpElicitationDeclineReason(pending.params, decision)
          : null,
    };
  }

  /**
   * Declines a pending approval or question without an answer from the
   * user, the way an unclaimed request is declined. Unattended runs
   * (automations) use it: nobody could answer. False when the request is no
   * longer pending.
   */
  declineServerRequest(requestId: string) {
    const pending = this.pendingServerRequests.get(requestId);
    if (!pending) {
      return false;
    }

    this.pendingServerRequests.delete(requestId);
    this.writeMessage({
      id: pending.id,
      result: buildCodexDeclinedServerRequestResult(
        pending.method,
        pending.params,
      ),
    });
    return true;
  }

  async respondToUserInput(requestId: string, response: string) {
    await this.ensureStarted();

    const pending = this.pendingServerRequests.get(requestId);
    if (!pending || pending.kind !== "user-input") {
      throw new Error("That Codex user input request is no longer active.");
    }

    this.pendingServerRequests.delete(requestId);
    this.writeMessage({
      id: pending.id,
      result: buildCodexUserInputResult(
        pending.method,
        pending.params,
        response,
      ),
    });
  }

  private async startProcess() {
    const child = await spawnCodexCli(["app-server"], {
      instance: this.instance,
    });
    this.child = child;
    this.stdoutLines = this.createStdoutSplitter();
    this.initialized = false;
    this.initializeResult = null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.handleStdout(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      const text = chunk.trim();
      if (text) {
        log.debug("stderr", { message: text });
      }
    });
    child.on("exit", (code, signal) => {
      const error = new Error(
        `Codex app-server exited${code != null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}.`,
      );
      this.resetProcess(error);
    });
    child.on("error", (error) => {
      this.resetProcess(
        toCodexError("Failed to start Codex app-server", error),
      );
    });

    try {
      try {
        this.initializeResult = (await this.callRaw(
          "initialize",
          buildCodexInitializeParams(),
        )) as CodexInitializeResult;
      } catch (error) {
        // A second `initialize` on a live connection is rejected; the
        // connection is still usable, so finish the handshake.
        if (
          !(error instanceof CodexJsonRpcError) ||
          !isCodexAlreadyInitializedError(error)
        ) {
          throw error;
        }
      }

      this.writeMessage({ method: "initialized" });
      this.initialized = true;
    } catch (error) {
      this.resetProcess(
        toCodexError("Failed to initialize Codex app-server", error),
      );
      // A process that failed the handshake is unusable; do not leave it
      // running detached from the manager.
      if (!child.killed) {
        child.kill();
      }
      throw error;
    }
  }

  private resetProcess(error: Error) {
    this.cachedStatus = null;

    if (this.child) {
      this.child.removeAllListeners();
      this.child.stdout.removeAllListeners();
      this.child.stderr.removeAllListeners();
    }

    this.child = null;
    this.stdoutLines = this.createStdoutSplitter();
    this.initialized = false;
    this.pendingServerRequests.clear();

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private createStdoutSplitter() {
    return createLineSplitter(
      (rawLine) => {
        const line = rawLine.trim();
        if (!line) {
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch (error) {
          log.error("invalid_json", { error, line });
          return;
        }

        this.handleMessage(parsed);
      },
      {
        onOverflow: (bufferedChars) =>
          log.error("stdout_line_too_long", { bufferedChars }),
      },
    );
  }

  private handleStdout(chunk: string) {
    this.stdoutLines.push(chunk);
  }

  private handleMessage(message: unknown) {
    if (isJsonRpcResult(message)) {
      const id = String(message.id);
      const pending = this.pendingRequests.get(id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(id);
      if ("error" in message) {
        pending.reject(new CodexJsonRpcError(pending.method, message.error));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcServerRequest(message)) {
      this.handleServerRequest(message);
      return;
    }

    if (isJsonRpcNotification(message)) {
      if (message.method === "serverRequest/resolved") {
        // Codex resolved the request itself (interrupt, auto-review, …), so
        // a late answer from the UI must not be written back.
        const params = message.params as { requestId?: unknown } | undefined;
        if (
          typeof params?.requestId === "string" ||
          typeof params?.requestId === "number"
        ) {
          this.pendingServerRequests.delete(String(params.requestId));
        }
      }

      const event: CodexNotificationEvent = {
        method: message.method,
        params: message.params,
        type: "notification",
      };
      this.emit(event);
      for (const listener of this.notificationListeners) {
        listener(event);
      }
    }
  }

  private handleServerRequest(message: JsonRpcRequestMessage) {
    const id = String(message.id);

    if (
      this.listeners.size === 0 &&
      (isCodexApprovalRequestMethod(message.method) ||
        isCodexUserInputRequestMethod(message.method))
    ) {
      // No Sentinel run is listening (for example a turn that kept running
      // after Stop), so nobody could answer; decline instead of leaving
      // Codex blocked on the request.
      log.warn("unclaimed_server_request_declined", {
        method: message.method,
      });
      this.writeMessage({
        id: message.id,
        result: buildCodexDeclinedServerRequestResult(
          message.method,
          message.params,
        ),
      });
      return;
    }

    if (isCodexApprovalRequestMethod(message.method)) {
      this.pendingServerRequests.set(id, {
        id: message.id,
        kind: "approval",
        method: message.method,
        params: message.params,
      });
      this.emit({
        id,
        method: message.method,
        params: message.params,
        type: "approval-request",
      });
      return;
    }

    if (isCodexUserInputRequestMethod(message.method)) {
      this.pendingServerRequests.set(id, {
        id: message.id,
        kind: "user-input",
        method: message.method,
        params: message.params,
      });
      this.emit({
        id,
        method: message.method,
        params: message.params,
        type: "user-input-request",
      });
      return;
    }

    // Dynamic tools, external auth tokens, attestation and client clocks are
    // capabilities Sentinel never advertises.
    log.debug("unsupported_server_request", { method: message.method });
    this.writeMessage({
      error: {
        code: CODEX_METHOD_NOT_FOUND_ERROR_CODE,
        message: `Unsupported server request: ${message.method}`,
      },
      id: message.id,
    });
  }

  private emit(event: CodexServerEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private async call(method: string, params: unknown) {
    await this.ensureStarted();
    return await this.callRaw(method, params);
  }

  private async callRaw(method: string, params: unknown) {
    const id = String(++this.nextRequestId);

    return await new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { method, reject, resolve });
      try {
        this.writeMessage({
          id,
          method,
          ...(params === undefined ? {} : { params }),
        });
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private writeMessage(
    message:
      | (JsonRpcNotificationMessage & { id?: never; result?: never })
      | (JsonRpcRequestMessage & { result?: never; error?: never })
      | (JsonRpcResultMessage & { method?: never; params?: never })
      | (JsonRpcErrorMessage & { method?: never; params?: never }),
  ) {
    if (!this.child) {
      throw new Error("Codex app-server is not running.");
    }

    this.child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`,
    );
  }
}

const codexAppServerManagers = getInstanceResources<CodexAppServerManager>(
  "codex-app-server",
  {
    dispose: (manager) => manager.dispose(),
    onDisposeError: (error, instanceId) =>
      log.warn("dispose_failed", { error, instanceId }),
  },
);

export function resetCodexEngineStatusCache() {
  for (const manager of codexAppServerManagers.values()) {
    manager.resetStatusCache();
  }
}

/**
 * The app-server manager for an instance: one process per instance, keyed
 * by its runtime configuration (binary, CODEX_HOME, env), so instances with
 * different homes never share a process and a configuration change starts a
 * fresh one. The old one keeps serving whoever holds it until the instance
 * change retires it. Without an instance, the default instance's manager.
 */
export function getCodexAppServerManager(instance?: CodexCliInstance | null) {
  return codexAppServerManagers.get(
    instance?.id ?? "codex",
    getInstanceRuntimeKey(instance),
    () => new CodexAppServerManager({ instance }),
  );
}
