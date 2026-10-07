import "server-only";

import { generateId } from "ai";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { resolveSupportedPermissionMode } from "@/lib/security";
import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import type {
  CodexApprovalRequestEvent,
  CodexServerEvent,
  CodexThreadItem,
  CodexTurn,
  CodexUserInputRequestEvent,
} from "@/lib/ai/chat/engines/codex-app-server";
import {
  CODEX_DEFAULT_MODEL_ID,
  toCodexReasoningEffort,
} from "@/lib/ai/chat/engines/codex-app-server/models";
import {
  buildCodexUserInputPrompt,
  parseCodexUserInputQuestions,
  type CodexUserInputQuestion,
} from "@/lib/ai/chat/engines/codex-app-server/protocol";
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

import * as persist from "../../persistence";
import {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
  getThreadCheckpointAnchorMessageId,
} from "../../repo/checkpoints";
import { loadThreadSessionSnapshot } from "../../session/server";
import type { ThreadChatRequest } from "../../types";
import {
  getFollowUpModelRequestOptions,
  resolveThreadEngineInstance,
} from "../engine-instance";
import { normalizeThreadChatErrorMessage } from "../../errors";
import {
  createThreadEventChannel,
  type ThreadEventChannel,
} from "../thread-chat/run-state";
import {
  buildActiveThreadMessages,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "../transcript";
import {
  buildCodexBootstrapTitle,
  getCodexAssistantParentMessageId,
} from "./helpers";
import {
  buildPlanModePromptPreamble,
  DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "../plan-mode-instructions";
import {
  extractCodexPromptResponse,
  getCodexEventThreadId,
  redactCodexSecretUserInput,
  type CodexPromptResponse,
} from "./event-helpers";
import { activeCodexRunControls, findActiveCodexRunForThread } from "./state";
import { isUnattendedRun, UNATTENDED_DECLINE_MESSAGE } from "../unattended";
import {
  applyCodexTokenUsageUpdate,
  createCodexTokenUsageTracker,
  type CodexMessageUsage,
  type CodexTokenUsageTracker,
} from "./token-usage";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";
import { getToolPermissionMode, getWorkspaceRootPath } from "../workspace";

const log = createLogger("CodexThreadChat");

export type ActiveCodexRunControl = {
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
      arguments: unknown;
      contentItems: unknown[] | null;
      durationMs: number | null;
      id: string;
      namespace: string | null;
      order: number;
      status: string;
      success: boolean | null;
      tool: string;
      type: "dynamicToolCall";
    }
  | {
      failure: unknown | null;
      id: string;
      order: number;
      revisedPrompt: string | null;
      savedPath: string | null;
      status: string;
      type: "imageGeneration";
    }
  | {
      agentPath: string;
      agentThreadId: string;
      id: string;
      kind: string;
      order: number;
      type: "subAgentActivity";
    }
  | {
      durationMs: number | null;
      id: string;
      order: number;
      type: "sleep";
    }
  | {
      approvalId: string;
      deniedReason?: string;
      id: string;
      input: Record<string, unknown>;
      method: string;
      order: number;
      state: CodexMirrorToolState;
      toolName: string;
      type: "serverApproval";
    }
  | {
      id: string;
      isResolved: boolean;
      order: number;
      prompt: string;
      questions: CodexUserInputQuestion[];
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
  tokenUsage: CodexTokenUsageTracker;
  usage: CodexMessageUsage | null;
};

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
  /** The thread instance's app-server (its model/list). */
  codex: Pick<
    ReturnType<typeof getCodexAppServerManager>,
    "getDefaultModel" | "getKnownModel"
  >;
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
  // `settings.model` is required; prefer Codex's own `model/list` default
  // over the static fallback.
  const knownDefault = input.codex.getDefaultModel();
  const model = input.model ?? knownDefault?.id ?? CODEX_DEFAULT_MODEL_ID;
  const knownModel = input.codex.getKnownModel(model);
  return {
    mode: input.interactionMode,
    settings: {
      model,
      reasoning_effort:
        input.effort ?? knownModel?.defaultReasoningEffort ?? "medium",
      developer_instructions:
        input.interactionMode === "plan"
          ? PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
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
    tokenUsage: createCodexTokenUsageTracker(),
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

// Hook-injected prompts and raw tool outputs are history bookkeeping; like
// `userMessage` they are never rendered in the assistant message.
const CODEX_UNRENDERED_ITEM_TYPES = new Set([
  "functionCallOutput",
  "hookPrompt",
]);

function getMcpToolCallErrorMessage(error: unknown) {
  if (typeof error === "string" && error) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" && message ? message : null;
  }

  return null;
}

function upsertMirrorItemFromCodexItem(
  state: CodexMirrorState,
  item: CodexThreadItem,
) {
  if (!item || typeof item !== "object" || typeof item.id !== "string") {
    return;
  }

  if (CODEX_UNRENDERED_ITEM_TYPES.has(item.type)) {
    return;
  }

  const order = getItemOrder(state, item.id);
  const existing = state.items.get(item.id);

  switch (item.type) {
    case "agentMessage":
      state.items.set(item.id, {
        id: item.id,
        order,
        text: item.text ?? "",
        type: "agentMessage",
      });
      return;
    case "plan":
      state.items.set(item.id, {
        id: item.id,
        isCompleted: true,
        order,
        text: item.text ?? "",
        type: "plan",
      });
      return;
    case "reasoning": {
      // Completed items can omit what was streamed; keep the streamed text.
      const previous = existing?.type === "reasoning" ? existing : null;
      const content = Array.isArray(item.content) ? [...item.content] : [];
      const summary = Array.isArray(item.summary) ? [...item.summary] : [];
      state.items.set(item.id, {
        content:
          content.some(Boolean) || !previous ? content : previous.content,
        id: item.id,
        order,
        summary:
          summary.some(Boolean) || !previous ? summary : previous.summary,
        type: "reasoning",
      });
      return;
    }
    case "commandExecution": {
      const previous = existing?.type === "commandExecution" ? existing : null;
      state.items.set(item.id, {
        ...(previous?.approval && item.status === "inProgress"
          ? { approval: previous.approval }
          : {}),
        command: item.command ?? previous?.command ?? "",
        commandActions: Array.isArray(item.commandActions)
          ? item.commandActions
          : (previous?.commandActions ?? []),
        cwd: item.cwd ?? previous?.cwd ?? "",
        durationMs: item.durationMs ?? null,
        exitCode: item.exitCode ?? null,
        id: item.id,
        order,
        output: item.aggregatedOutput ?? previous?.output ?? "",
        processId: item.processId ?? null,
        state:
          previous?.state === "approval-requested" &&
          item.status === "inProgress"
            ? previous.state
            : mirrorToolStateFromStatus(item.status),
        status:
          previous?.state === "approval-requested" &&
          item.status === "inProgress"
            ? previous.status
            : item.status,
        type: "commandExecution",
      });
      return;
    }
    case "fileChange": {
      const previous = existing?.type === "fileChange" ? existing : null;
      state.items.set(item.id, {
        ...(previous?.approval && item.status === "inProgress"
          ? { approval: previous.approval }
          : {}),
        changes: Array.isArray(item.changes)
          ? item.changes
          : (previous?.changes ?? []),
        id: item.id,
        order,
        output: previous?.output ?? "",
        state:
          previous?.state === "approval-requested" &&
          item.status === "inProgress"
            ? previous.state
            : mirrorToolStateFromStatus(item.status),
        status:
          previous?.state === "approval-requested" &&
          item.status === "inProgress"
            ? previous.status
            : item.status,
        type: "fileChange",
      });
      return;
    }
    case "webSearch":
      state.items.set(item.id, {
        action: item.action ?? null,
        id: item.id,
        isCompleted: true,
        order,
        query: item.query ?? "",
        type: "webSearch",
      });
      return;
    case "mcpToolCall":
      state.items.set(item.id, {
        arguments: item.arguments,
        durationMs: item.durationMs ?? null,
        error: item.error ?? null,
        id: item.id,
        order,
        result: item.result ?? null,
        server: item.server,
        status: item.status,
        tool: item.tool,
        type: "mcpToolCall",
      });
      return;
    case "dynamicToolCall":
      state.items.set(item.id, {
        arguments: item.arguments,
        contentItems: item.contentItems ?? null,
        durationMs: item.durationMs ?? null,
        id: item.id,
        namespace: item.namespace ?? null,
        order,
        status: item.status,
        success: item.success ?? null,
        tool: item.tool,
        type: "dynamicToolCall",
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
    case "imageGeneration":
      state.items.set(item.id, {
        failure: item.failure ?? null,
        id: item.id,
        order,
        revisedPrompt: item.revisedPrompt ?? null,
        savedPath: item.savedPath ?? null,
        status: item.status,
        type: "imageGeneration",
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
        agentsStates: item.agentsStates ?? {},
        id: item.id,
        order,
        prompt: item.prompt ?? null,
        receiverThreadIds: item.receiverThreadIds ?? [],
        senderThreadId: item.senderThreadId,
        status: item.status,
        tool: item.tool,
        type: "collabAgentToolCall",
      });
      return;
    case "subAgentActivity":
      state.items.set(item.id, {
        agentPath: item.agentPath,
        agentThreadId: item.agentThreadId,
        id: item.id,
        kind: item.kind,
        order,
        type: "subAgentActivity",
      });
      return;
    case "sleep":
      state.items.set(item.id, {
        durationMs:
          typeof item.durationMs === "number" ? item.durationMs : null,
        id: item.id,
        order,
        type: "sleep",
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
        content: Array.isArray(item.content) ? item.content : [],
        id: item.id,
        order,
        type: "userMessage",
      });
      return;
    default:
      log.debug("unhandled_item_type", {
        itemType: (item as { type?: unknown }).type,
        runThreadId: state.threadId,
      });
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

function ensureReasoningItem(state: CodexMirrorState, itemId: string) {
  const existing = state.items.get(itemId);
  if (existing?.type === "reasoning") {
    return existing;
  }

  const created: Extract<CodexMirrorItem, { type: "reasoning" }> = {
    content: [],
    id: itemId,
    order: getItemOrder(state, itemId),
    summary: [],
    type: "reasoning",
  };
  state.items.set(itemId, created);
  return created;
}

function applyReasoningSummaryDelta(
  state: CodexMirrorState,
  itemId: string,
  summaryIndex: number,
  delta: string,
) {
  const item = ensureReasoningItem(state, itemId);
  item.summary[summaryIndex] = `${item.summary[summaryIndex] ?? ""}${delta}`;
}

function applyReasoningSummaryPartAdded(
  state: CodexMirrorState,
  itemId: string,
  summaryIndex: number | null,
) {
  const item = ensureReasoningItem(state, itemId);
  const index = summaryIndex ?? item.summary.length;
  item.summary[index] ??= "";
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
  const itemId = `user-input-${event.id}`;
  state.items.set(itemId, {
    id: itemId,
    isResolved: false,
    order: getItemOrder(state, itemId),
    prompt: buildCodexUserInputPrompt(event.params),
    questions: parseCodexUserInputQuestions(event.params),
    requestId: event.id,
    response: null,
    type: "userInputRequest",
  });
}

function applyPromptResponseToMirror(
  state: CodexMirrorState,
  response: CodexPromptResponse,
  options?: { declinedReason?: string | null },
) {
  for (const item of state.items.values()) {
    if (response.kind === "approval") {
      if (item.type === "serverApproval") {
        if (item.approvalId !== response.approvalId) {
          continue;
        }

        // An accept Sentinel could not carry out was sent as a decline;
        // show what Codex was told, not what the user clicked.
        if (options?.declinedReason) {
          item.deniedReason = options.declinedReason;
          item.state = "output-denied";
          return;
        }

        item.state =
          response.decision === "decline" || response.decision === "cancel"
            ? "output-denied"
            : "approval-responded";
        return;
      }

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
    // Answers to secret questions go to Codex only, never the transcript.
    item.response = item.questions.some((question) => question.isSecret)
      ? null
      : response.response;
    return;
  }
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

const CODEX_SERVER_APPROVAL_TOOL_NAMES: Partial<
  Record<CodexApprovalRequestEvent["method"], string>
> = {
  applyPatchApproval: "codex_apply_patch_approval",
  execCommandApproval: "codex_exec_command_approval",
  "item/permissions/requestApproval": "codex_permissions_request",
  "mcpServer/elicitation/request": "codex_mcp_elicitation",
};

/**
 * Inputs for approval requests that are not tied to a command or file-change
 * item. They render through the generic Codex tool card (Allow/Deny).
 */
function buildServerApprovalInput(
  method: CodexApprovalRequestEvent["method"],
  params: Record<string, unknown> | null,
): Record<string, unknown> {
  switch (method) {
    case "item/permissions/requestApproval":
      return {
        cwd: getString(params, "cwd"),
        permissions: params?.permissions ?? null,
        reason: getString(params, "reason"),
      };
    case "mcpServer/elicitation/request":
      return {
        message: getString(params, "message"),
        mode: getString(params, "mode"),
        requestedSchema: params?.requestedSchema ?? null,
        serverName: getString(params, "serverName"),
        url: getString(params, "url"),
      };
    case "execCommandApproval":
      return {
        command: Array.isArray(params?.command)
          ? (params.command as unknown[]).join(" ")
          : getString(params, "command"),
        cwd: getString(params, "cwd"),
        reason: getString(params, "reason"),
      };
    case "applyPatchApproval":
      return {
        changes: params?.fileChanges ?? null,
        grantRoot: getString(params, "grantRoot"),
        reason: getString(params, "reason"),
      };
    default:
      return { ...(params ?? {}) };
  }
}

function applyApprovalRequest(
  state: CodexMirrorState,
  method: CodexApprovalRequestEvent["method"],
  approvalId: string,
  paramsValue: unknown,
) {
  const params = getRecord(paramsValue);
  const reason = getString(params, "reason");

  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  ) {
    const itemId = getString(params, "itemId");
    if (!itemId) {
      return;
    }

    let existing = state.items.get(itemId);
    // The approval can arrive before `item/started`; create the item from the
    // request so the prompt is visible instead of silently blocking the turn.
    if (!existing && method === "item/commandExecution/requestApproval") {
      existing = {
        command: getString(params, "command") ?? "",
        commandActions: Array.isArray(params?.commandActions)
          ? (params.commandActions as unknown[])
          : [],
        cwd: getString(params, "cwd") ?? "",
        durationMs: null,
        exitCode: null,
        id: itemId,
        order: getItemOrder(state, itemId),
        output: "",
        processId: null,
        state: "input-available",
        status: "inProgress",
        type: "commandExecution",
      };
      state.items.set(itemId, existing);
    } else if (!existing) {
      existing = {
        changes: [],
        id: itemId,
        order: getItemOrder(state, itemId),
        output: "",
        state: "input-available",
        status: "inProgress",
        type: "fileChange",
      };
      state.items.set(itemId, existing);
    }

    if (
      existing.type === "commandExecution" ||
      existing.type === "fileChange"
    ) {
      existing.approval = { id: approvalId, reason };
      existing.state = "approval-requested";
      existing.status = "approval-requested";
    }
    return;
  }

  const itemId = `server-approval-${approvalId}`;
  state.items.set(itemId, {
    approvalId,
    id: itemId,
    input: buildServerApprovalInput(method, params),
    method,
    order: getItemOrder(state, itemId),
    state: "approval-requested",
    toolName: CODEX_SERVER_APPROVAL_TOOL_NAMES[method] ?? "codex_approval",
    type: "serverApproval",
  });
}

function applyServerRequestResolved(
  state: CodexMirrorState,
  requestId: string,
) {
  for (const item of state.items.values()) {
    if (
      (item.type === "commandExecution" || item.type === "fileChange") &&
      item.approval?.id === requestId
    ) {
      item.approval = undefined;
      if (item.state === "approval-requested") {
        item.state = "approval-responded";
        item.status = "inProgress";
      }
      return true;
    }

    if (item.type === "serverApproval" && item.approvalId === requestId) {
      if (item.state === "approval-requested") {
        // Codex resolved it without an answer from Sentinel (interrupt,
        // auto-review, timeout).
        item.state = "output-denied";
      } else if (item.state === "approval-responded") {
        item.state = "output-available";
      }
      return true;
    }

    if (item.type === "userInputRequest" && item.requestId === requestId) {
      item.isResolved = true;
      return true;
    }
  }

  return false;
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
        // Most models only expose summaries; raw reasoning wins when present.
        const text =
          item.content.filter(Boolean).join("") ||
          item.summary.filter(Boolean).join("\n\n");
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
            ? {
                errorText:
                  getMcpToolCallErrorMessage(item.error) ??
                  extractErrorText(mcpOutput),
              }
            : { output: mcpOutput }),
          state: mcpState,
          toolCallId: item.id,
          toolName: "codex_mcp_tool_call",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "dynamicToolCall": {
        const dynamicState = mirrorToolStateFromStatus(item.status);
        const dynamicOutput = {
          contentItems: item.contentItems,
          durationMs: item.durationMs,
          status: item.status,
          success: item.success,
        };
        parts.push({
          input: {
            arguments: item.arguments,
            namespace: item.namespace,
            tool: item.tool,
          },
          ...(dynamicState === "output-error"
            ? { errorText: extractErrorText(dynamicOutput) }
            : { output: dynamicOutput }),
          state: dynamicState,
          toolCallId: item.id,
          toolName: "codex_dynamic_tool_call",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "imageGeneration": {
        const generationState =
          item.status === "completed"
            ? "output-available"
            : item.status === "failed" || item.failure
              ? "output-error"
              : "input-available";
        const generationOutput = {
          revisedPrompt: item.revisedPrompt,
          savedPath: item.savedPath,
          status: item.status,
        };
        parts.push({
          input: { revisedPrompt: item.revisedPrompt },
          ...(generationState === "output-error"
            ? { errorText: extractErrorText(generationOutput) }
            : { output: generationOutput }),
          state: generationState,
          toolCallId: item.id,
          toolName: "codex_image_generation",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      }
      case "subAgentActivity":
        parts.push({
          input: {
            agentPath: item.agentPath,
            agentThreadId: item.agentThreadId,
          },
          output: { kind: item.kind },
          state:
            item.kind === "started" || item.kind === "interacted"
              ? "input-available"
              : "output-available",
          toolCallId: item.id,
          toolName: "codex_sub_agent_activity",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "sleep":
        parts.push({
          input: { durationMs: item.durationMs },
          output: { durationMs: item.durationMs },
          state: "output-available",
          toolCallId: item.id,
          toolName: "codex_sleep",
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
      case "serverApproval":
        parts.push({
          ...(item.state === "approval-requested"
            ? { approval: { id: item.approvalId } }
            : item.state === "output-denied"
              ? {
                  approval: {
                    approved: false,
                    id: item.approvalId,
                    ...(item.deniedReason ? { reason: item.deniedReason } : {}),
                  },
                }
              : {}),
          input: item.input,
          output: { method: item.method },
          state: item.state,
          toolCallId: item.id,
          toolName: item.toolName,
          type: "dynamic-tool",
        } as ThreadUIMessage["parts"][number]);
        break;
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
          input: {
            prompt: item.prompt,
            ...(item.questions.length > 0 ? { questions: item.questions } : {}),
            requestId: item.requestId,
          },
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
  options?: { errorMessage?: string | null; repoCheckpointId?: string | null },
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
      ...(options?.errorMessage ? { errorMessage: options.errorMessage } : {}),
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
        ...getFollowUpModelRequestOptions(nextFollowUp),
        threadId: request.threadId,
        threadMode: nextFollowUp.threadMode,
        trigger: "submit-user-message",
        userId: request.userId,
        workspaceId: request.workspaceId,
      },
      thread,
      // Queued turns run on the instance the thread is bound to.
      await resolveThreadEngineInstance(request.userId, thread),
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
  const errorMessage =
    input.messageStatus === "error"
      ? normalizeThreadChatErrorMessage(input.errorMessage, "Codex run failed.")
      : (input.errorMessage ?? null);

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
    errorMessage: errorMessage ?? undefined,
    ...(repoCheckpointId ? { repoCheckpointId } : {}),
    runId: input.runId,
    status: input.messageStatus,
  });
  const currentThread =
    typeof persist.loadThread === "function"
      ? await persist.loadThread(input.state.threadId)
      : null;
  const currentCodexState = getCodexThreadState(currentThread?.chatEngineState);
  if (
    currentCodexState &&
    typeof persist.updateCodexThreadState === "function"
  ) {
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
    { errorMessage, repoCheckpointId },
  );

  await emitLatestSnapshot(input.runId, input.state.threadId);
  if (input.messageStatus === "error") {
    log.error("codex_run_failed", {
      error: errorMessage,
      runId: input.runId,
      threadId: input.state.threadId,
    });
    control.eventChannel.emit({
      error: errorMessage ?? "Codex run failed.",
      messageId: input.state.assistantId,
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

// Notifications that carry nothing the assistant mirror shows. They are
// dropped quietly; anything else unknown is logged at debug level.
const CODEX_IGNORED_NOTIFICATIONS = new Set([
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "configWarning",
  "deprecationNotice",
  "hook/completed",
  "hook/started",
  "item/autoApprovalReview/completed",
  "item/autoApprovalReview/started",
  "item/commandExecution/terminalInteraction",
  "item/mcpToolCall/progress",
  "mcpServer/startupStatus/updated",
  "model/safetyBuffering/updated",
  "model/verification",
  "skills/changed",
  "thread/compacted",
  "thread/settings/updated",
  "thread/started",
  "thread/status/changed",
  "turn/diff/updated",
  "warning",
]);

function getNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * How an unattended run (an automation, `interactive: false`) answers the
 * requests nobody can: declined on the spot, never left waiting.
 */
type CodexUnattendedRun = {
  decline(requestId: string): boolean;
};

async function handleCodexServerEvent(
  event: CodexServerEvent,
  runId: string,
  state: CodexMirrorState,
  unattended: CodexUnattendedRun | null = null,
) {
  const eventThreadId = getCodexEventThreadId(event);

  if (event.type === "approval-request") {
    if (eventThreadId !== state.codexThreadId) {
      return;
    }

    applyApprovalRequest(state, event.method, event.id, event.params);
    if (unattended) {
      if (unattended.decline(event.id)) {
        applyPromptResponseToMirror(
          state,
          { approvalId: event.id, decision: "decline", kind: "approval" },
          { declinedReason: UNATTENDED_DECLINE_MESSAGE },
        );
      }
      emitAssistantMessageUpdate(state, runId, "streaming");
      return;
    }
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
    if (unattended) {
      if (unattended.decline(event.id)) {
        applyPromptResponseToMirror(state, {
          kind: "user-input",
          requestId: event.id,
          response: "",
        });
      }
      emitAssistantMessageUpdate(state, runId, "streaming");
      return;
    }
    persist.setThreadStatus(state.threadId, "awaiting_approval");
    emitAssistantMessageUpdate(state, runId, "streaming");
    await emitLatestSnapshot(runId, state.threadId);
    return;
  }

  const params = getRecord(event.params);

  if (eventThreadId && eventThreadId !== state.codexThreadId) {
    return;
  }

  switch (event.method) {
    case "thread/name/updated": {
      const title =
        getString(params, "threadName") ??
        getString(params, "name") ??
        getString(params, "title");
      if (title?.trim()) {
        persist.updateThreadTitle(state.threadId, title.trim());
        await emitLatestSnapshot(runId, state.threadId);
      }
      return;
    }
    case "turn/started": {
      const turnId = getString(getRecord(params?.turn), "id");
      if (turnId) {
        state.codexTurnId = turnId;
      }
      return;
    }
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
    case "item/reasoning/textDelta": {
      const contentIndex = getNumber(params, "contentIndex");
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string" &&
        contentIndex != null
      ) {
        applyReasoningDelta(state, params.itemId, contentIndex, params.delta);
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "item/reasoning/summaryTextDelta": {
      // 0.160 sends `summaryIndex`; `contentIndex` is the pre-v2 name.
      const summaryIndex =
        getNumber(params, "summaryIndex") ?? getNumber(params, "contentIndex");
      if (
        typeof params?.itemId === "string" &&
        typeof params?.delta === "string" &&
        summaryIndex != null
      ) {
        applyReasoningSummaryDelta(
          state,
          params.itemId,
          summaryIndex,
          params.delta,
        );
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "item/reasoning/summaryPartAdded":
      if (typeof params?.itemId === "string") {
        applyReasoningSummaryPartAdded(
          state,
          params.itemId,
          getNumber(params, "summaryIndex"),
        );
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
    case "item/fileChange/patchUpdated": {
      const existing =
        typeof params?.itemId === "string"
          ? state.items.get(params.itemId)
          : null;
      if (existing?.type === "fileChange" && Array.isArray(params?.changes)) {
        existing.changes = params.changes as unknown[];
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "turn/plan/updated": {
      // 0.160 sends `plan: [{step, status}]`; `steps` is the pre-v2 name.
      const steps = Array.isArray(params?.plan)
        ? params.plan
        : Array.isArray(params?.steps)
          ? params.steps
          : null;
      if (steps) {
        state.planSteps = (steps as Array<Record<string, unknown>>).map(
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
    }
    case "serverRequest/resolved": {
      const requestId = params?.requestId;
      if (
        (typeof requestId === "string" || typeof requestId === "number") &&
        applyServerRequestResolved(state, String(requestId))
      ) {
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "thread/tokenUsage/updated": {
      const usage = applyCodexTokenUsageUpdate(state.tokenUsage, params);
      if (usage) {
        state.usage = usage;
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "model/rerouted": {
      const toModel = getString(params, "toModel");
      if (toModel) {
        state.responseModelId = toModel;
        emitAssistantMessageUpdate(state, runId, "streaming");
      }
      return;
    }
    case "error": {
      const error = getRecord(params?.error);
      log.warn("codex_turn_error", {
        message: getString(error, "message"),
        runId,
        willRetry: params?.willRetry === true,
      });
      return;
    }
    case "turn/completed":
      if (params?.turn && typeof params.turn === "object") {
        const turn = params.turn as CodexTurn;
        for (const item of turn.items ?? []) {
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
      if (!CODEX_IGNORED_NOTIFICATIONS.has(event.method)) {
        log.debug("unhandled_notification", { method: event.method, runId });
      }
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
  /** The thread's instance: its app-server owns the turn. */
  instance?: ResolvedEngineInstance | null,
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
      await getCodexAppServerManager(instance).interruptTurn(
        codexThreadId,
        turnId,
      );
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
  /** The thread's engine instance (the dispatcher resolves it). */
  instance?: ResolvedEngineInstance | null,
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
      persist.upsertMessage(
        request.threadId,
        redactCodexSecretUserInput(latestAssistant),
      );
    }

    let declinedReason: string | null = null;
    if (promptResponse.kind === "user-input") {
      await getCodexAppServerManager(instance).respondToUserInput(
        promptResponse.requestId,
        promptResponse.response,
      );
    } else {
      ({ declinedReason } = await getCodexAppServerManager(
        instance,
      ).respondToApproval(promptResponse.approvalId, promptResponse.decision));
    }

    const activeControl = findActiveCodexRunForThread(request.threadId);
    if (activeControl) {
      applyPromptResponseToMirror(activeControl.mirrorState, promptResponse, {
        declinedReason,
      });
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
      ...(request.modelOptions ? { modelOptions: request.modelOptions } : {}),
      reasoningEffort: request.reasoningEffort ?? null,
    });

    await getCodexAppServerManager(instance).steerTurn({
      expectedTurnId: activeControl.codexTurnId,
      input: codexInput,
      threadId: activeControl.codexThreadId,
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
    instance?.id,
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
  const permissionMode = resolveSupportedPermissionMode(
    await getToolPermissionMode(
      request.userId,
      request.workspaceId,
      request.threadId,
    ),
    DRIVER_CATALOG.codex.capabilities.permissionModes,
  );
  const approvalPolicy = getCodexApprovalPolicy(permissionMode);
  const sandboxMode = getCodexSandboxMode(permissionMode, workspaceRoot);
  const sandboxPolicy = buildCodexSandboxPolicy(sandboxMode, workspaceRoot);
  const codex = getCodexAppServerManager(instance);
  const codexInput = await buildCodexUserInput(request.message);
  // Null under another instance or home: a fresh Codex thread starts.
  const existingCodexState = getCodexThreadState(
    existingThread?.chatEngineState,
    instance,
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
      ...(request.modelOptions ? { modelOptions: request.modelOptions } : {}),
      reasoningEffort: request.reasoningEffort ?? null,
    });
    void beginThreadRepoCheckpointRun({
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

    // Nobody answers an unattended run (an automation): what would ask the
    // user is declined. Full access never asks for command or file changes.
    const unattended: CodexUnattendedRun | null = isUnattendedRun(request)
      ? { decline: (requestId) => codex.declineServerRequest(requestId) }
      : null;
    const unsubscribe = codex.subscribe((event) => {
      void handleCodexServerEvent(event, runId, mirror, unattended);
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

    // `turn/start.collaborationMode` needs the `experimentalApi` capability,
    // which every supported app-server accepts at initialize. A CLI that
    // reports a version below the protocol baseline gets the plan contract as
    // a prompt preamble instead, in a single `turn/start`.
    const nativeCollaborationMode = codex.supportsCollaborationMode();
    const codexReasoningEffort = toCodexReasoningEffort(
      request.reasoningEffort,
    );
    const collaborationMode = nativeCollaborationMode
      ? buildCodexCollaborationMode({
          codex,
          interactionMode: threadMode === "plan" ? "plan" : "default",
          model: request.modelId ?? threadStartResponse.model ?? null,
          effort: codexReasoningEffort,
        })
      : undefined;

    if (!nativeCollaborationMode) {
      log.warn("start_turn_collaboration_mode_unsupported", {
        codexThreadId: threadStartResponse.thread.id,
        serverVersion: codex.getServerVersion(),
        threadId: request.threadId,
      });
    }

    const turnResponse = await codex.startTurn({
      approvalPolicy,
      ...(collaborationMode ? { collaborationMode } : {}),
      cwd: workspaceRoot,
      effort: codexReasoningEffort,
      input:
        !nativeCollaborationMode && threadMode === "plan"
          ? await buildCodexUserInput(request.message, {
              promptPrefix: buildPlanModePromptPreamble(
                "Native Codex collaboration mode is unavailable in this Codex CLI version. Apply the full Plan Mode contract below for this turn instead.",
              ),
            })
          : codexInput,
      model: request.modelId ?? null,
      sandboxPolicy,
      threadId: threadStartResponse.thread.id,
    });

    mirror.codexTurnId = turnResponse.turn.id;
    const control = activeCodexRunControls.get(runId);
    if (control) {
      control.codexTurnId = turnResponse.turn.id;
    }

    if (typeof persist.updateCodexThreadState === "function") {
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
        instance,
      );
    }

    for (const item of turnResponse.turn.items ?? []) {
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
        errorMessage: normalizeThreadChatErrorMessage(
          error,
          "Unable to start Codex.",
        ),
        runId,
        status: "error",
      });
    }
    log.error("codex_start_failed", {
      error: normalizeThreadChatErrorMessage(error, "Unable to start Codex."),
      runId,
      threadId: request.threadId,
      trigger: request.trigger,
      userId: request.userId,
      workspaceId: request.workspaceId,
    });
    throw error;
  }
}
