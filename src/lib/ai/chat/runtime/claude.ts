import "server-only";

import { generateId } from "ai";
import {
  query,
  type PermissionResult,
  type Query as ClaudeQuery,
  type SDKAssistantMessage,
  type SDKMessage,
  type SDKResultMessage,
  type SDKToolProgressMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import {
  buildClaudeSdkBaseOptions,
  buildClaudeThreadState,
  resolveClaudeCodeRuntime,
} from "@/lib/ai/chat/engines/claude-sdk";
import {
  getClaudeThreadState,
  type ClaudePermissionMode,
} from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import { streamContext } from "@/lib/streams";

import * as persist from "../persistence";
import {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
  getThreadCheckpointAnchorMessageId,
} from "../repo-checkpoints";
import {
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
} from "../session-server";
import type { ThreadStreamEvent } from "../session-types";
import type { ThreadChatRequest } from "../types";
import {
  buildActiveThreadMessages,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "./transcript";
import {
  type ClaudePromptResponse,
  extractClaudePromptResponseById,
  resolveClaudePromptResponse,
} from "./claude-event-helpers";
import {
  buildClaudePermissionResult,
  normalizeClaudePermissionInput,
  resolveClaudePermissionInput,
} from "./claude-permissions";
import {
  extractClaudeAssistantToolResultBlock,
  extractClaudeUserToolResults,
} from "./claude-tool-output";
import { buildPlanModePromptPreamble } from "./plan-mode-instructions";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";
import { getToolPermissionMode, getWorkspaceRootPath } from "./workspace";
import { ThreadChatConflictError } from "../errors";

const log = createLogger("ClaudeThreadChat");

type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

type ClaudeMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type ClaudeMirrorTool = {
  approval?: {
    id: string;
    approved?: boolean;
    decision?: string;
    reason?: string;
    response?: string;
  };
  errorText?: string;
  id: string;
  input?: unknown;
  name: string;
  order: number;
  output?: unknown;
  state: ClaudeMirrorToolState;
};

function sanitizeClaudeMirrorTool(tool: ClaudeMirrorTool): ClaudeMirrorTool {
  const next: ClaudeMirrorTool = { ...tool };

  switch (next.state) {
    case "approval-requested":
      delete next.output;
      delete next.errorText;
      next.approval = {
        ...(typeof next.approval?.decision === "string"
          ? { decision: next.approval.decision }
          : {}),
        id: next.approval?.id ?? next.id,
        ...(typeof next.approval?.reason === "string"
          ? { reason: next.approval.reason }
          : {}),
        ...(typeof next.approval?.response === "string"
          ? { response: next.approval.response }
          : {}),
      };
      return next;
    case "approval-responded":
      delete next.output;
      delete next.errorText;
      next.approval = {
        ...(typeof next.approval?.approved === "boolean"
          ? { approved: next.approval.approved }
          : {}),
        ...(typeof next.approval?.decision === "string"
          ? { decision: next.approval.decision }
          : {}),
        id: next.approval?.id ?? next.id,
        ...(typeof next.approval?.reason === "string"
          ? { reason: next.approval.reason }
          : {}),
        ...(typeof next.approval?.response === "string"
          ? { response: next.approval.response }
          : {}),
      };
      return next;
    case "input-available":
    case "input-streaming":
      delete next.output;
      delete next.errorText;
      delete next.approval;
      return next;
    case "output-available":
      delete next.errorText;
      delete next.approval;
      return next;
    case "output-error":
      delete next.output;
      delete next.approval;
      return next;
    case "output-denied":
      delete next.output;
      delete next.errorText;
      next.approval = {
        approved: false,
        ...(typeof next.approval?.decision === "string"
          ? { decision: next.approval.decision }
          : {}),
        id: next.approval?.id ?? next.id,
        ...(typeof next.approval?.reason === "string"
          ? { reason: next.approval.reason }
          : {}),
        ...(typeof next.approval?.response === "string"
          ? { response: next.approval.response }
          : {}),
      };
      return next;
  }
}

type ClaudeMirrorState = {
  assistantId: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  text: string;
  textOrder: number;
  reasoningText: string;
  threadId: string;
  tools: Map<string, ClaudeMirrorTool>;
  nextOrder: number;
  usage: {
    contextWindow?: number;
    inputTokens?: number;
    maxOutputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
};

type ClaudeInputQueue<T> = {
  close(): void;
  enqueue(value: T): void;
  stream: AsyncIterable<T>;
};

type ActiveClaudeRunControl = {
  abortController: AbortController;
  assistantId: string;
  eventChannel: ThreadEventChannel;
  exitPlanModeSwitched: boolean;
  inputQueue: ClaudeInputQueue<SDKUserMessage>;
  pendingResponseWatchers: Set<string>;
  pendingApprovals: Map<
    string,
    {
      input: Record<string, unknown>;
      resolve: (result: PermissionResult) => void;
      toolCallId: string;
    }
  >;
  pendingQuestions: Map<
    string,
    {
      input?: Record<string, unknown>;
      resolve?: (result: PermissionResult) => void;
      toolCallId: string;
    }
  >;
  query: ClaudeQuery;
  runId: string;
  sessionId: string;
  state: ClaudeMirrorState;
  threadId: string;
  userId: string;
  workspaceId: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveClaudeRunControls:
    | Map<string, ActiveClaudeRunControl>
    | undefined;
}

const activeClaudeRunControls =
  globalThis.__sentinelActiveClaudeRunControls ??
  (globalThis.__sentinelActiveClaudeRunControls = new Map<
    string,
    ActiveClaudeRunControl
  >());

function findActiveClaudeRunForThread(threadId: string) {
  for (const control of activeClaudeRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
  }

  return null;
}

function resolveActiveClaudeRunControl(input: {
  activeRunId?: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    return activeClaudeRunControls.get(input.activeRunId) ?? null;
  }

  return findActiveClaudeRunForThread(input.threadId);
}

function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function waitForDelay(ms: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForPersistedClaudePromptResponse(input: {
  approvalId: string;
  signal: AbortSignal;
  threadId: string;
}) {
  while (!input.signal.aborted) {
    const transcript = buildActiveThreadMessages(
      await persist.loadThreadMessages(input.threadId),
    );
    const response = extractClaudePromptResponseById(
      transcript,
      input.approvalId,
    );
    if (response) {
      return response;
    }

    await waitForDelay(250, input.signal);
  }

  return null;
}

async function createThreadEventChannel(runId: string) {
  let controller: ReadableStreamDefaultController<string> | null = null;

  await streamContext.createNewResumableStream(
    runId,
    () =>
      new ReadableStream<string>({
        start(nextController) {
          controller = nextController;
        },
      }),
  );

  return {
    close() {
      controller?.close();
      controller = null;
    },
    emit(event: ThreadStreamEvent) {
      controller?.enqueue(serializeThreadStreamEvent(event));
    },
  };
}

function buildAssistantPlaceholder(input: {
  assistantId: string;
  parentMessageId: string | null;
  requestedModelId: string | null;
  runId: string;
}) {
  return {
    id: input.assistantId,
    metadata: {
      branchId: input.parentMessageId ?? input.assistantId,
      isActive: true,
      model: {
        requestedModelId: input.requestedModelId ?? undefined,
      },
      parentMessageId: input.parentMessageId,
      runId: input.runId,
      status: "pending" as const,
    },
    parts: [{ text: " ", type: "text" as const }],
    role: "assistant" as const,
  } satisfies ThreadUIMessage;
}

function buildUserMessage(
  request: ThreadChatRequest,
  parentMessageId: string | null,
  runId: string,
) {
  if (!request.message) {
    return null;
  }

  return {
    ...request.message,
    metadata: mergeThreadMessageMetadata(request.message.metadata, {
      branchId: request.message.id,
      ...(request.trigger === "edit-user-message" && request.messageId
        ? { editedFromMessageId: request.messageId }
        : {}),
      isActive: true,
      parentMessageId,
      runId,
      status: "completed",
    }),
  } satisfies ThreadUIMessage;
}

function createClaudeMirrorState(input: {
  assistantId: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  threadId: string;
}): ClaudeMirrorState {
  return {
    assistantId: input.assistantId,
    nextOrder: 0,
    reasoningText: "",
    requestedModelId: input.requestedModelId,
    responseModelId: input.responseModelId,
    sessionId: input.sessionId,
    text: "",
    textOrder: -1,
    threadId: input.threadId,
    tools: new Map(),
    usage: null,
  };
}

function getNextOrder(state: ClaudeMirrorState) {
  const order = state.nextOrder;
  state.nextOrder += 1;
  return order;
}

function getToolOrder(state: ClaudeMirrorState, toolId: string) {
  const existing = state.tools.get(toolId);
  if (existing) {
    return existing.order;
  }

  return getNextOrder(state);
}

function normalizeClaudeToolName(toolName: string) {
  return `claude_${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

function isClaudeSdkUserInputTool(toolName: string) {
  return (
    toolName.replace(/[^a-z0-9]+/gi, "").toLowerCase() === "askuserquestion"
  );
}

function normalizeClaudeSdkToolName(toolName: string) {
  return isClaudeSdkUserInputTool(toolName)
    ? "claude_user_input"
    : normalizeClaudeToolName(toolName);
}

function extractTextContent(block: Record<string, unknown>) {
  if (typeof block.text === "string") {
    return block.text;
  }

  if (typeof block.thinking === "string") {
    return block.thinking;
  }

  if (Array.isArray(block.content)) {
    return block.content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }

        const candidate = entry as Record<string, unknown>;
        return typeof candidate.text === "string" ? candidate.text : "";
      })
      .join("");
  }

  return "";
}

function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url);
  if (!match) {
    return null;
  }

  const mediaType = match[1] ?? "application/octet-stream";
  const payload = match[2] ?? "";

  return {
    data: payload,
    isBase64: /;base64,/i.test(url),
    mediaType,
  };
}

function buildClaudeUserPrompt(
  message: ThreadUIMessage,
  sessionId: string,
  options?: { promptPrefix?: string | null },
): SDKUserMessage {
  const textParts = message.parts.filter(
    (
      part,
    ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
      part.type === "text",
  );
  const fileParts = message.parts.filter(
    (
      part,
    ): part is Extract<ThreadUIMessage["parts"][number], { type: "file" }> =>
      part.type === "file",
  );

  const content: Array<Record<string, unknown>> = [];
  let text = textParts
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const composerContext = message.metadata?.composerContext;
  if (
    composerContext &&
    ((composerContext.paths?.length ?? 0) > 0 ||
      (composerContext.skills?.length ?? 0) > 0)
  ) {
    const prefix = serializeComposerContextToText(composerContext);
    if (prefix) {
      text = text ? `${prefix}\n\n${text}` : prefix;
    }
  }

  if (options?.promptPrefix?.trim()) {
    text = text ? `${options.promptPrefix}\n\n${text}` : options.promptPrefix;
  }

  if (text) {
    content.push({ text, type: "text" });
  }

  for (const part of fileParts) {
    if (!part.mediaType.startsWith("image/")) {
      content.push({
        text: `Attached file omitted from Claude runtime v1: ${part.filename ?? part.mediaType}`,
        type: "text",
      });
      continue;
    }

    const parsed = parseDataUrl(part.url);
    if (!parsed?.isBase64) {
      content.push({
        text: `Attached image could not be encoded for Claude: ${part.filename ?? part.mediaType}`,
        type: "text",
      });
      continue;
    }

    content.push({
      source: {
        data: parsed.data,
        media_type: parsed.mediaType,
        type: "base64",
      },
      type: "image",
    });
  }

  return {
    message: {
      content:
        content.length > 0 ? content : [{ text: "Continue.", type: "text" }],
      role: "user",
    },
    parent_tool_use_id: null,
    session_id: sessionId,
    type: "user",
  };
}

function createClaudeInputQueue<T>(): ClaudeInputQueue<T> {
  const pending: T[] = [];
  const waiters: Array<(value: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    close() {
      if (closed) {
        return;
      }

      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.({ done: true, value: undefined });
      }
    },
    enqueue(value) {
      if (closed) {
        return;
      }

      if (waiters.length > 0) {
        waiters.shift()?.({ done: false, value });
        return;
      }

      pending.push(value);
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (pending.length > 0) {
              return Promise.resolve({
                done: false,
                value: pending.shift()!,
              });
            }

            if (closed) {
              return Promise.resolve({
                done: true,
                value: undefined,
              });
            }

            return new Promise<IteratorResult<T>>((resolve) => {
              waiters.push(resolve);
            });
          },
          return() {
            closed = true;
            while (waiters.length > 0) {
              waiters.shift()?.({ done: true, value: undefined });
            }
            return Promise.resolve({
              done: true,
              value: undefined,
            });
          },
        };
      },
    },
  };
}

function buildClaudeQuestionResponse(input: {
  approvalId: string;
  response: string;
  sessionId: string;
}) {
  return {
    message: {
      content: input.response,
      role: "user",
    },
    parent_tool_use_id: input.approvalId,
    session_id: input.sessionId,
    tool_use_result: {
      action: "accept",
      answers: {
        response: input.response,
      },
    },
    type: "user",
  } satisfies SDKUserMessage;
}

function buildClaudePermissionMode(
  threadMode: "chat" | "plan",
  permissionMode: "default" | "full",
): ClaudePermissionMode {
  if (threadMode === "plan") {
    return "plan";
  }

  return permissionMode === "full" ? "bypassPermissions" : "default";
}

async function buildClaudeRuntimeOptions(input: {
  cwd: string;
  permissionMode: "default" | "full";
  requestedModelId: string | null;
  sessionId: string;
  threadMode: "chat" | "plan";
  workspaceRoot: string | null;
}) {
  const claudePermissionMode = buildClaudePermissionMode(
    input.threadMode,
    input.permissionMode,
  );
  const runtime = await resolveClaudeCodeRuntime();

  return {
    options: buildClaudeSdkBaseOptions({
      ...(input.requestedModelId ? { model: input.requestedModelId } : {}),
      ...(claudePermissionMode === "bypassPermissions"
        ? {
            allowDangerouslySkipPermissions: true,
            permissionMode: claudePermissionMode,
          }
        : { permissionMode: claudePermissionMode }),
      cwd: input.cwd,
      env: runtime.env,
      ...(runtime.executablePath
        ? { pathToClaudeCodeExecutable: runtime.executablePath }
        : {}),
      sandbox:
        input.permissionMode === "full"
          ? undefined
          : {
              allowUnsandboxedCommands: false,
              autoAllowBashIfSandboxed: true,
              enabled: true,
              filesystem: {
                allowWrite: input.workspaceRoot ? [input.workspaceRoot] : [],
              },
            },
      toolConfig: {
        askUserQuestion: { previewFormat: "markdown" },
      },
    }),
    permissionMode: claudePermissionMode,
  };
}

function upsertClaudeTool(
  state: ClaudeMirrorState,
  input: {
    approval?: ClaudeMirrorTool["approval"];
    errorText?: string;
    id: string;
    input?: unknown;
    name: string;
    output?: unknown;
    state: ClaudeMirrorToolState;
  },
) {
  const order = getToolOrder(state, input.id);
  const existing = state.tools.get(input.id);

  state.tools.set(input.id, {
    ...sanitizeClaudeMirrorTool({
      approval: input.approval ?? existing?.approval,
      errorText: input.errorText ?? existing?.errorText,
      id: input.id,
      input: input.input ?? existing?.input,
      name: input.name,
      order,
      output: input.output ?? existing?.output,
      state: input.state,
    }),
  });
}

function buildAssistantParts(state: ClaudeMirrorState) {
  const parts: ThreadUIMessage["parts"] = [];

  if (state.reasoningText.trim()) {
    parts.push({
      text: state.reasoningText.trim(),
      type: "reasoning",
    });
  }

  const hasText = state.text.trim().length > 0;
  const orderedTools = [...state.tools.values()].sort(
    (left, right) => left.order - right.order,
  );

  type OrderedItem =
    | { kind: "text"; order: number }
    | { kind: "tool"; order: number; tool: ClaudeMirrorTool };

  const items: OrderedItem[] = orderedTools.map((tool) => ({
    kind: "tool" as const,
    order: tool.order,
    tool,
  }));

  if (hasText) {
    items.push({ kind: "text", order: state.textOrder });
  }

  items.sort((a, b) => a.order - b.order);

  for (const item of items) {
    if (item.kind === "text") {
      parts.push({
        text: state.text.trim(),
        type: "text",
      });
    } else {
      parts.push({
        ...(item.tool.approval ? { approval: item.tool.approval } : {}),
        ...(item.tool.errorText ? { errorText: item.tool.errorText } : {}),
        ...(item.tool.input === undefined ? {} : { input: item.tool.input }),
        ...(item.tool.output === undefined ? {} : { output: item.tool.output }),
        state: item.tool.state,
        toolCallId: item.tool.id,
        toolName: item.tool.name,
        type: "dynamic-tool",
      } as ThreadUIMessage["parts"][number]);
    }
  }

  return parts.length > 0 ? parts : [{ text: " ", type: "text" as const }];
}

function updateClaudeUsageFromResult(
  state: ClaudeMirrorState,
  result: SDKResultMessage,
) {
  if (result.type !== "result") {
    return;
  }

  const modelUsageEntries = Object.values(result.modelUsage ?? {});
  const primaryModelUsage =
    modelUsageEntries.find(
      (entry) =>
        typeof entry.contextWindow === "number" ||
        typeof entry.maxOutputTokens === "number",
    ) ?? modelUsageEntries[0];

  state.usage = {
    ...(typeof primaryModelUsage?.contextWindow === "number"
      ? { contextWindow: primaryModelUsage.contextWindow }
      : {}),
    inputTokens: result.usage.input_tokens,
    ...(typeof primaryModelUsage?.maxOutputTokens === "number"
      ? { maxOutputTokens: primaryModelUsage.maxOutputTokens }
      : {}),
    outputTokens: result.usage.output_tokens,
    totalTokens: result.usage.input_tokens + result.usage.output_tokens,
  };
}

async function emitAssistantMessageUpdate(
  state: ClaudeMirrorState,
  runId: string,
  status: "pending" | "streaming" | "completed" | "error" | "cancelled",
  finishReason?: string | null,
  errorMessage?: string | null,
  options?: { repoCheckpointId?: string | null },
) {
  persist.upsertMessage(state.threadId, {
    id: state.assistantId,
    metadata: {
      branchId: state.assistantId,
      errorMessage: errorMessage ?? undefined,
      ...(finishReason ? { finishReason } : {}),
      isActive: true,
      model: {
        requestedModelId: state.requestedModelId ?? undefined,
        responseModelId: state.responseModelId ?? undefined,
      },
      ...(options?.repoCheckpointId
        ? { repoCheckpointId: options.repoCheckpointId }
        : {}),
      runId,
      status,
      usage: state.usage ?? undefined,
    },
    parts: buildAssistantParts(state),
    role: "assistant",
  } satisfies ThreadUIMessage);
  await persist.setActiveMessage(state.threadId, state.assistantId);
}

async function emitThreadSnapshot(
  threadId: string,
  eventChannel: ThreadEventChannel,
) {
  const snapshot = await loadThreadSessionSnapshot(threadId);
  if (snapshot) {
    eventChannel.emit({
      snapshot,
      type: "thread.snapshot",
    });
  }
}

async function drainQueuedClaudeFollowUp(
  request: Pick<ThreadChatRequest, "threadId" | "userId" | "workspaceId">,
) {
  const thread = await persist.loadThread(request.threadId);

  if (!thread) {
    return;
  }

  if (thread.activeStreamId || thread.status === "streaming") {
    return;
  }

  if (thread.status === "awaiting_approval") {
    return;
  }

  persist.resetProcessingThreadFollowUps(request.threadId);
  const nextFollowUp = persist.claimNextThreadFollowUp(request.threadId);

  if (!nextFollowUp) {
    return;
  }

  try {
    await runClaudeThreadChat(
      {
        message: {
          id: nextFollowUp.id,
          metadata: {},
          parts: nextFollowUp.parts,
          role: "user",
        },
        modelId: nextFollowUp.modelId,
        ...(nextFollowUp.reasoningEffort
          ? { reasoningEffort: nextFollowUp.reasoningEffort }
          : {}),
        threadId: request.threadId,
        threadMode: nextFollowUp.threadMode,
        trigger: "submit-user-message",
        userId: request.userId,
        workspaceId: request.workspaceId,
      },
      thread,
    );
    persist.deleteThreadFollowUp(request.threadId, nextFollowUp.id);
  } catch (error) {
    persist.requeueThreadFollowUp(request.threadId, nextFollowUp.id);
    throw error;
  }
}

async function applyClaudePromptResponse(
  control: ActiveClaudeRunControl,
  response: ClaudePromptResponse,
) {
  if (response.kind === "user-input") {
    const pendingQuestion = control.pendingQuestions.get(response.approvalId);
    if (!pendingQuestion) {
      return false;
    }

    control.pendingQuestions.delete(response.approvalId);
    control.pendingResponseWatchers.delete(response.approvalId);

    const existingQuestion = control.state.tools.get(response.approvalId);
    if (existingQuestion) {
      upsertClaudeTool(control.state, {
        id: response.approvalId,
        input: existingQuestion.input,
        name: existingQuestion.name,
        state: "input-available",
      });
    }

    control.inputQueue.enqueue(
      buildClaudeQuestionResponse({
        approvalId: response.approvalId,
        response: response.response,
        sessionId: control.sessionId,
      }),
    );
    pendingQuestion.resolve?.({
      behavior: "allow",
      updatedInput: normalizeClaudePermissionInput(pendingQuestion.input),
    });
  } else {
    const pendingApproval = control.pendingApprovals.get(response.approvalId);
    if (!pendingApproval) {
      return false;
    }

    control.pendingApprovals.delete(response.approvalId);
    control.pendingResponseWatchers.delete(response.approvalId);

    const existingTool = control.state.tools.get(response.approvalId);
    const resolvedToolInput = resolveClaudePermissionInput({
      pendingInput:
        "input" in pendingApproval ? pendingApproval.input : undefined,
      persistedToolInput: existingTool?.input,
    });
    if (existingTool) {
      upsertClaudeTool(control.state, {
        approval:
          response.approved === false
            ? {
                approved: false,
                ...(response.decision ? { decision: response.decision } : {}),
                id: response.approvalId,
                ...(response.reason ? { reason: response.reason } : {}),
                ...(response.response ? { response: response.response } : {}),
              }
            : undefined,
        id: response.approvalId,
        input: existingTool.input,
        name: existingTool.name,
        state:
          response.approved === false ? "output-denied" : "input-available",
      });
    }

    pendingApproval.resolve(
      buildClaudePermissionResult({
        approved: response.approved !== false,
        message: response.response ?? response.reason,
        toolInput: resolvedToolInput,
      }),
    );
  }

  await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
  persist.setThreadStatus(control.threadId, "streaming");
  await emitThreadSnapshot(control.threadId, control.eventChannel);
  return true;
}

function ensurePersistedClaudePromptResponseWatcher(
  control: ActiveClaudeRunControl,
  approvalId: string,
) {
  if (control.pendingResponseWatchers.has(approvalId)) {
    return;
  }

  control.pendingResponseWatchers.add(approvalId);

  void waitForPersistedClaudePromptResponse({
    approvalId,
    signal: control.abortController.signal,
    threadId: control.threadId,
  })
    .then(async (response) => {
      if (!response) {
        return;
      }

      await applyClaudePromptResponse(control, response);
    })
    .catch((error) => {
      if (!isAbortError(error)) {
        log.warn("claude_persisted_prompt_response_watch_failed", {
          approvalId,
          error,
          threadId: control.threadId,
        });
      }
    })
    .finally(() => {
      control.pendingResponseWatchers.delete(approvalId);
    });
}

function isToolUseBlock(block: unknown): block is {
  id: string;
  input: unknown;
  name: string;
  type: "mcp_tool_use" | "server_tool_use" | "tool_use";
} {
  if (!block || typeof block !== "object") {
    return false;
  }

  const candidate = block as Record<string, unknown>;
  return (
    (candidate.type === "tool_use" ||
      candidate.type === "server_tool_use" ||
      candidate.type === "mcp_tool_use") &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string"
  );
}

function updateClaudeMirrorFromAssistantMessage(
  state: ClaudeMirrorState,
  message: SDKAssistantMessage,
  control: ActiveClaudeRunControl,
) {
  state.responseModelId = message.message.model ?? state.responseModelId;

  for (const block of message.message.content as unknown[]) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const candidate = block as Record<string, unknown>;
    if (candidate.type === "text") {
      state.text = extractTextContent(candidate);
      state.textOrder = getNextOrder(state);
      continue;
    }

    const toolResult = extractClaudeAssistantToolResultBlock(candidate);
    if (toolResult) {
      const existing = state.tools.get(toolResult.toolCallId);

      upsertClaudeTool(state, {
        ...(toolResult.errorText ? { errorText: toolResult.errorText } : {}),
        id: toolResult.toolCallId,
        name: existing?.name ?? toolResult.toolName,
        output: toolResult.output,
        state: toolResult.state,
      });
      continue;
    }

    if (
      candidate.type === "thinking" ||
      candidate.type === "redacted_thinking"
    ) {
      state.reasoningText = extractTextContent(candidate);
      continue;
    }

    if (!isToolUseBlock(candidate)) {
      continue;
    }

    const toolName = normalizeClaudeSdkToolName(candidate.name);

    upsertClaudeTool(state, {
      approval:
        toolName === "claude_user_input" ? { id: candidate.id } : undefined,
      id: candidate.id,
      input: candidate.input,
      name: toolName,
      state:
        toolName === "claude_user_input"
          ? "approval-requested"
          : control.pendingApprovals.has(candidate.id)
            ? "approval-requested"
            : "input-available",
    });

    if (toolName === "claude_user_input") {
      control.pendingQuestions.set(candidate.id, {
        ...(control.pendingQuestions.get(candidate.id) ?? {}),
        toolCallId: candidate.id,
      });
      ensurePersistedClaudePromptResponseWatcher(control, candidate.id);
    }
  }
}

function updateClaudeMirrorFromToolProgress(
  state: ClaudeMirrorState,
  message: SDKToolProgressMessage,
) {
  const existing = state.tools.get(message.tool_use_id);
  upsertClaudeTool(state, {
    id: message.tool_use_id,
    input: existing?.input,
    name: existing?.name ?? normalizeClaudeSdkToolName(message.tool_name),
    output:
      existing?.output === undefined
        ? {
            elapsedTimeSeconds: message.elapsed_time_seconds,
          }
        : {
            ...(typeof existing.output === "object" && existing.output
              ? (existing.output as Record<string, unknown>)
              : {}),
            elapsedTimeSeconds: message.elapsed_time_seconds,
          },
    state:
      existing?.state === "approval-requested"
        ? "approval-requested"
        : existing?.state === "output-available" ||
            existing?.state === "output-error" ||
            existing?.state === "output-denied"
          ? existing.state
          : "input-streaming",
  });
}

function updateClaudeMirrorFromToolResult(
  state: ClaudeMirrorState,
  message: SDKUserMessage,
) {
  const results = extractClaudeUserToolResults(message);
  if (results.length === 0) {
    return;
  }

  for (const result of results) {
    const existing = state.tools.get(result.toolCallId);

    upsertClaudeTool(state, {
      ...(result.errorText ? { errorText: result.errorText } : {}),
      id: result.toolCallId,
      name: existing?.name ?? result.toolName,
      output: result.output,
      state: result.state,
    });
  }
}

function handleExitPlanModeTransition(control: ActiveClaudeRunControl) {
  if (control.exitPlanModeSwitched) return;

  for (const tool of control.state.tools.values()) {
    if (
      tool.name === "claude_exitplanmode" &&
      tool.state === "output-available"
    ) {
      control.exitPlanModeSwitched = true;
      persist.updateThreadChatSettings(control.threadId, { mode: "chat" });
      return;
    }
  }
}

async function finishClaudeRun(
  control: ActiveClaudeRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "completed" | "error" | "cancelled";
    threadStatus: "idle" | "streaming" | "awaiting_approval";
  },
) {
  for (const [id, tool] of control.state.tools) {
    if (
      tool.state === "approval-requested" ||
      tool.state === "approval-responded" ||
      tool.state === "input-available" ||
      tool.state === "input-streaming"
    ) {
      control.state.tools.set(id, {
        ...tool,
        state:
          input.status === "cancelled" ? "output-denied" : "output-available",
      });
    }
  }

  for (const [id, pending] of control.pendingApprovals) {
    pending.resolve({
      behavior: "deny",
      message: "Session ended before approval was received.",
    });
    control.pendingApprovals.delete(id);
  }

  for (const [id, pending] of control.pendingQuestions) {
    pending.resolve?.({
      behavior: "deny",
      message: "Session ended before input was received.",
    });
    control.pendingQuestions.delete(id);
  }

  const repoCheckpointId =
    input.status === "completed" && input.threadStatus === "idle"
      ? await finalizeThreadRepoCheckpointRun({
          assistantMessageId: control.assistantId,
          runId: control.runId,
          threadId: control.threadId,
        })
      : (await clearThreadRepoCheckpointRun(control.runId), null);

  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, input.threadStatus);

  await emitAssistantMessageUpdate(
    control.state,
    control.runId,
    input.status === "cancelled" ? "cancelled" : input.status,
    input.finishReason,
    input.errorMessage,
    { repoCheckpointId },
  );
  await emitThreadSnapshot(control.threadId, control.eventChannel);
  if (input.status === "cancelled") {
    control.eventChannel.emit({
      messageId: control.assistantId,
      runId: control.runId,
      threadStatus: input.threadStatus,
      type: "run.cancelled",
    });
  } else if (input.status === "error") {
    control.eventChannel.emit({
      error: input.errorMessage ?? "Claude run failed.",
      runId: control.runId,
      threadStatus: input.threadStatus,
      type: "run.failed",
    });
  } else {
    control.eventChannel.emit({
      runId: control.runId,
      threadStatus: input.threadStatus,
      type: "run.finished",
    });
  }
  control.eventChannel.close();
  control.inputQueue.close();
  control.query.close();
  activeClaudeRunControls.delete(control.runId);

  if (input.threadStatus === "idle" && input.status !== "error") {
    try {
      await drainQueuedClaudeFollowUp({
        threadId: control.threadId,
        userId: control.userId,
        workspaceId: control.workspaceId,
      });
    } catch (error) {
      log.error("claude_follow_up_drain_failed", {
        error,
        threadId: control.threadId,
      });
    }
  }
}

async function consumeClaudeQuery(control: ActiveClaudeRunControl) {
  try {
    for await (const message of control.query) {
      switch (message.type) {
        case "assistant":
          updateClaudeMirrorFromAssistantMessage(
            control.state,
            message,
            control,
          );
          await emitAssistantMessageUpdate(
            control.state,
            control.runId,
            "streaming",
          );
          await emitThreadSnapshot(control.threadId, control.eventChannel);
          break;
        case "tool_progress":
          updateClaudeMirrorFromToolProgress(control.state, message);
          await emitAssistantMessageUpdate(
            control.state,
            control.runId,
            "streaming",
          );
          await emitThreadSnapshot(control.threadId, control.eventChannel);
          break;
        case "user":
          updateClaudeMirrorFromToolResult(control.state, message);
          handleExitPlanModeTransition(control);
          if (
            message.isSynthetic ||
            message.tool_use_result !== undefined ||
            message.parent_tool_use_id
          ) {
            await emitAssistantMessageUpdate(
              control.state,
              control.runId,
              "streaming",
            );
            await emitThreadSnapshot(control.threadId, control.eventChannel);
          }
          break;
        case "system":
          if (message.subtype === "session_state_changed") {
            if (message.state === "requires_action") {
              persist.setThreadStatus(control.threadId, "awaiting_approval");
              await emitThreadSnapshot(control.threadId, control.eventChannel);
            }
          }
          break;
        case "result":
          updateClaudeUsageFromResult(control.state, message);
          if (
            !control.state.text.trim() &&
            message.subtype === "success" &&
            message.result.trim()
          ) {
            control.state.text = message.result.trim();
            control.state.textOrder = getNextOrder(control.state);
          }

          await finishClaudeRun(control, {
            errorMessage:
              message.subtype === "success"
                ? null
                : (message.errors ?? []).join("\n") || "Claude run failed.",
            finishReason: message.stop_reason,
            status: message.subtype === "success" ? "completed" : "error",
            threadStatus: "idle",
          });
          return;
      }
    }
  } catch (error) {
    log.error("claude_run_failed", { error, threadId: control.threadId });
    await finishClaudeRun(control, {
      errorMessage:
        error instanceof Error ? error.message : "Claude run failed.",
      finishReason: null,
      status: "error",
      threadStatus: "idle",
    });
  }
}

export async function stopClaudeThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const claudeState = getClaudeThreadState(existingThread?.chatEngineState);
  const activeRunId = existingThread?.activeStreamId ?? null;
  const control = resolveActiveClaudeRunControl({
    activeRunId,
    threadId: request.threadId,
  });

  if (request.messageId) {
    await persist.updateMessageMetadata(request.threadId, request.messageId, {
      errorMessage: "Generation stopped.",
      status: "cancelled",
      statusLabel: null,
    });
  }

  if (!control) {
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    if (claudeState) {
      persist.updateClaudeThreadState(request.threadId, claudeState);
    }

    try {
      await drainQueuedClaudeFollowUp(request);
    } catch (error) {
      log.error("claude_follow_up_drain_failed", {
        error,
        threadId: request.threadId,
      });
    }

    return new Response(null, { status: 204 });
  }

  try {
    await control.query.interrupt();
  } catch (error) {
    log.warn("claude_interrupt_failed", { error, threadId: request.threadId });
  }

  control.abortController.abort(new Error("Generation stopped."));
  await finishClaudeRun(control, {
    errorMessage: "Generation stopped.",
    finishReason: null,
    status: "cancelled",
    threadStatus: "idle",
  });

  return new Response(null, { status: 204 });
}

export async function runClaudeThreadChat(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  if (request.trigger === "submit-tool-approval") {
    const latestAssistant = request.messages
      ? [...request.messages]
          .reverse()
          .find((message) => message.role === "assistant")
      : null;
    if (latestAssistant) {
      persist.upsertMessage(request.threadId, latestAssistant);
    }

    const activeControl = resolveActiveClaudeRunControl({
      activeRunId: existingThread?.activeStreamId ?? null,
      threadId: request.threadId,
    });
    const pendingKind = request.toolApprovalResponse
      ? activeControl?.pendingQuestions.has(request.toolApprovalResponse.id)
        ? "user-input"
        : activeControl?.pendingApprovals.has(request.toolApprovalResponse.id)
          ? "approval"
          : undefined
      : undefined;
    const response = resolveClaudePromptResponse({
      messages: request.messages,
      pendingKind,
      toolApprovalResponse: request.toolApprovalResponse,
    });
    if (!response) {
      throw new Error("Unable to resolve the Claude prompt response.");
    }

    if (!activeControl) {
      if (
        existingThread?.activeStreamId ||
        existingThread?.status === "awaiting_approval"
      ) {
        persist.clearActiveStream(request.threadId);
        persist.setThreadStatus(request.threadId, "idle");
      }

      throw new ThreadChatConflictError(
        "That Claude approval request is no longer active.",
      );
    }

    const applied = await applyClaudePromptResponse(activeControl, response);
    if (!applied) {
      throw new ThreadChatConflictError(
        "That Claude approval request is no longer active.",
      );
    }

    return new Response(null, { status: 204 });
  }

  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The Claude engine does not support "${request.trigger}" yet.`,
    );
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const checkpointAnchorMessageId =
    getThreadCheckpointAnchorMessageId(existingThread);
  const transcript = truncateTranscriptAtMessage(
    buildActiveThreadMessages(allRecords),
    checkpointAnchorMessageId,
  );
  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const userParentMessageId = getUserParentMessageId(
    request,
    transcript,
    allRecords,
  );
  const assistantParentMessageId = request.message?.id ?? userParentMessageId;
  const fallbackTitle =
    getFirstUserText(request.message ? [request.message] : [])?.slice(0, 100) ??
    "New thread";

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    "claude",
    request.draftRepoState ? { repo: request.draftRepoState } : null,
  );

  const workspaceRoot = await getWorkspaceRootPath(
    request.workspaceId,
    request.userId,
    request.threadId,
  );
  const workspacePermissionMode = await getToolPermissionMode(
    request.userId,
    request.workspaceId,
  );
  const existingClaudeState = getClaudeThreadState(
    existingThread?.chatEngineState,
  );
  const didThreadModeChange =
    existingThread?.mode != null &&
    normalizeThreadMode(existingThread.mode) !== threadMode;
  const shouldResumeExistingSession =
    Boolean(existingClaudeState?.sessionId) && !didThreadModeChange;
  const sessionId = shouldResumeExistingSession
    ? existingClaudeState!.sessionId
    : crypto.randomUUID();
  const cwd = workspaceRoot ?? existingClaudeState?.cwd ?? process.cwd();
  const planModePromptPrefix =
    threadMode === "plan" && !shouldResumeExistingSession
      ? buildPlanModePromptPreamble(
          "Plan Mode is active for this fresh Claude session. Follow the full contract below for the first response and continue honoring it until the mode changes.",
        )
      : null;
  const { options, permissionMode } = await buildClaudeRuntimeOptions({
    cwd,
    permissionMode: workspacePermissionMode,
    requestedModelId: request.modelId ?? existingClaudeState?.modelId ?? null,
    sessionId,
    threadMode,
    workspaceRoot,
  });

  const runId = generateId();
  const assistantId = crypto.randomUUID();
  const eventChannel = await createThreadEventChannel(runId);
  const abortController = new AbortController();
  const inputQueue = createClaudeInputQueue<SDKUserMessage>();
  const mirror = createClaudeMirrorState({
    assistantId,
    requestedModelId: request.modelId ?? existingClaudeState?.modelId ?? null,
    responseModelId: request.modelId ?? existingClaudeState?.modelId ?? null,
    sessionId,
    threadId: request.threadId,
  });

  try {
    const persistedUser = buildUserMessage(request, userParentMessageId, runId);
    if (persistedUser) {
      persist.upsertMessage(request.threadId, persistedUser);
      await persist.setActiveMessage(request.threadId, persistedUser.id);
      if (checkpointAnchorMessageId) {
        persist.updateThreadRepoState(request.threadId, {
          checkpointAnchorMessageId: null,
        });
      }
    }

    persist.upsertMessage(
      request.threadId,
      buildAssistantPlaceholder({
        assistantId,
        parentMessageId: assistantParentMessageId,
        requestedModelId:
          request.modelId ?? existingClaudeState?.modelId ?? null,
        runId,
      }),
    );
    await persist.setActiveMessage(request.threadId, assistantId);
    persist.setActiveStream(request.threadId, runId);
    persist.setThreadStatus(request.threadId, "streaming");
    await persist.updateThreadChatSettings(request.threadId, {
      engine: "claude",
      modelId: request.modelId ?? existingClaudeState?.modelId ?? null,
      mode: threadMode,
      reasoningEffort: request.reasoningEffort ?? null,
    });
    await beginThreadRepoCheckpointRun({
      projectPath: workspaceRoot,
      runId,
      thread: existingThread,
    });
    persist.updateClaudeThreadState(
      request.threadId,
      buildClaudeThreadState({
        cwd,
        modelId: request.modelId ?? existingClaudeState?.modelId ?? null,
        permissionMode,
        sessionId,
      }),
    );

    const pendingApprovals = new Map<
      string,
      {
        input: Record<string, unknown>;
        resolve: (result: PermissionResult) => void;
        toolCallId: string;
      }
    >();
    const pendingQuestions = new Map<
      string,
      {
        input?: Record<string, unknown>;
        resolve?: (result: PermissionResult) => void;
        toolCallId: string;
      }
    >();
    const pendingResponseWatchers = new Set<string>();
    let control: ActiveClaudeRunControl | null = null;
    const claudeQuery = query({
      prompt: inputQueue.stream,
      options: {
        ...options,
        abortController,
        ...(shouldResumeExistingSession
          ? { resume: existingClaudeState!.sessionId }
          : { sessionId }),
        canUseTool: async (toolName, input, permissionOptions) => {
          return await new Promise<PermissionResult>((resolve) => {
            const approvalId = permissionOptions.toolUseID;
            const normalizedToolName = normalizeClaudeSdkToolName(toolName);
            const normalizedInput = normalizeClaudePermissionInput(input);

            if (normalizedToolName === "claude_user_input") {
              pendingQuestions.set(approvalId, {
                input: normalizedInput,
                resolve,
                toolCallId: approvalId,
              });
            } else {
              pendingApprovals.set(approvalId, {
                input: normalizedInput,
                resolve,
                toolCallId: approvalId,
              });
            }

            upsertClaudeTool(mirror, {
              approval: {
                id: approvalId,
                ...(normalizedToolName === "claude_user_input"
                  ? {}
                  : { reason: permissionOptions.decisionReason }),
              },
              id: approvalId,
              input,
              name: normalizedToolName,
              state: "approval-requested",
            });

            persist.setThreadStatus(request.threadId, "awaiting_approval");
            void emitAssistantMessageUpdate(mirror, runId, "streaming");
            void emitThreadSnapshot(request.threadId, eventChannel);
            if (control) {
              ensurePersistedClaudePromptResponseWatcher(control, approvalId);
            }
          });
        },
      },
    });

    control = {
      abortController,
      assistantId,
      eventChannel,
      exitPlanModeSwitched: false,
      inputQueue,
      pendingResponseWatchers,
      pendingApprovals,
      pendingQuestions,
      query: claudeQuery,
      runId,
      sessionId,
      state: mirror,
      threadId: request.threadId,
      userId: request.userId,
      workspaceId: request.workspaceId,
    };

    activeClaudeRunControls.set(runId, control);
    for (const approvalId of pendingApprovals.keys()) {
      ensurePersistedClaudePromptResponseWatcher(control, approvalId);
    }
    for (const approvalId of pendingQuestions.keys()) {
      ensurePersistedClaudePromptResponseWatcher(control, approvalId);
    }
    inputQueue.enqueue(
      buildClaudeUserPrompt(request.message!, sessionId, {
        promptPrefix: planModePromptPrefix,
      }),
    );

    await emitThreadSnapshot(request.threadId, eventChannel);
    eventChannel.emit({ runId, type: "run.started" });
    void consumeClaudeQuery(control);

    return Response.json(
      {
        activeRunId: runId,
        snapshot: await loadThreadSessionSnapshot(request.threadId),
      },
      { status: 202 },
    );
  } catch (error) {
    await clearThreadRepoCheckpointRun(runId);
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    inputQueue.close();
    eventChannel.close();
    throw error;
  }
}
