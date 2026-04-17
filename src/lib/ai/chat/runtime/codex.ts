import "server-only";

import { generateId } from "ai";

import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import type {
  CodexServerEvent,
  CodexThreadItem,
  CodexTurn,
  CodexUserInputRequestEvent,
} from "@/lib/ai/chat/engines/codex-app-server";
import {
  getCodexThreadState,
  type CodexApprovalPolicy,
  type CodexSandboxMode,
  type CodexThreadState,
} from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import {
  buildDocumentModelText,
  loadInlineAttachmentDocument,
} from "@/lib/documents/loader";
import {
  safelyCloseReadableStreamController,
  safelyEnqueueReadableStreamController,
  streamContext,
} from "@/lib/streams";

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
  buildCodexBootstrapTitle,
  getCodexAssistantParentMessageId,
} from "./codex-helpers";
import {
  buildPlanModePromptPreamble,
  DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "./plan-mode-instructions";
import {
  extractCodexPromptResponse,
  getCodexEventThreadId,
  type CodexPromptResponse,
} from "./codex-event-helpers";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";
import { getToolPermissionMode, getWorkspaceRootPath } from "./workspace";

const log = createLogger("CodexThreadChat");

type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

type ActiveCodexRunControl = {
  assistantId: string;
  codexThreadId: string;
  codexTurnId: string | null;
  eventChannel: ThreadEventChannel;
  mirrorState: CodexMirrorState;
  runId: string;
  threadId: string;
  unsubscribe: () => void;
  userId: string;
  workspaceId: string;
};

type CodexMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type CodexMirrorItem =
  | {
      id: string;
      order: number;
      text: string;
      type: "agentMessage";
    }
  | {
      id: string;
      isCompleted: boolean;
      order: number;
      text: string;
      type: "plan";
    }
  | {
      content: string[];
      id: string;
      order: number;
      summary: string[];
      type: "reasoning";
    }
  | {
      approval?: {
        id: string;
        reason?: string | null;
      };
      command: string;
      commandActions: unknown[];
      cwd: string;
      durationMs: number | null;
      exitCode: number | null;
      id: string;
      order: number;
      output: string;
      processId: string | null;
      state: CodexMirrorToolState;
      status: string;
      type: "commandExecution";
    }
  | {
      approval?: {
        id: string;
        reason?: string | null;
      };
      changes: unknown[];
      id: string;
      order: number;
      output: string;
      state: CodexMirrorToolState;
      status: string;
      type: "fileChange";
    }
  | {
      action: unknown | null;
      id: string;
      isCompleted: boolean;
      order: number;
      query: string;
      type: "webSearch";
    }
  | {
      arguments: unknown;
      durationMs: number | null;
      error: unknown;
      id: string;
      order: number;
      result: unknown;
      server: string;
      status: string;
      tool: string;
      type: "mcpToolCall";
    }
  | {
      id: string;
      order: number;
      path: string;
      type: "imageView";
    }
  | {
      id: string;
      isCompleted: boolean;
      order: number;
      review: string;
      type: "enteredReviewMode" | "exitedReviewMode";
    }
  | {
      agentsStates: Record<string, unknown>;
      id: string;
      order: number;
      prompt: string | null;
      receiverThreadIds: string[];
      senderThreadId: string;
      status: string;
      tool: string;
      type: "collabAgentToolCall";
    }
  | {
      id: string;
      isCompleted: boolean;
      order: number;
      type: "contextCompaction";
    }
  | {
      id: string;
      isResolved: boolean;
      order: number;
      prompt: string;
      requestId: string;
      response: string | null;
      type: "userInputRequest";
    }
  | {
      content: Array<{
        path?: string;
        text?: string;
        type: string;
        url?: string;
      }>;
      id: string;
      order: number;
      type: "userMessage";
    };

type CodexPlanStep = {
  status: "completed" | "inProgress" | "pending";
  step: string;
};

type CodexMirrorState = {
  assistantId: string;
  codexThreadId: string;
  codexTurnId: string | null;
  items: Map<string, CodexMirrorItem>;
  nextOrder: number;
  planSteps: CodexPlanStep[] | null;
  requestedModelId: string | null;
  responseModelId: string | null;
  threadId: string;
  turnDiff: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  } | null;
};

const activeCodexRunControls = new Map<string, ActiveCodexRunControl>();
const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>";
const PROPOSED_PLAN_CLOSE_TAG = "</proposed_plan>";

type CodexAgentMessageSegment =
  | {
      text: string;
      type: "text";
    }
  | {
      blockIndex: number;
      isCompleted: boolean;
      text: string;
      type: "plan";
    };

function findActiveCodexRunForThread(
  threadId: string,
): ActiveCodexRunControl | null {
  for (const control of activeCodexRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
  }
  return null;
}

async function createThreadEventChannel(runId: string) {
  let controller: ReadableStreamDefaultController<string> | null = null;
  let closed = false;

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
      if (closed) {
        return;
      }

      closed = true;
      safelyCloseReadableStreamController(controller);
      controller = null;
    },
    emit(event: ThreadStreamEvent) {
      if (closed) {
        return;
      }

      const didEnqueue = safelyEnqueueReadableStreamController(
        controller,
        serializeThreadStreamEvent(event),
      );

      if (!didEnqueue) {
        closed = true;
        controller = null;
      }
    },
  };
}

function getCodexApprovalPolicy(permissionMode: "default" | "full") {
  return (
    permissionMode === "full" ? "never" : "on-request"
  ) satisfies CodexApprovalPolicy;
}

