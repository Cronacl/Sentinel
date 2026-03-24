import "server-only";

import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { createLogger } from "@/lib/logger";
import type {
  CodexApprovalPolicy,
  CodexSandboxMode,
} from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

const log = createLogger("CodexAppServer");

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

type CodexWireReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

function normalizeCodexReasoningEffort(
  effort: string | null | undefined,
): ReasoningEffort {
  switch (effort) {
    case "low":
    case "medium":
    case "high":
    case "minimal":
      return effort;
    case "xhigh":
      return "high";
    default:
      return "medium";
  }
}

export type CodexApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "acceptWithExecpolicyAmendment"
  | "cancel"
  | "decline";

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
      email: string;
      planType: string;
      type: "chatgpt";
    };

export type CodexEngineStatus = {
  account: CodexAccountInfo | null;
  authReady: boolean;
  availableModels: CodexModelInfo[];
  cliDetected: boolean;
  cliVersion: string | null;
  engine: "codex";
  error: string | null;
  isDesktopRuntime: boolean;
  requiresOpenaiAuth: boolean;
  serverReachable: boolean;
};

type CodexInitializeResult = {
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
  items: CodexThreadItem[];
  status: "completed" | "failed" | "inProgress" | "interrupted";
};

export type CodexThreadItem =
  | {
      id: string;
      text: string;
      type: "agentMessage";
    }
  | {
      id: string;
      text: string;
      type: "plan";
    }
  | {
      content: string[];
      id: string;
      summary: string[];
      type: "reasoning";
    }
  | {
      aggregatedOutput: string | null;
      command: string;
      commandActions: unknown[];
      cwd: string;
      durationMs: number | null;
      exitCode: number | null;
      id: string;
      processId: string | null;
      status: "completed" | "declined" | "failed" | "inProgress";
      type: "commandExecution";
    }
  | {
      changes: unknown[];
      id: string;
      status: "completed" | "declined" | "failed" | "inProgress";
      type: "fileChange";
    }
  | {
      action: unknown | null;
      id: string;
      query: string;
      type: "webSearch";
    }
  | {
      arguments: unknown;
      durationMs: number | null;
      error: unknown;
      id: string;
      result: unknown;
      server: string;
      status: "completed" | "failed" | "inProgress";
      tool: string;
      type: "mcpToolCall";
    }
  | {
      id: string;
      path: string;
      type: "imageView";
    }
  | {
      id: string;
      review: string;
      type: "enteredReviewMode" | "exitedReviewMode";
    }
  | {
      agentsStates: Record<string, unknown>;
      id: string;
      prompt: string | null;
      receiverThreadIds: string[];
      senderThreadId: string;
      status: string;
      tool: string;
      type: "collabAgentToolCall";
    }
  | {
      id: string;
      type: "contextCompaction";
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
  method:
    | "item/commandExecution/requestApproval"
    | "item/fileChange/requestApproval";
  params: unknown;
  type: "approval-request";
};

export type CodexUserInputRequestEvent = {
  id: string;
  method: "tool/requestUserInput";
  params: unknown;
  type: "user-input-request";
};

export type CodexServerEvent =
  | CodexApprovalRequestEvent
  | CodexNotificationEvent
  | CodexUserInputRequestEvent;