function getCodexSandboxMode(
  permissionMode: "default" | "full",
  workspaceRoot: string | null,
) {
  if (permissionMode === "full") {
    return "danger-full-access" satisfies CodexSandboxMode;
  }

  if (workspaceRoot) {
    return "workspace-write" satisfies CodexSandboxMode;
  }

  return "read-only" satisfies CodexSandboxMode;
}

function buildCodexSandboxPolicy(
  sandboxMode: CodexSandboxMode,
  workspaceRoot: string | null,
) {
  switch (sandboxMode) {
    case "danger-full-access":
      return { type: "dangerFullAccess" } as const;
    case "workspace-write":
      return {
        excludeSlashTmp: false,
        excludeTmpdirEnvVar: false,
        networkAccess: false,
        type: "workspaceWrite",
        writableRoots: workspaceRoot ? [workspaceRoot] : [],
      } as const;
    default:
      return { type: "readOnly" } as const;
  }
}

function buildCodexCollaborationMode(input: {
  interactionMode?: "default" | "plan";
  model?: string | null;
  effort?: string | null;
}):
  | {
      mode: "default" | "plan";
      settings: {
        model: string;
        reasoning_effort: string;
        developer_instructions: string;
      };
    }
  | undefined {
  if (input.interactionMode === undefined) {
    return undefined;
  }
  const model = input.model ?? "gpt-5.3-codex";
  return {
    mode: input.interactionMode,
    settings: {
      model,
      reasoning_effort: input.effort ?? "medium",
      developer_instructions:
        input.interactionMode === "plan"
          ? PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
}

function isUnsupportedCodexCollaborationModeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("turn/start.collaborationmode") &&
    message.includes("experimentalapi capability")
  );
}

function buildInitialCodexThreadState(input: {
  approvalPolicy: CodexApprovalPolicy;
  cliVersion: string | null | undefined;
  codexThreadId: string;
  cwd: string | null;
  modelId: string | null;
  modelProvider: string | null;
  pendingTurnId: string | null;
  reasoningEffort?: ThreadChatRequest["reasoningEffort"] | null;
  sandboxMode: CodexSandboxMode;
}): CodexThreadState {
  return {
    approvalPolicy: input.approvalPolicy,
    cliVersion: input.cliVersion ?? null,
    codexThreadId: input.codexThreadId,
    cwd: input.cwd ?? null,
    modelId: input.modelId ?? null,
    modelProvider: input.modelProvider ?? null,
    pendingTurnId: input.pendingTurnId ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    sandboxMode: input.sandboxMode,
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

function createCodexMirrorState(input: {
  assistantId: string;
  codexThreadId: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  threadId: string;
}): CodexMirrorState {
  return {
    assistantId: input.assistantId,
    codexThreadId: input.codexThreadId,
    codexTurnId: null,
    items: new Map<string, CodexMirrorItem>(),
    nextOrder: 0,
    planSteps: null,
    requestedModelId: input.requestedModelId,
    responseModelId: input.responseModelId,
    threadId: input.threadId,
    turnDiff: null,
    usage: null,
  };
}

function getItemOrder(state: CodexMirrorState, itemId: string) {
  const existing = state.items.get(itemId);
  if (existing) {
    return existing.order;
  }

  const next = state.nextOrder;
  state.nextOrder += 1;
  return next;
}

function mirrorToolStateFromStatus(status: string): CodexMirrorToolState {
  switch (status) {
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    case "declined":
      return "output-denied";
    default:
      return "input-available";
  }
}

function extractErrorText(data: Record<string, unknown>): string {
  if (typeof data.output === "string" && data.output.length > 0) {
    return data.output;
  }
  if (typeof data.error === "string" && data.error.length > 0) {
    return data.error;
  }
  if (typeof data.status === "string" && data.status !== "completed") {
    return `Tool execution ${data.status}`;
  }
  return "Tool execution failed";
}

function upsertMirrorItemFromCodexItem(
  state: CodexMirrorState,
  item: CodexThreadItem,
) {
  const order = getItemOrder(state, item.id);

  switch (item.type) {
    case "agentMessage":
      state.items.set(item.id, {
        id: item.id,
        order,
        text: item.text,
        type: "agentMessage",
      });
      return;
    case "plan":
      state.items.set(item.id, {
        id: item.id,
        isCompleted: true,
        order,
        text: item.text,
        type: "plan",
      });
      return;
    case "reasoning":
      state.items.set(item.id, {
        content: [...item.content],
        id: item.id,
        order,
        summary: Array.isArray(item.summary) ? [...item.summary] : [],
        type: "reasoning",
      });
      return;
    case "commandExecution":
      state.items.set(item.id, {
        command: item.command,
        commandActions: item.commandActions,
        cwd: item.cwd,
        durationMs: item.durationMs,
        exitCode: item.exitCode,
        id: item.id,
        order,
        output: item.aggregatedOutput ?? "",
        processId: item.processId,
        state: mirrorToolStateFromStatus(item.status),
        status: item.status,
        type: "commandExecution",
      });
      return;
    case "fileChange":
      state.items.set(item.id, {
        changes: item.changes,
        id: item.id,
        order,
        output: "",
        state: mirrorToolStateFromStatus(item.status),
        status: item.status,
        type: "fileChange",
      });
      return;
    case "webSearch":
      state.items.set(item.id, {
        action: item.action,
        id: item.id,
        isCompleted: true,
        order,
        query: item.query,
        type: "webSearch",
      });
      return;
    case "mcpToolCall":
      state.items.set(item.id, {
        arguments: item.arguments,
        durationMs: item.durationMs,
        error: item.error,
        id: item.id,
        order,
        result: item.result,
        server: item.server,
        status: item.status,
        tool: item.tool,
        type: "mcpToolCall",
      });
      return;
    case "imageView":
      state.items.set(item.id, {
        id: item.id,
        order,
        path: item.path,
        type: "imageView",
      });
      return;
    case "enteredReviewMode":
    case "exitedReviewMode":
      state.items.set(item.id, {
        id: item.id,
        isCompleted: true,
        order,
        review: item.review,
        type: item.type,
      });
      return;
    case "collabAgentToolCall":
      state.items.set(item.id, {
        agentsStates: item.agentsStates,
        id: item.id,
        order,
        prompt: item.prompt,
        receiverThreadIds: item.receiverThreadIds,
        senderThreadId: item.senderThreadId,
        status: item.status,
        tool: item.tool,
        type: "collabAgentToolCall",
      });
      return;
    case "contextCompaction":
      state.items.set(item.id, {
        id: item.id,
        isCompleted: true,
        order,
        type: "contextCompaction",
      });
      return;
    case "userMessage":
      state.items.set(item.id, {
        content: item.content,
        id: item.id,
        order,
        type: "userMessage",
      });
      return;
  }
}

function applyAgentDelta(
  state: CodexMirrorState,
  itemId: string,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "agentMessage") {
    existing.text += delta;
    return;
  }

  state.items.set(itemId, {
    id: itemId,
    order: getItemOrder(state, itemId),
    text: delta,
    type: "agentMessage",
  });
}

function applyPlanDelta(
  state: CodexMirrorState,
  itemId: string,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "plan") {
    existing.text += delta;
    existing.isCompleted = false;
    return;
  }

  state.items.set(itemId, {
    id: itemId,
    isCompleted: false,
    order: getItemOrder(state, itemId),
    text: delta,
    type: "plan",
  });
}