type CodexPendingApproval = {
  id: string;
  method:
    | CodexApprovalRequestEvent["method"]
    | CodexUserInputRequestEvent["method"];
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

function isJsonRpcServerRequest(value: unknown): value is JsonRpcRequestMessage {
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

function isApprovalRequestMethod(
  method: string,
): method is CodexApprovalRequestEvent["method"] {
  return (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  );
}

function toCodexError(
  message: string,
  error?: unknown,
) {
  if (error instanceof Error) {
    return new Error(`${message}: ${error.message}`);
  }

  return new Error(message);
}

async function readCliVersion() {
  return await new Promise<string>((resolve, reject) => {
    execFile("codex", ["--version"], { env: process.env }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

class CodexAppServerManager {
  private buffer = "";

  private child: ChildProcessWithoutNullStreams | null = null;

  private initialized = false;

  private listeners = new Set<(event: CodexServerEvent) => void>();

  private nextRequestId = 0;

  private pendingApprovals = new Map<string, CodexPendingApproval>();

  private pendingRequests = new Map<string, PendingRequest>();

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

  async listModels() {
    const response = (await this.call("model/list", {})) as {
      data?: Array<{
        defaultReasoningEffort?: CodexWireReasoningEffort | null;
        description?: string;
        displayName?: string;
        id?: string;
        inputModalities?: string[];
        isDefault?: boolean;
        model?: string;
        supportedReasoningEfforts?: Array<{
          description?: string;
          reasoningEffort?: CodexWireReasoningEffort | null;
        }>;
        supportsPersonality?: boolean;
      }>;
    };

    const models: CodexModelInfo[] = [];

    for (const model of response.data ?? []) {
      if (
        typeof model?.id !== "string" ||
        typeof model?.model !== "string" ||
        typeof model?.displayName !== "string" ||
        typeof model?.description !== "string"
      ) {
        continue;
      }

      models.push({
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
      });
    }

    return models;
  }

  async readAccount() {
    const response = (await this.call("account/read", {})) as {
      account: CodexAccountInfo | null;
      requiresOpenaiAuth: boolean;
    };

    return response;
  }

  async startLogin(
    method: "apiKey" | "chatgpt" | "external",
    params?: { apiKey?: string; token?: string },
  ) {
    return (await this.call("account/login/start", {
      method,
      ...params,
    })) as {
      loginFlowUrl?: string;
      success?: boolean;
    };
  }

  async cancelLogin() {
    await this.call("account/login/cancel", {});
  }

  async logout() {
    await this.call("account/logout", {});
  }

  async readRateLimits() {
    return (await this.call("account/rateLimits/read", {})) as {
      rateLimits: Array<{
        limit: number;
        model: string;
        remaining: number;
        resetAt: string;
        type: string;
      }>;
    };
  }

  async readConfig() {
    return (await this.call("config/read", {})) as {
      config: Record<string, unknown>;
    };
  }

  async writeConfigValue(key: string, value: unknown) {
    return (await this.call("config/value/write", {
      key,
      value,
    })) as { config: Record<string, unknown> };
  }

  async batchWriteConfig(values: Record<string, unknown>) {
    return (await this.call("config/batchWrite", {
      values,
    })) as { config: Record<string, unknown> };
  }

  async listSkills() {
    return (await this.call("skills/list", {})) as {
      skills: Array<{
        description: string;
        enabled: boolean;
        id: string;
        name: string;
      }>;
    };
  }

  async writeSkillConfig(skillId: string, enabled: boolean) {
    return (await this.call("skills/config/write", {
      enabled,
      skillId,
    })) as { skill: { enabled: boolean; id: string } };
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

  async reloadMcpServer(serverName: string) {
    await this.call("config/mcpServer/reload", { serverName });
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

  async getStatus(): Promise<CodexEngineStatus> {
    const cliVersion = await readCliVersion().catch(() => null);

    if (!cliVersion) {
      return {
        account: null,
        authReady: false,
        availableModels: [],
        cliDetected: false,
        cliVersion: null,
        engine: "codex",
        error: "Codex CLI is not installed or not available on PATH.",
        isDesktopRuntime: false,
        requiresOpenaiAuth: false,
        serverReachable: false,
      };
    }

    try {
      await this.ensureStarted();
      const [{ account, requiresOpenaiAuth }, availableModels] =
        await Promise.all([this.readAccount(), this.listModels()]);

      return {
        account,
        authReady: account != null || !requiresOpenaiAuth,
        availableModels,
        cliDetected: true,
        cliVersion,
        engine: "codex",
        error: null,
        isDesktopRuntime: true,
        requiresOpenaiAuth,
        serverReachable: true,
      };
    } catch (error) {
      return {
        account: null,
        authReady: false,
        availableModels: [],
        cliDetected: true,
        cliVersion,
        engine: "codex",
        error: error instanceof Error ? error.message : "Unable to reach Codex.",
        isDesktopRuntime: true,
        requiresOpenaiAuth: false,
        serverReachable: false,
      };
    }
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

  async steerTurn(params: {
    input: unknown[];
    threadId: string;
    turnId: string;
  }) {
    return (await this.call("turn/steer", params)) as {
      turn: CodexTurn;
    };
  }

  async startReview(threadId: string) {
    return (await this.call("review/start", { threadId })) as {
      review: { id: string; text: string };
    };
  }

  async rollbackThread(threadId: string, count: number) {
    return (await this.call("thread/rollback", {
      count,
      threadId,
    })) as { thread: CodexThread };
  }

  async compactThread(threadId: string) {
    return (await this.call("thread/compact/start", {
      threadId,
    })) as { thread: CodexThread };
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

  async respondToApproval(
    approvalId: string,
    decision: CodexApprovalDecision,
  ) {
    await this.ensureStarted();

    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error("That Codex approval request is no longer active.");
    }

    this.pendingApprovals.delete(approvalId);
    this.writeMessage({
      id: approvalId,
      result: { decision },
    });
  }

  async respondToUserInput(requestId: string, response: string) {
    await this.ensureStarted();

    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error("That Codex user input request is no longer active.");
    }

    this.pendingApprovals.delete(requestId);
    this.writeMessage({
      id: requestId,
      result: { response },
    });
  }

  private async startProcess() {
    const child = spawn("codex", ["app-server"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.buffer = "";
    this.initialized = false;

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
      this.resetProcess(toCodexError("Failed to start Codex app-server", error));
    });

    try {
      await this.callRaw("initialize", {
        capabilities: null,
        clientInfo: {
          name: "Sentinel",
          version: "0.1.0-alpha.1",
        },
      });
      this.initialized = true;
    } catch (error) {
      this.resetProcess(
        toCodexError("Failed to initialize Codex app-server", error),
      );
      throw error;
    }
  }

  private resetProcess(error: Error) {
    if (this.child) {
      this.child.removeAllListeners();
      this.child.stdout.removeAllListeners();
      this.child.stderr.removeAllListeners();
    }

    this.child = null;
    this.buffer = "";
    this.initialized = false;
    this.pendingApprovals.clear();

    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch (error) {
        log.error("invalid_json", { error, line });
        continue;
      }

      this.handleMessage(parsed);
    }
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
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (isJsonRpcServerRequest(message)) {
      const id = String(message.id);
      if (isApprovalRequestMethod(message.method)) {
        this.pendingApprovals.set(id, {
          id,
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

      if (message.method === "tool/requestUserInput") {
        this.pendingApprovals.set(id, {
          id,
          method: message.method,
          params: message.params,
        });
        this.emit({
          id,
          method: "tool/requestUserInput",
          params: message.params,
          type: "user-input-request",
        });
        return;
      }

      this.writeMessage({
        error: {
          code: -32601,
          message: `Unsupported server request: ${message.method}`,
        },
        id: message.id,
      });
      return;
    }

    if (isJsonRpcNotification(message)) {
      this.emit({
        method: message.method,
        params: message.params,
        type: "notification",
      });
    }
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
      this.pendingRequests.set(id, { reject, resolve });
      this.writeMessage({
        id,
        method,
        params,
      });
    });
  }

  private writeMessage(
    message:
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

let codexAppServerManager: CodexAppServerManager | null = null;

export function getCodexAppServerManager() {
  if (!codexAppServerManager) {
    codexAppServerManager = new CodexAppServerManager();
  }

  return codexAppServerManager;
}