function applyReasoningDelta(
  state: CodexMirrorState,
  itemId: string,
  contentIndex: number,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "reasoning") {
    existing.content[contentIndex] =
      `${existing.content[contentIndex] ?? ""}${delta}`;
    return;
  }

  const content: string[] = [];
  content[contentIndex] = delta;
  state.items.set(itemId, {
    content,
    id: itemId,
    order: getItemOrder(state, itemId),
    summary: [],
    type: "reasoning",
  });
}

function applyReasoningSummaryDelta(
  state: CodexMirrorState,
  itemId: string,
  contentIndex: number,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "reasoning") {
    if (!existing.summary[contentIndex]) {
      existing.summary[contentIndex] = "";
    }
    existing.summary[contentIndex] += delta;
    return;
  }
}

function applyReasoningSummaryPartAdded(
  state: CodexMirrorState,
  itemId: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "reasoning") {
    existing.summary.push("");
  }
}

function applyCommandOutputDelta(
  state: CodexMirrorState,
  itemId: string,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "commandExecution") {
    existing.output += delta;
  }
}

function applyFileChangeOutputDelta(
  state: CodexMirrorState,
  itemId: string,
  delta: string,
) {
  const existing = state.items.get(itemId);
  if (existing?.type === "fileChange") {
    existing.output += delta;
  }
}

function applyUserInputRequest(
  state: CodexMirrorState,
  event: CodexUserInputRequestEvent,
) {
  const params = event.params as Record<string, unknown> | null;
  const prompt =
    params && typeof params.prompt === "string"
      ? params.prompt
      : "Codex is requesting input";
  const itemId = `user-input-${event.id}`;
  state.items.set(itemId, {
    id: itemId,
    isResolved: false,
    order: getItemOrder(state, itemId),
    prompt,
    requestId: event.id,
    response: null,
    type: "userInputRequest",
  });
}

function applyPromptResponseToMirror(
  state: CodexMirrorState,
  response: CodexPromptResponse,
) {
  for (const item of state.items.values()) {
    if (response.kind === "approval") {
      if (item.type !== "commandExecution" && item.type !== "fileChange") {
        continue;
      }
      if (item.approval?.id !== response.approvalId) {
        continue;
      }

      item.state = "approval-responded";
      return;
    }

    if (
      item.type !== "userInputRequest" ||
      item.requestId !== response.requestId
    ) {
      continue;
    }

    item.isResolved = true;
    item.response = response.response;
    return;
  }
}

function applyApprovalRequest(
  state: CodexMirrorState,
  method: CodexServerEvent["method"],
  approvalId: string,
  params: unknown,
) {
  if (!params || typeof params !== "object") {
    return;
  }

  const itemId =
    "itemId" in params && typeof params.itemId === "string"
      ? params.itemId
      : null;
  if (!itemId) {
    return;
  }

  const existing = state.items.get(itemId);
  if (!existing) {
    return;
  }

  if (existing.type === "commandExecution" || existing.type === "fileChange") {
    existing.approval = {
      id: approvalId,
      reason:
        "reason" in params && typeof params.reason === "string"
          ? params.reason
          : null,
    };
    existing.state = "approval-requested";
    existing.status = "approval-requested";
  }
}

function parseCodexAgentMessageSegments(
  text: string,
): CodexAgentMessageSegment[] {
  if (!text.includes(PROPOSED_PLAN_OPEN_TAG)) {
    return text.trim() ? [{ text, type: "text" }] : [];
  }

  const segments: CodexAgentMessageSegment[] = [];
  let cursor = 0;
  let blockIndex = 0;

  while (cursor < text.length) {
    const openIndex = text.indexOf(PROPOSED_PLAN_OPEN_TAG, cursor);
    if (openIndex === -1) {
      const remaining = text.slice(cursor);
      if (remaining.trim()) {
        segments.push({ text: remaining, type: "text" });
      }
      break;
    }

    const before = text.slice(cursor, openIndex);
    if (before.trim()) {
      segments.push({ text: before, type: "text" });
    }

    const contentStart = openIndex + PROPOSED_PLAN_OPEN_TAG.length;
    const closeIndex = text.indexOf(PROPOSED_PLAN_CLOSE_TAG, contentStart);
    if (closeIndex === -1) {
      segments.push({
        blockIndex,
        isCompleted: false,
        text: text.slice(contentStart).trim(),
        type: "plan",
      });
      break;
    }

    segments.push({
      blockIndex,
      isCompleted: true,
      text: text.slice(contentStart, closeIndex).trim(),
      type: "plan",
    });
    blockIndex += 1;
    cursor = closeIndex + PROPOSED_PLAN_CLOSE_TAG.length;
  }

  return segments;
}

function buildAgentMessageParts(
  item: Extract<CodexMirrorItem, { type: "agentMessage" }>,
  planSteps: CodexMirrorState["planSteps"],
): ThreadUIMessage["parts"] {
  return parseCodexAgentMessageSegments(item.text).map((segment) => {
    if (segment.type === "text") {
      return { text: segment.text, type: "text" as const };
    }

    return {
      input: { kind: "plan" },
      output: { steps: planSteps, text: segment.text },
      state: segment.isCompleted ? "output-available" : "input-streaming",
      toolCallId: `${item.id}:proposed-plan:${segment.blockIndex}`,
      toolName: "codex_plan",
      type: "dynamic-tool",
    } as ThreadUIMessage["parts"][number];
  });
}

function buildMirrorParts(state: CodexMirrorState) {
  const orderedItems = [...state.items.values()].sort(
    (left, right) => left.order - right.order,
  );
  const parts: ThreadUIMessage["parts"] = [];

  for (const item of orderedItems) {
    switch (item.type) {
      case "agentMessage":
        if (item.text) {
          parts.push(...buildAgentMessageParts(item, state.planSteps));
        }
        break;
      case "reasoning": {
        const text = item.content.filter(Boolean).join("");
        if (text) {
          parts.push({ text, type: "reasoning" });
        }
        break;
      }
      case "plan":
        parts.push({
          input: { kind: "plan" },
          output: { steps: state.planSteps, text: item.text },
          state: item.isCompleted ? "output-available" : "input-streaming",
          toolCallId: item.id,
          toolName: "codex_plan",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "commandExecution": {
        const cmdInput = {
          command: item.command,
          commandActions: item.commandActions,
          cwd: item.cwd,
          reason: item.approval?.reason ?? null,
        };
        const cmdOutput = {
          durationMs: item.durationMs,
          exitCode: item.exitCode,
          output: item.output,
          processId: item.processId,
          status: item.status,
        };
        parts.push({
          ...(item.approval ? { approval: { id: item.approval.id } } : {}),
          input: cmdInput,
          ...(item.state === "output-error"
            ? { errorText: extractErrorText(cmdOutput) }
            : { output: cmdOutput }),
          state: item.state,
          toolCallId: item.id,
          toolName: "codex_command_execution",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "fileChange": {
        const fcInput = {
          changes: item.changes,
          reason: item.approval?.reason ?? null,
        };
        const fcOutput = {
          output: item.output,
          status: item.status,
        };
        parts.push({
          ...(item.approval ? { approval: { id: item.approval.id } } : {}),
          input: fcInput,
          ...(item.state === "output-error"
            ? { errorText: extractErrorText(fcOutput) }
            : { output: fcOutput }),
          state: item.state,
          toolCallId: item.id,
          toolName: "codex_file_change",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "webSearch":
        parts.push({
          input: { query: item.query },
          output: { action: item.action },
          state: item.isCompleted ? "output-available" : "input-available",
          toolCallId: item.id,
          toolName: "codex_web_search",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "mcpToolCall": {
        const mcpState = mirrorToolStateFromStatus(item.status);
        const mcpInput = {
          arguments: item.arguments,
          server: item.server,
          tool: item.tool,
        };
        const mcpOutput = {
          durationMs: item.durationMs,
          error: item.error,
          result: item.result,
          status: item.status,
        };
        parts.push({
          input: mcpInput,
          ...(mcpState === "output-error"
            ? { errorText: item.error ?? extractErrorText(mcpOutput) }
            : { output: mcpOutput }),
          state: mcpState,
          toolCallId: item.id,
          toolName: "codex_mcp_tool_call",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "imageView":
        parts.push({
          input: { path: item.path },
          output: { path: item.path },
          state: "output-available",
          toolCallId: item.id,
          toolName: "codex_image_view",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "enteredReviewMode":
      case "exitedReviewMode":
        parts.push({
          input: { review: item.review, transition: item.type },
          output: { review: item.review, transition: item.type },
          state: item.isCompleted ? "output-available" : "input-available",
          toolCallId: item.id,
          toolName: "codex_review_mode",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "collabAgentToolCall": {
        const collabState =
          item.status === "completed"
            ? "output-available"
            : item.status === "failed"
              ? "output-error"
              : "input-available";
        const collabInput = {
          prompt: item.prompt,
          receiverThreadIds: item.receiverThreadIds,
          senderThreadId: item.senderThreadId,
          tool: item.tool,
        };
        const collabOutput = {
          agentsStates: item.agentsStates,
          status: item.status,
        };
        parts.push({
          input: collabInput,
          ...(collabState === "output-error"
            ? { errorText: extractErrorText(collabOutput) }
            : { output: collabOutput }),
          state: collabState,
          toolCallId: item.id,
          toolName: "codex_collab_agent",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "contextCompaction":
        parts.push({
          input: { kind: "contextCompaction" },
          output: { kind: "contextCompaction" },
          state: item.isCompleted ? "output-available" : "input-available",
          toolCallId: item.id,
          toolName: "codex_context_compaction",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "userInputRequest":
        parts.push({
          ...(item.requestId ? { approval: { id: item.requestId } } : {}),
          input: { prompt: item.prompt, requestId: item.requestId },
          output: { response: item.response },
          state: item.isResolved ? "output-available" : "approval-requested",
          toolCallId: item.id,
          toolName: "codex_user_input",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "userMessage":
        break;
    }
  }

  return parts.length > 0 ? parts : [{ text: " ", type: "text" as const }];
}

function emitAssistantMessageUpdate(
  state: CodexMirrorState,
  runId: string,
  status: "pending" | "streaming" | "completed" | "error" | "cancelled",
  options?: { repoCheckpointId?: string | null },
) {
  const message = persist.upsertMessage(state.threadId, {
    id: state.assistantId,
    metadata: {
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
    parts: buildMirrorParts(state),
    role: "assistant",
  });

  const control = activeCodexRunControls.get(runId);
  control?.eventChannel.emit({
    message,
    runId,
    type: "message.upsert",
  });
  control?.eventChannel.emit({
    messageId: state.assistantId,
    runId,
    status,
    type: "message.status",
  });

  return message;
}

async function emitLatestSnapshot(runId: string, threadId: string) {
  const snapshot = await loadThreadSessionSnapshot(threadId);
  if (!snapshot) {
    return;
  }

  activeCodexRunControls.get(runId)?.eventChannel.emit({
    snapshot,
    type: "thread.snapshot",
  });
}

async function drainQueuedCodexFollowUp(
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
    await runCodexThreadChat(
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

async function finalizeCodexRun(input: {
  errorMessage?: string | null;
  messageStatus: "cancelled" | "completed" | "error";
  runId: string;
  state: CodexMirrorState;
  threadStatus: "idle" | "streaming" | "awaiting_approval";
}) {
  const control = activeCodexRunControls.get(input.runId);
  if (!control) {
    return;
  }

  const repoCheckpointId =
    input.messageStatus === "completed" && input.threadStatus === "idle"
      ? await finalizeThreadRepoCheckpointRun({
          assistantMessageId: input.state.assistantId,
          runId: input.runId,
          threadId: input.state.threadId,
        })
      : (await clearThreadRepoCheckpointRun(input.runId), null);

  persist.clearActiveStream(input.state.threadId);
  persist.setThreadStatus(input.state.threadId, input.threadStatus);
  persist.updateMessageMetadata(input.state.threadId, input.state.assistantId, {
    errorMessage: input.errorMessage ?? undefined,
    ...(repoCheckpointId ? { repoCheckpointId } : {}),
    runId: input.runId,
    status: input.messageStatus,
  });
  const currentThread = await persist.loadThread(input.state.threadId);
  const currentCodexState = getCodexThreadState(currentThread?.chatEngineState);
  if (currentCodexState) {
    persist.updateCodexThreadState(input.state.threadId, {
      ...currentCodexState,
      pendingTurnId: null,
    });
  }
  emitAssistantMessageUpdate(
    input.state,
    input.runId,
    input.messageStatus === "error"
      ? "error"
      : input.messageStatus === "cancelled"
        ? "cancelled"
        : "completed",
    { repoCheckpointId },
  );

  await emitLatestSnapshot(input.runId, input.state.threadId);
  if (input.messageStatus === "error") {
    control.eventChannel.emit({
      error: input.errorMessage ?? "Codex run failed.",
      runId: input.runId,
      threadStatus: input.threadStatus,
      type: "run.failed",
    });
  } else if (input.messageStatus === "cancelled") {
    control.eventChannel.emit({
      messageId: input.state.assistantId,
      runId: input.runId,
      threadStatus: input.threadStatus,
      type: "run.cancelled",
    });
  } else {
    control.eventChannel.emit({
      runId: input.runId,
      threadStatus: input.threadStatus,
      type: "run.finished",
    });
  }
  control.eventChannel.close();
  control.unsubscribe();
  activeCodexRunControls.delete(input.runId);

  if (input.threadStatus === "idle" && input.messageStatus !== "error") {
    try {
      await drainQueuedCodexFollowUp({
        threadId: input.state.threadId,
        userId: control.userId,
        workspaceId: control.workspaceId,
      });
    } catch (error) {
      log.error("codex_follow_up_drain_failed", {
        error,
        threadId: input.state.threadId,
      });
    }
  }
}

async function handleCodexServerEvent(
  event: CodexServerEvent,
  runId: string,
  state: CodexMirrorState,
) {
  const eventThreadId = getCodexEventThreadId(event);

  if (event.type === "approval-request") {
    if (eventThreadId !== state.codexThreadId) {
      return;
    }

    applyApprovalRequest(state, event.method, event.id, event.params);
    persist.setThreadStatus(state.threadId, "awaiting_approval");
    emitAssistantMessageUpdate(state, runId, "streaming");
    await emitLatestSnapshot(runId, state.threadId);
    return;
  }

  if (event.type === "user-input-request") {
    if (eventThreadId !== state.codexThreadId) {
      return;
    }

    applyUserInputRequest(state, event);
    persist.setThreadStatus(state.threadId, "awaiting_approval");
    emitAssistantMessageUpdate(state, runId, "streaming");
    await emitLatestSnapshot(runId, state.threadId);
    return;
  }

  const params =
    event.params && typeof event.params === "object"
      ? (event.params as Record<string, unknown>)
      : null;

  if (eventThreadId && eventThreadId !== state.codexThreadId) {
    return;
  }

  switch (event.method) {
    case "thread/name/updated": {
      const title =
        typeof params?.name === "string"
          ? params.name
          : typeof params?.title === "string"
            ? params.title
            : null;
      if (title?.trim()) {
        persist.updateThreadTitle(state.threadId, title.trim());
        await emitLatestSnapshot(runId, state.threadId);
      }
      return;
    }
    case "turn/started":
      if (
        params?.turn &&
        typeof params.turn === "object" &&
        "id" in params.turn &&
        typeof (params.turn as { id?: unknown }).id === "string"
      ) {
        state.codexTurnId = (params.turn as { id: string }).id;
      }
      return;
    case "item/started":
    case "item/completed":
      if (params?.item && typeof params.item === "object") {
        upsertMirrorItemFromCodexItem(state, params.item as CodexThreadItem);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/agentMessage/delta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string"
      ) {
        applyAgentDelta(state, params.itemId, params.delta);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/plan/delta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string"
      ) {
        applyPlanDelta(state, params.itemId, params.delta);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/reasoning/textDelta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string" &&
        typeof params?.contentIndex === "number"
      ) {
        applyReasoningDelta(
          state,
          params.itemId,
          params.contentIndex,
          params.delta,
        );
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/commandExecution/outputDelta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string"
      ) {
        applyCommandOutputDelta(state, params.itemId, params.delta);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/fileChange/outputDelta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string"
      ) {
        applyFileChangeOutputDelta(state, params.itemId, params.delta);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/reasoning/summaryTextDelta":
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string" &&
        typeof params?.contentIndex === "number"
      ) {
        applyReasoningSummaryDelta(
          state,
          params.itemId,
          params.contentIndex,
          params.delta,
        );
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "item/reasoning/summaryPartAdded":
      if (typeof params?.itemId === "string") {
        applyReasoningSummaryPartAdded(state, params.itemId);
      }
      return;
    case "turn/diff/updated":
      if (typeof params?.diff === "string") {
        state.turnDiff = params.diff;
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "turn/plan/updated":
      if (Array.isArray(params?.steps)) {
        state.planSteps = (params.steps as Array<Record<string, unknown>>).map(
          (s) => ({
            status:
              s.status === "completed" || s.status === "inProgress"
                ? s.status
                : "pending",
            step: typeof s.step === "string" ? s.step : "",
          }),
        );
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "serverRequest/resolved":
      if (typeof params?.itemId === "string") {
        const existing = state.items.get(params.itemId);
        if (
          existing &&
          (existing.type === "commandExecution" ||
            existing.type === "fileChange")
        ) {
          if (existing.approval) {
            existing.approval = undefined;
          }
        }
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "thread/tokenUsage/updated":
      if (params?.tokenUsage && typeof params.tokenUsage === "object") {
        const usage = params.tokenUsage as Record<string, unknown>;
        state.usage = {
          inputTokens:
            typeof usage.inputTokens === "number"
              ? usage.inputTokens
              : undefined,
          outputTokens:
            typeof usage.outputTokens === "number"
              ? usage.outputTokens
              : undefined,
          reasoningTokens:
            typeof usage.reasoningTokens === "number"
              ? usage.reasoningTokens
              : undefined,
          totalTokens:
            typeof usage.totalTokens === "number"
              ? usage.totalTokens
              : undefined,
        };
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    case "turn/completed":
      if (params?.turn && typeof params.turn === "object") {
        const turn = params.turn as CodexTurn;
        for (const item of turn.items) {
          upsertMirrorItemFromCodexItem(state, item);
        }

        const errorMessage =
          turn.status === "failed"
            ? (turn.error?.message ?? "Codex turn failed.")
            : null;
        await finalizeCodexRun({
          errorMessage,
          messageStatus:
            turn.status === "failed"
              ? "error"
              : turn.status === "interrupted"
                ? "cancelled"
                : "completed",
          runId,
          state,
          threadStatus: "idle",
        });
      }
      return;
    default:
      return;
  }
}

async function buildCodexUserInput(
  message: ThreadUIMessage | undefined,
  options?: { promptPrefix?: string | null },
) {
  if (!message) {
    throw new Error("Codex turns require a user message.");
  }

  const inputs: Array<
    | { text: string; text_elements: []; type: "text" }
    | { path: string; type: "localImage" }
    | { type: "image"; url: string }
  > = [];

  let text = message.parts
    .filter(
      (
        part,
      ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim();

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
    inputs.push({
      text,
      text_elements: [],
      type: "text",
    });
  }

  for (const part of message.parts) {
    if (part.type !== "file") {
      continue;
    }

    if (!part.mediaType.startsWith("image/")) {
      const loaded = await loadInlineAttachmentDocument({
        filename: part.filename ?? "attachment",
        mediaType: part.mediaType,
        sourceKind: "message_attachment",
        url: part.url,
      });

      inputs.push({
        text: buildDocumentModelText(loaded),
        text_elements: [],
        type: "text",
      });
      continue;
    }

    if (part.url.startsWith("/")) {
      inputs.push({
        path: part.url,
        type: "localImage",
      });
      continue;
    }

    inputs.push({
      type: "image",
      url: part.url,
    });
  }

  if (inputs.length === 0) {
    throw new Error("Codex turns require text or an image attachment.");
  }

  return inputs;
}

export async function stopCodexThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const codexState = getCodexThreadState(existingThread?.chatEngineState);
  const activeRunId = existingThread?.activeStreamId ?? null;
  const control = activeRunId ? activeCodexRunControls.get(activeRunId) : null;
  const turnId = control?.codexTurnId ?? codexState?.pendingTurnId ?? null;
  const codexThreadId =
    control?.codexThreadId ?? codexState?.codexThreadId ?? null;

  if (request.messageId) {
    await persist.updateMessageMetadata(request.threadId, request.messageId, {
      errorMessage: "Generation stopped.",
      status: "cancelled",
      statusLabel: null,
    });
  }

  if (codexThreadId && turnId) {
    try {
      await getCodexAppServerManager().interruptTurn(codexThreadId, turnId);
    } catch (error) {
      log.warn("interrupt_failed", {
        codexThreadId,
        error,
        turnId,
      });
    }
  }

  persist.clearActiveStream(request.threadId);
  persist.setThreadStatus(request.threadId, "idle");
  if (codexState) {
    persist.updateCodexThreadState(request.threadId, {
      ...codexState,
      pendingTurnId: null,
    });
  }

  if (activeRunId && control) {
    const snapshot = await loadThreadSessionSnapshot(request.threadId);
    if (snapshot) {
      control.eventChannel.emit({
        snapshot,
        type: "thread.snapshot",
      });
    }
    control.eventChannel.emit({
      ...(request.messageId ? { messageId: request.messageId } : {}),
      runId: activeRunId,
      threadStatus: "idle",
      type: "run.cancelled",
    });
    control.eventChannel.close();
    control.unsubscribe();
    activeCodexRunControls.delete(activeRunId);
  }

  try {
    await drainQueuedCodexFollowUp(request);
  } catch (error) {
    log.error("codex_follow_up_drain_failed", {
      error,
      threadId: request.threadId,
    });
  }

  return new Response(null, { status: 204 });
}

export async function runCodexThreadChat(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  if (request.trigger === "submit-tool-approval") {
    const promptResponse = extractCodexPromptResponse(request.messages);
    if (!promptResponse) {
      throw new Error("Unable to resolve the Codex prompt response.");
    }

    const codexState = getCodexThreadState(existingThread?.chatEngineState);
    if (!codexState?.codexThreadId) {
      throw new Error("The Codex thread state is unavailable.");
    }

    const latestAssistant = request.messages
      ? [...request.messages]
          .reverse()
          .find((message) => message.role === "assistant")
      : null;
    if (latestAssistant) {
      persist.upsertMessage(request.threadId, latestAssistant);
    }

    if (promptResponse.kind === "user-input") {
      await getCodexAppServerManager().respondToUserInput(
        promptResponse.requestId,
        promptResponse.response,
      );
    } else {
      await getCodexAppServerManager().respondToApproval(
        promptResponse.approvalId,
        promptResponse.decision,
      );
    }

    const activeControl = findActiveCodexRunForThread(request.threadId);
    if (activeControl) {
      applyPromptResponseToMirror(activeControl.mirrorState, promptResponse);
      emitAssistantMessageUpdate(
        activeControl.mirrorState,
        activeControl.runId,
        "streaming",
      );
    }

    persist.setThreadStatus(request.threadId, "streaming");
    return new Response(null, { status: 204 });
  }

  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The Codex engine does not support "${request.trigger}" yet.`,
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

  const activeControl = findActiveCodexRunForThread(request.threadId);
  if (activeControl?.codexTurnId) {
    const codexInput = await buildCodexUserInput(request.message);
    const steerRunId = generateId();
    const existingCodexState = getCodexThreadState(
      existingThread?.chatEngineState,
    );
    const persistedUser = buildUserMessage(
      request,
      userParentMessageId,
      steerRunId,
    );
    if (persistedUser) {
      persist.upsertMessage(request.threadId, persistedUser);
      await persist.setActiveMessage(request.threadId, persistedUser.id);
      if (checkpointAnchorMessageId) {
        persist.updateThreadRepoState(request.threadId, {
          checkpointAnchorMessageId: null,
        });
      }
    }

    await persist.updateThreadChatSettings(request.threadId, {
      engine: "codex",
      modelId: request.modelId ?? existingCodexState?.modelId ?? null,
      mode: threadMode,
      reasoningEffort: request.reasoningEffort ?? null,
    });

    await getCodexAppServerManager().steerTurn({
      input: codexInput,
      threadId: activeControl.codexThreadId,
      turnId: activeControl.codexTurnId,
    });

    return new Response(null, { status: 204 });
  }
  const assistantParentMessageId = getCodexAssistantParentMessageId({
    submittedUserMessageId: request.message?.id ?? null,
    userParentMessageId,
  });
  const fallbackTitle = buildCodexBootstrapTitle(
    getFirstUserText(request.message ? [request.message] : []),
  );

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    "codex",
    request.draftRepoState ? { repo: request.draftRepoState } : null,
  );
  if (
    request.trigger === "submit-user-message" &&
    allRecords.length === 0 &&
    existingThread?.title === "New thread" &&
    fallbackTitle !== "New thread"
  ) {
    persist.updateThreadTitle(request.threadId, fallbackTitle);
  }

  const workspaceRoot = await getWorkspaceRootPath(
    request.workspaceId,
    request.userId,
    request.threadId,
  );
  const permissionMode = await getToolPermissionMode(
    request.userId,
    request.workspaceId,
    request.threadId,
  );
  const approvalPolicy = getCodexApprovalPolicy(permissionMode);
  const sandboxMode = getCodexSandboxMode(permissionMode, workspaceRoot);
  const sandboxPolicy = buildCodexSandboxPolicy(sandboxMode, workspaceRoot);
  const codex = getCodexAppServerManager();
  const codexInput = await buildCodexUserInput(request.message);
  const existingCodexState = getCodexThreadState(
    existingThread?.chatEngineState,
  );
  const didThreadModeChange =
    existingThread?.mode != null &&
    normalizeThreadMode(existingThread.mode) !== threadMode;
  const resumableCodexState = didThreadModeChange ? null : existingCodexState;
  const runId = generateId();
  const assistantId = crypto.randomUUID();
  const eventChannel = await createThreadEventChannel(runId);

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

    const placeholder = persist.upsertMessage(
      request.threadId,
      buildAssistantPlaceholder({
        assistantId,
        parentMessageId: assistantParentMessageId,
        requestedModelId:
          request.modelId ?? existingCodexState?.modelId ?? null,
        runId,
      }),
    );
    await persist.setActiveMessage(request.threadId, assistantId);
    persist.setActiveStream(request.threadId, runId);
    persist.setThreadStatus(request.threadId, "streaming");
    await persist.updateThreadChatSettings(request.threadId, {
      engine: "codex",
      modelId: request.modelId ?? existingCodexState?.modelId ?? null,
      mode: threadMode,
      reasoningEffort: request.reasoningEffort ?? null,
    });
    await beginThreadRepoCheckpointRun({
      projectPath: workspaceRoot,
      runId,
      thread: existingThread,
    });

    const threadStartResponse =
      resumableCodexState?.codexThreadId != null
        ? await codex.resumeThread(resumableCodexState.codexThreadId)
        : await codex.startThread({
            approvalPolicy,
            cwd: workspaceRoot,
            model: request.modelId ?? null,
            sandboxMode,
          });

    const mirror = createCodexMirrorState({
      assistantId,
      codexThreadId: threadStartResponse.thread.id,
      requestedModelId:
        request.modelId ??
        resumableCodexState?.modelId ??
        threadStartResponse.model ??
        null,
      responseModelId: threadStartResponse.model ?? null,
      threadId: request.threadId,
    });

    const unsubscribe = codex.subscribe((event) => {
      void handleCodexServerEvent(event, runId, mirror);
    });

    activeCodexRunControls.set(runId, {
      assistantId,
      codexThreadId: threadStartResponse.thread.id,
      codexTurnId: null,
      eventChannel,
      mirrorState: mirror,
      runId,
      threadId: request.threadId,
      unsubscribe,
      userId: request.userId,
      workspaceId: request.workspaceId,
    });

    const initialSnapshot = await loadThreadSessionSnapshot(request.threadId);
    if (!initialSnapshot) {
      throw new Error("Unable to bootstrap the Codex chat session.");
    }

    eventChannel.emit({
      snapshot: initialSnapshot,
      type: "thread.snapshot",
    });
    eventChannel.emit({ runId, type: "run.started" });

    const collaborationMode = buildCodexCollaborationMode({
      interactionMode: threadMode === "plan" ? "plan" : "default",
      model: request.modelId ?? threadStartResponse.model ?? null,
      effort: request.reasoningEffort ?? null,
    });

    const startTurnParams: Parameters<typeof codex.startTurn>[0] = {
      approvalPolicy,
      cwd: workspaceRoot,
      effort: request.reasoningEffort ?? null,
      input: codexInput,
      model: request.modelId ?? null,
      sandboxPolicy,
      threadId: threadStartResponse.thread.id,
    };

    let turnResponse: Awaited<ReturnType<typeof codex.startTurn>>;
    try {
      turnResponse = await codex.startTurn(
        collaborationMode
          ? { ...startTurnParams, collaborationMode }
          : startTurnParams,
      );
    } catch (error) {
      if (
        !collaborationMode ||
        !isUnsupportedCodexCollaborationModeError(error)
      ) {
        throw error;
      }

      log.warn("start_turn_collaboration_mode_unsupported", {
        codexThreadId: threadStartResponse.thread.id,
        error,
        threadId: request.threadId,
      });
      const fallbackStartTurnParams =
        threadMode === "plan"
          ? {
              ...startTurnParams,
              input: await buildCodexUserInput(request.message, {
                promptPrefix: buildPlanModePromptPreamble(
                  "Native Codex collaboration mode could not be enabled. Apply the full Plan Mode contract below for this turn instead.",
                ),
              }),
            }
          : startTurnParams;
      turnResponse = await codex.startTurn(fallbackStartTurnParams);
    }

    mirror.codexTurnId = turnResponse.turn.id;
    const control = activeCodexRunControls.get(runId);
    if (control) {
      control.codexTurnId = turnResponse.turn.id;
    }

    persist.updateCodexThreadState(
      request.threadId,
      buildInitialCodexThreadState({
        approvalPolicy,
        cliVersion:
          threadStartResponse.thread.cliVersion ||
          resumableCodexState?.cliVersion,
        codexThreadId: threadStartResponse.thread.id,
        cwd: threadStartResponse.cwd ?? workspaceRoot,
        modelId: request.modelId ?? threadStartResponse.model ?? null,
        modelProvider:
          threadStartResponse.modelProvider ??
          resumableCodexState?.modelProvider ??
          null,
        pendingTurnId: turnResponse.turn.id,
        reasoningEffort:
          request.reasoningEffort ??
          threadStartResponse.reasoningEffort ??
          null,
        sandboxMode,
      }),
    );

    for (const item of turnResponse.turn.items) {
      upsertMirrorItemFromCodexItem(mirror, item);
    }
    emitAssistantMessageUpdate(mirror, runId, "streaming");

    return Response.json(
      {
        activeRunId: runId,
        snapshot: initialSnapshot,
      },
      { status: 202 },
    );
  } catch (error) {
    await clearThreadRepoCheckpointRun(runId);
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    const control = activeCodexRunControls.get(runId);
    control?.eventChannel.close();
    control?.unsubscribe();
    activeCodexRunControls.delete(runId);
    if (typeof persist.updateMessageMetadata === "function") {
      await persist.updateMessageMetadata(request.threadId, assistantId, {
        errorMessage:
          error instanceof Error ? error.message : "Unable to start Codex.",
        runId,
        status: "error",
      });
    }
    throw error;
  }
}
