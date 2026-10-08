import "server-only";

import { generateId } from "ai";
import type {
  Part,
  PermissionRequest,
  QuestionRequest,
} from "@opencode-ai/sdk/v2";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { resolveSupportedPermissionMode } from "@/lib/security";
import {
  buildOpenCodeThreadState,
  openCodeQuestionId,
  parseOpenCodeModelSlug,
  startOpenCodeSession,
  toOpenCodePermissionReply,
  toOpenCodeQuestionAnswers,
  type OpenCodeSession,
} from "@/lib/ai/chat/engines/opencode-sdk";
import { getOpenCodeThreadState } from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import { streamContext } from "@/lib/streams";

import {
  normalizeThreadChatErrorMessage,
  ThreadChatConflictError,
} from "../../errors";
import * as persist from "../../persistence";
import { getThreadCheckpointAnchorMessageId } from "../../repo/checkpoints";
import { loadThreadSessionSnapshot } from "../../session/server";
import type { ThreadChatRequest } from "../../types";
import {
  getFollowUpModelRequestOptions,
  resolveThreadEngineInstance,
} from "../engine-instance";
import {
  createThreadEventChannel,
  type ThreadEventChannel,
} from "../thread-chat/run-state";
import {
  buildActiveThreadMessages,
  buildFirstUserMessageTitle,
  buildModelTranscript,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "../transcript";
import {
  resolveOpenCodePromptResponse,
  resolveOpenCodeSessionError,
  type OpenCodePromptResponse,
} from "./event-helpers";
import {
  beginExternalRuntimeRepoCheckpoint,
  buildExternalRuntimePromptText,
  clearExternalRuntimeRepoCheckpoint,
  finalizeExternalRuntimeRepoCheckpoint,
  shouldAutoApproveExternalPermission,
  shouldAutoDenyExternalPermission,
} from "../external-runtime";
import { getToolPermissionMode, getWorkspaceRootPath } from "../workspace";
import type { PermissionMode } from "@/server/db/enums";
import {
  activeOpenCodeRunControls,
  resolveActiveOpenCodeRunControl,
} from "./state";

type OpenCodeMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type OpenCodeMirrorTool = {
  approval?: {
    approved?: boolean;
    decision?: string;
    id: string;
    reason?: string;
    response?: string;
  };
  errorText?: string;
  id: string;
  input?: unknown;
  name: string;
  order: number;
  output?: unknown;
  state: OpenCodeMirrorToolState;
};

// "summary" marks a compaction summary message (assistant, `summary: true`):
// internal context for OpenCode, never part of the visible answer.
type OpenCodeMessageRole = "assistant" | "summary" | "user";

type OpenCodeMirrorState = {
  assistantId: string;
  messageRoleById: Map<string, OpenCodeMessageRole>;
  nextOrder: number;
  partById: Map<string, Part>;
  reasoningText: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  text: string;
  textOrder: number;
  threadId: string;
  tools: Map<string, OpenCodeMirrorTool>;
};

type PendingOpenCodeApproval = {
  request: PermissionRequest;
};

type PendingOpenCodeQuestion = {
  request: QuestionRequest;
};

// A ContextOverflowError held back until OpenCode shows whether it recovered
// by compacting (a new assistant message appears) or gave up (session.idle).
type DeferredOpenCodeSessionError = {
  knownMessageIds: ReadonlySet<string>;
  message: string;
};

export type ActiveOpenCodeRunControl = {
  abortController: AbortController;
  assistantId: string;
  // Subagent (task tool) sessions spawned under this run's session; their
  // permission and question requests must be answered too or the run hangs.
  childSessionIds: Set<string>;
  deferredSessionError: DeferredOpenCodeSessionError | null;
  eventChannel: ThreadEventChannel;
  finished: boolean;
  /**
   * False in unattended runs (automations): permission requests and
   * questions are declined unless full access approves them.
   */
  interactive?: boolean;
  permissionMode: PermissionMode;
  pendingApprovals: Map<string, PendingOpenCodeApproval>;
  pendingQuestions: Map<string, PendingOpenCodeQuestion>;
  runId: string;
  session: OpenCodeSession;
  state: OpenCodeMirrorState;
  threadId: string;
  toolsEnabled: boolean;
  userId: string;
  workspaceId: string;
};

const log = createLogger("ThreadChatOpenCode");

function logRuntimeTiming(
  phase: "session_start_ready" | "session_start_started",
  startedAt: number,
  context: {
    runId: string;
    threadId: string;
    userId: string;
    workspaceId: string;
  },
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  log.debug(`timing:${phase}`, {
    elapsedMs: Date.now() - startedAt,
    phase,
    ...context,
  });
}

function getNextOrder(state: OpenCodeMirrorState) {
  const order = state.nextOrder;
  state.nextOrder += 1;
  return order;
}

function getToolOrder(state: OpenCodeMirrorState, toolId: string) {
  const existing = state.tools.get(toolId);
  if (existing) return existing.order;
  return getNextOrder(state);
}

function normalizeOpenCodeToolName(toolName: string) {
  return `opencode_${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

function createOpenCodeMirrorState(input: {
  assistantId: string;
  requestedModelId?: string | null;
  sessionId: string;
  threadId: string;
}) {
  return {
    assistantId: input.assistantId,
    messageRoleById: new Map(),
    nextOrder: 0,
    partById: new Map(),
    reasoningText: "",
    requestedModelId: input.requestedModelId ?? null,
    responseModelId: input.requestedModelId ?? null,
    sessionId: input.sessionId,
    text: "",
    textOrder: 0,
    threadId: input.threadId,
    tools: new Map(),
  } satisfies OpenCodeMirrorState;
}

function messageRoleForPart(state: OpenCodeMirrorState, part: Part) {
  return state.messageRoleById.get(part.messageID) ?? null;
}

function resolveOpenCodeMessageRole(info: {
  role?: unknown;
  summary?: unknown;
}): OpenCodeMessageRole {
  if (info.role !== "assistant") return "user";
  return info.summary === true ? "summary" : "assistant";
}

// Reasoning is kept apart from the answer text (it streams through the same
// `message.part.delta` field "text"), like the Claude and Copilot mirrors.
function getMirrorTextField(part: Part): "reasoningText" | "text" | null {
  if (part.type === "text") return "text";
  if (part.type === "reasoning") return "reasoningText";
  return null;
}

function textFromPart(part: Part) {
  if ((part.type === "text" || part.type === "reasoning") && part.text) {
    return part.text;
  }
  return "";
}

function upsertOpenCodeTool(
  state: OpenCodeMirrorState,
  input: Omit<OpenCodeMirrorTool, "order"> & { order?: number },
) {
  const existing = state.tools.get(input.id);
  const order = input.order ?? getToolOrder(state, input.id);

  state.tools.set(input.id, {
    approval: input.approval ?? existing?.approval,
    errorText: input.errorText ?? existing?.errorText,
    id: input.id,
    input: input.input ?? existing?.input,
    name: input.name,
    order,
    output: input.output ?? existing?.output,
    state: input.state,
  });
}

function buildAssistantParts(state: OpenCodeMirrorState) {
  const parts: ThreadUIMessage["parts"] = [];

  if (state.reasoningText.trim()) {
    parts.push({
      text: state.reasoningText.trim(),
      type: "reasoning",
    });
  }

  const orderedTools = [...state.tools.values()].sort(
    (left, right) => left.order - right.order,
  );

  type OrderedItem =
    | { kind: "text"; order: number; text: string }
    | { kind: "tool"; order: number; tool: OpenCodeMirrorTool };

  const items: OrderedItem[] = orderedTools.map((tool) => ({
    kind: "tool",
    order: tool.order,
    tool,
  }));

  if (state.text.trim()) {
    items.push({
      kind: "text",
      order: state.textOrder,
      text: state.text.trim(),
    });
  }

  items.sort((a, b) => a.order - b.order);

  for (const item of items) {
    if (item.kind === "text") {
      parts.push({ text: item.text, type: "text" });
      continue;
    }

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

  return parts.length > 0 ? parts : [{ text: " ", type: "text" as const }];
}

async function emitAssistantMessageUpdate(
  state: OpenCodeMirrorState,
  runId: string,
  status: "pending" | "streaming" | "completed" | "error" | "cancelled",
  finishReason?: string | null,
  errorMessage?: string | null,
  eventChannel?: ThreadEventChannel | null,
  options?: { repoCheckpointId?: string | null },
) {
  const message = persist.upsertMessage(state.threadId, {
    id: state.assistantId,
    metadata: {
      branchId: state.assistantId,
      ...(errorMessage ? { errorMessage } : {}),
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
      statusLabel: null,
    },
    parts: buildAssistantParts(state),
    role: "assistant",
  });

  eventChannel?.emit({
    message,
    runId,
    type: "message.upsert",
  });
  eventChannel?.emit({
    messageId: message.id,
    runId,
    status: message.metadata?.status,
    type: "message.status",
  });

  return message;
}

async function emitThreadSnapshot(
  threadId: string,
  eventChannel: ThreadEventChannel,
  runId?: string,
) {
  const snapshot = await loadThreadSessionSnapshot(threadId);
  if (!snapshot) return null;

  eventChannel.emit({ snapshot, type: "thread.snapshot" });
  if (runId) {
    eventChannel.emit({
      queuedFollowUps: snapshot.queuedFollowUps,
      runId,
      type: "queue.snapshot",
    });
  }
  return snapshot;
}

async function drainQueuedOpenCodeFollowUp(
  request: Pick<ThreadChatRequest, "threadId" | "userId" | "workspaceId">,
) {
  const thread = await persist.loadThread(request.threadId);
  if (!thread) return;
  if (thread.activeStreamId || thread.status === "streaming") return;
  if (thread.status === "awaiting_approval") return;

  persist.resetProcessingThreadFollowUps(request.threadId);
  const nextFollowUp = persist.claimNextThreadFollowUp(request.threadId);
  if (!nextFollowUp) return;

  try {
    await runOpenCodeThreadChat(
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

async function finishOpenCodeRun(
  control: ActiveOpenCodeRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "cancelled" | "completed" | "error";
    threadStatus: "idle" | "streaming" | "awaiting_approval";
  },
) {
  if (control.finished) return;

  control.finished = true;
  const errorMessage =
    input.status === "error"
      ? normalizeThreadChatErrorMessage(
          input.errorMessage,
          "OpenCode run failed.",
        )
      : (input.errorMessage ?? null);
  const repoCheckpointId =
    input.status === "completed" && input.threadStatus === "idle"
      ? await finalizeExternalRuntimeRepoCheckpoint({
          assistantMessageId: control.assistantId,
          runId: control.runId,
          threadId: control.threadId,
        })
      : (await clearExternalRuntimeRepoCheckpoint(control.runId), null);
  control.abortController.abort();
  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, input.threadStatus);
  await emitAssistantMessageUpdate(
    control.state,
    control.runId,
    input.status,
    input.finishReason,
    errorMessage,
    control.eventChannel,
    { repoCheckpointId },
  );
  await emitThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  );

  if (input.status === "cancelled") {
    control.eventChannel.emit({
      messageId: control.assistantId,
      runId: control.runId,
      threadStatus: input.threadStatus,
      type: "run.cancelled",
    });
  } else if (input.status === "error") {
    log.error("opencode_run_failed", {
      error: errorMessage,
      runId: control.runId,
      threadId: control.threadId,
      userId: control.userId,
      workspaceId: control.workspaceId,
    });
    control.eventChannel.emit({
      error: errorMessage ?? "OpenCode run failed.",
      messageId: control.assistantId,
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
  activeOpenCodeRunControls.delete(control.runId);
  control.session.server.close();

  if (input.threadStatus === "idle") {
    await drainQueuedOpenCodeFollowUp({
      threadId: control.threadId,
      userId: control.userId,
      workspaceId: control.workspaceId,
    });
  }
}

function getEventSessionId(event: unknown) {
  if (!event || typeof event !== "object" || !("properties" in event)) {
    return null;
  }
  const properties = (event as { properties?: unknown }).properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    !("sessionID" in properties)
  ) {
    return null;
  }
  const sessionID = (properties as { sessionID?: unknown }).sessionID;
  return typeof sessionID === "string" ? sessionID : null;
}

function getToolState(part: Extract<Part, { type: "tool" }>) {
  if (part.state.status === "error") return "output-error";
  if (part.state.status === "completed") return "output-available";
  if (part.state.status === "running") return "input-streaming";
  return "input-available";
}

function updateToolFromPart(
  state: OpenCodeMirrorState,
  part: Extract<Part, { type: "tool" }>,
) {
  const id = part.callID || part.id;
  upsertOpenCodeTool(state, {
    errorText: part.state.status === "error" ? part.state.error : undefined,
    id,
    input: "input" in part.state ? part.state.input : undefined,
    name: normalizeOpenCodeToolName(part.tool),
    output: part.state.status === "completed" ? part.state.output : undefined,
    state: getToolState(part),
  });
}

// Only requests are taken from subagent sessions: their messages, idle and
// errors belong to the task tool call the parent session is already showing.
const OPENCODE_CHILD_SESSION_EVENT_TYPES = new Set([
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.rejected",
  "question.replied",
]);

// The task tool creates subagent sessions with `parentID` set (opencode
// 1.18.35 tool/task.ts). Adapted from t3code OpenCodeAdapterV2.ts
// (relatedSessionOwners, MIT), which routes their requests to the parent.
function trackOpenCodeChildSession(
  control: ActiveOpenCodeRunControl,
  event: any,
) {
  const info = event?.properties?.info;
  if (typeof info?.id !== "string" || typeof info.parentID !== "string") {
    return;
  }
  if (
    info.parentID === control.session.sessionId ||
    control.childSessionIds.has(info.parentID)
  ) {
    control.childSessionIds.add(info.id);
  }
}

function isOpenCodeEventForRun(control: ActiveOpenCodeRunControl, event: any) {
  const sessionId = getEventSessionId(event);
  if (sessionId === control.session.sessionId) return true;
  return (
    sessionId !== null &&
    control.childSessionIds.has(sessionId) &&
    OPENCODE_CHILD_SESSION_EVENT_TYPES.has(event?.type)
  );
}

async function handleOpenCodeEvent(
  control: ActiveOpenCodeRunControl,
  event: any,
) {
  if (event?.type === "session.created" || event?.type === "session.updated") {
    trackOpenCodeChildSession(control, event);
    return;
  }

  if (!isOpenCodeEventForRun(control, event)) {
    return;
  }

  switch (event.type) {
    case "message.updated": {
      const role = resolveOpenCodeMessageRole(event.properties.info);
      control.state.messageRoleById.set(event.properties.info.id, role);
      if (role !== "assistant") break;
      // A new assistant message after a ContextOverflowError means OpenCode
      // compacted the session and carried on, so the error was not final.
      if (
        control.deferredSessionError &&
        !control.deferredSessionError.knownMessageIds.has(
          event.properties.info.id,
        )
      ) {
        control.deferredSessionError = null;
      }
      for (const part of control.state.partById.values()) {
        if (part.messageID === event.properties.info.id) {
          const field = getMirrorTextField(part);
          const text = textFromPart(part);
          if (field && text) {
            control.state[field] = text;
            await emitAssistantMessageUpdate(
              control.state,
              control.runId,
              "streaming",
              null,
              null,
              control.eventChannel,
            );
          }
        }
      }
      break;
    }
    case "message.removed": {
      control.state.messageRoleById.delete(event.properties.messageID);
      break;
    }
    case "message.part.delta": {
      const existingPart = control.state.partById.get(event.properties.partID);
      const role =
        event.properties.messageID &&
        control.state.messageRoleById.get(event.properties.messageID);
      if (
        role !== "assistant" &&
        (!existingPart ||
          messageRoleForPart(control.state, existingPart) !== "assistant")
      ) {
        break;
      }
      // A delta for a part we have not seen is assumed to be answer text;
      // OpenCode announces reasoning parts (reasoning-start) before their
      // deltas, so those are known by the time the deltas arrive.
      const field = existingPart ? getMirrorTextField(existingPart) : "text";
      if (!field) {
        break;
      }
      if (
        !existingPart &&
        event.properties.field !== "text" &&
        event.properties.field !== "message"
      ) {
        break;
      }
      const delta = String(event.properties.delta ?? "");
      if (!delta) break;
      control.state[field] += delta;
      if (!existingPart) {
        control.state.partById.set(event.properties.partID, {
          id: event.properties.partID,
          messageID: event.properties.messageID,
          sessionID: event.properties.sessionID,
          text: control.state.text,
          type: "text",
        });
      }
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      break;
    }
    case "message.part.updated": {
      const part = event.properties.part as Part;
      control.state.partById.set(part.id, part);
      const role = messageRoleForPart(control.state, part);
      const field = getMirrorTextField(part);
      if (role === "assistant" && field) {
        const text = textFromPart(part);
        if (text && text.length >= control.state[field].length) {
          control.state[field] = text;
        }
      }
      if (part.type === "tool") {
        updateToolFromPart(control.state, part);
      }
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      break;
    }
    case "permission.asked": {
      const request = event.properties as PermissionRequest;
      const shouldAutoApprove = shouldAutoApproveExternalPermission({
        permissionMode: control.permissionMode,
        toolsEnabled: control.toolsEnabled,
      });
      const shouldAutoDeny = shouldAutoDenyExternalPermission({
        interactive: control.interactive,
        toolsEnabled: control.toolsEnabled,
      });
      if (shouldAutoApprove || shouldAutoDeny) {
        // Full access approves even when nobody could be asked.
        const approved = shouldAutoApprove;
        upsertOpenCodeTool(control.state, {
          approval: {
            approved,
            decision: approved ? "accept" : "decline",
            id: request.id,
            reason:
              request.patterns.length > 0
                ? request.patterns.join("\n")
                : request.permission,
          },
          id: request.id,
          input: request.metadata,
          name: normalizeOpenCodeToolName(request.permission || "permission"),
          state: approved ? "approval-responded" : "output-denied",
        });
        await control.session.client.permission.reply({
          reply: toOpenCodePermissionReply(approved),
          requestID: request.id,
        });
        persist.setThreadStatus(control.threadId, "streaming");
        await emitAssistantMessageUpdate(
          control.state,
          control.runId,
          "streaming",
          null,
          null,
          control.eventChannel,
        );
        break;
      }
      control.pendingApprovals.set(request.id, { request });
      upsertOpenCodeTool(control.state, {
        approval: {
          id: request.id,
          reason:
            request.patterns.length > 0
              ? request.patterns.join("\n")
              : request.permission,
        },
        id: request.id,
        input: request.metadata,
        name: normalizeOpenCodeToolName(request.permission || "permission"),
        state: "approval-requested",
      });
      persist.setThreadStatus(control.threadId, "awaiting_approval");
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      await emitThreadSnapshot(
        control.threadId,
        control.eventChannel,
        control.runId,
      );
      break;
    }
    case "permission.replied": {
      control.pendingApprovals.delete(event.properties.requestID);
      const approved = event.properties.reply !== "reject";
      upsertOpenCodeTool(control.state, {
        approval: {
          approved,
          decision: approved ? "accept" : "decline",
          id: event.properties.requestID,
        },
        id: event.properties.requestID,
        name:
          control.state.tools.get(event.properties.requestID)?.name ??
          "opencode_permission",
        state: approved ? "approval-responded" : "output-denied",
      });
      persist.setThreadStatus(control.threadId, "streaming");
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      break;
    }
    case "question.asked": {
      const request = event.properties as QuestionRequest;
      if (!control.toolsEnabled || control.interactive === false) {
        const firstQuestion = request.questions[0];
        upsertOpenCodeTool(control.state, {
          approval: {
            id: request.id,
            reason: firstQuestion?.question ?? "OpenCode requested input.",
          },
          id: request.id,
          input: {
            questions: request.questions.map((question, index) => ({
              header: question.header,
              id: openCodeQuestionId(index, question),
              options: question.options,
              question: question.question,
            })),
          },
          name: "opencode_ask_question",
          state: "output-denied",
        });
        // POST /question/{requestID}/reject shipped with question.asked
        // (1.1.7), so any server that asks also takes the rejection; the old
        // reply-with-no-answers fallback is gone.
        await control.session.client.question.reject({
          requestID: request.id,
        });
        persist.setThreadStatus(control.threadId, "streaming");
        await emitAssistantMessageUpdate(
          control.state,
          control.runId,
          "streaming",
          null,
          null,
          control.eventChannel,
        );
        break;
      }
      control.pendingQuestions.set(request.id, { request });
      const firstQuestion = request.questions[0];
      upsertOpenCodeTool(control.state, {
        approval: {
          id: request.id,
          reason: firstQuestion?.question ?? "OpenCode is requesting input.",
        },
        id: request.id,
        input: {
          questions: request.questions.map((question, index) => ({
            header: question.header,
            id: openCodeQuestionId(index, question),
            options: question.options,
            question: question.question,
          })),
        },
        name: "opencode_ask_question",
        state: "approval-requested",
      });
      persist.setThreadStatus(control.threadId, "awaiting_approval");
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      await emitThreadSnapshot(
        control.threadId,
        control.eventChannel,
        control.runId,
      );
      break;
    }
    case "question.replied": {
      control.pendingQuestions.delete(event.properties.requestID);
      upsertOpenCodeTool(control.state, {
        approval: {
          id: event.properties.requestID,
          response: (event.properties.answers ?? []).flat().join(", "),
        },
        id: event.properties.requestID,
        name: "opencode_ask_question",
        state: "input-available",
      });
      persist.setThreadStatus(control.threadId, "streaming");
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      break;
    }
    case "question.rejected": {
      control.pendingQuestions.delete(event.properties.requestID);
      upsertOpenCodeTool(control.state, {
        approval: {
          id: event.properties.requestID,
          response: "",
        },
        id: event.properties.requestID,
        name: "opencode_ask_question",
        state: "output-denied",
      });
      persist.setThreadStatus(control.threadId, "streaming");
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
        null,
        null,
        control.eventChannel,
      );
      break;
    }
    case "session.idle": {
      if (
        control.pendingApprovals.size === 0 &&
        control.pendingQuestions.size === 0
      ) {
        const deferredError = control.deferredSessionError;
        await finishOpenCodeRun(
          control,
          deferredError
            ? {
                errorMessage: deferredError.message,
                finishReason: null,
                status: "error",
                threadStatus: "idle",
              }
            : {
                finishReason: "stop",
                status: "completed",
                threadStatus: "idle",
              },
        );
      }
      break;
    }
    case "session.error": {
      const sessionError = resolveOpenCodeSessionError(event.properties);
      if (sessionError.contextOverflow) {
        // Keep the server alive: closing it here would kill the compaction
        // OpenCode has just started. session.idle settles the outcome.
        control.deferredSessionError = {
          knownMessageIds: new Set(control.state.messageRoleById.keys()),
          message: sessionError.message,
        };
        break;
      }
      await finishOpenCodeRun(
        control,
        sessionError.aborted
          ? {
              errorMessage: "Generation stopped.",
              finishReason: null,
              status: "cancelled",
              threadStatus: "idle",
            }
          : {
              errorMessage: sessionError.message,
              finishReason: null,
              status: "error",
              threadStatus: "idle",
            },
      );
      break;
    }
  }
}

function isOpenCodeRunSettled(control: ActiveOpenCodeRunControl) {
  return control.finished || control.abortController.signal.aborted;
}

// Without this a crashed server leaves the thread "streaming" forever: the
// SDK's SSE reader retries a dead connection indefinitely.
function watchOpenCodeServerExit(control: ActiveOpenCodeRunControl) {
  void control.session.server.exited.then(async ({ code, signal }) => {
    if (isOpenCodeRunSettled(control)) return;
    await finishOpenCodeRun(control, {
      errorMessage: `OpenCode server exited unexpectedly (${
        signal ?? `code ${code ?? "unknown"}`
      }).`,
      finishReason: null,
      status: "error",
      threadStatus: "idle",
    });
  });
}

async function startOpenCodeEventPump(control: ActiveOpenCodeRunControl) {
  try {
    const subscription = await control.session.client.event.subscribe(
      undefined,
      {
        signal: control.abortController.signal,
      },
    );
    void (async () => {
      try {
        for await (const event of subscription.stream) {
          if (control.finished) return;
          await handleOpenCodeEvent(control, event);
        }
        // The SDK ends the stream when the server closes it (for example on
        // `server.instance.disposed`); no session.idle can follow after that.
        if (isOpenCodeRunSettled(control)) return;
        await finishOpenCodeRun(control, {
          errorMessage: "OpenCode event stream ended unexpectedly.",
          finishReason: null,
          status: "error",
          threadStatus: "idle",
        });
      } catch (error) {
        if (control.finished || control.abortController.signal.aborted) return;
        await finishOpenCodeRun(control, {
          errorMessage: error instanceof Error ? error.message : String(error),
          finishReason: null,
          status: "error",
          threadStatus: "idle",
        });
      }
    })();
  } catch (error) {
    if (control.finished || control.abortController.signal.aborted) return;
    await finishOpenCodeRun(control, {
      errorMessage: error instanceof Error ? error.message : String(error),
      finishReason: null,
      status: "error",
      threadStatus: "idle",
    });
  }
}

async function applyOpenCodePromptResponse(
  control: ActiveOpenCodeRunControl,
  response: OpenCodePromptResponse,
) {
  if (response.kind === "user-input") {
    const pendingQuestion = control.pendingQuestions.get(response.approvalId);
    if (!pendingQuestion) return false;

    control.pendingQuestions.delete(response.approvalId);
    upsertOpenCodeTool(control.state, {
      approval: {
        id: response.approvalId,
        response: response.response,
      },
      id: response.approvalId,
      name: "opencode_ask_question",
      state: "input-available",
    });
    await control.session.client.question.reply({
      answers: toOpenCodeQuestionAnswers(
        pendingQuestion.request,
        response.response,
      ),
      requestID: response.approvalId,
    });
    await emitAssistantMessageUpdate(
      control.state,
      control.runId,
      "streaming",
      null,
      null,
      control.eventChannel,
    );
    return true;
  }

  const pendingApproval = control.pendingApprovals.get(response.approvalId);
  if (!pendingApproval) return false;

  control.pendingApprovals.delete(response.approvalId);
  const approved = response.approved !== false;
  upsertOpenCodeTool(control.state, {
    approval: {
      approved,
      ...(response.decision ? { decision: response.decision } : {}),
      id: response.approvalId,
      ...(response.reason ? { reason: response.reason } : {}),
      ...(response.response ? { response: response.response } : {}),
    },
    id: response.approvalId,
    name:
      control.state.tools.get(response.approvalId)?.name ??
      "opencode_permission",
    state: approved ? "approval-responded" : "output-denied",
  });
  await control.session.client.permission.reply({
    reply: toOpenCodePermissionReply(approved),
    requestID: response.approvalId,
  });
  await emitAssistantMessageUpdate(
    control.state,
    control.runId,
    "streaming",
    null,
    null,
    control.eventChannel,
  );
  return true;
}

export async function stopOpenCodeThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const activeControl = resolveActiveOpenCodeRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });

  if (!activeControl) {
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    return new Response(null, { status: 204 });
  }

  await activeControl.session.client.session
    .abort({ sessionID: activeControl.session.sessionId })
    .catch(() => undefined);
  await finishOpenCodeRun(activeControl, {
    errorMessage: "Generation stopped.",
    finishReason: null,
    status: "cancelled",
    threadStatus: "idle",
  });

  return new Response(null, { status: 204 });
}

export async function runOpenCodeThreadChat(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
  /** The thread's engine instance (the dispatcher resolves it). */
  instance?: ResolvedEngineInstance | null,
) {
  const timingStartedAt = Date.now();

  if (request.trigger === "submit-tool-approval") {
    const latestAssistant = request.messages
      ? [...request.messages]
          .reverse()
          .find((message) => message.role === "assistant")
      : null;
    if (latestAssistant) {
      persist.upsertMessage(request.threadId, latestAssistant);
    }

    const activeControl = resolveActiveOpenCodeRunControl({
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
    const response = resolveOpenCodePromptResponse({
      messages: request.messages,
      pendingKind,
      toolApprovalResponse: request.toolApprovalResponse,
    });

    if (!response || !activeControl) {
      if (
        existingThread?.activeStreamId ||
        existingThread?.status === "awaiting_approval"
      ) {
        persist.clearActiveStream(request.threadId);
        persist.setThreadStatus(request.threadId, "idle");
      }

      throw new ThreadChatConflictError(
        "That OpenCode approval request is no longer active.",
      );
    }

    const applied = await applyOpenCodePromptResponse(activeControl, response);
    if (!applied) {
      throw new ThreadChatConflictError(
        "That OpenCode approval request is no longer active.",
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
      `The OpenCode engine does not support "${request.trigger}" yet.`,
    );
  }

  const workspaceRoot =
    (await getWorkspaceRootPath(
      request.workspaceId,
      request.userId,
      request.threadId,
    )) ?? process.cwd();
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
  const fallbackTitle = buildFirstUserMessageTitle(
    getFirstUserText(request.message ? [request.message] : []),
  );
  const modelTranscript = buildModelTranscript(request, transcript, allRecords);

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    "opencode",
    request.draftRepoState ? { repo: request.draftRepoState } : null,
    instance?.id,
  );

  if (request.message) {
    const userMessage: ThreadUIMessage = {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        isActive: true,
        parentMessageId: userParentMessageId,
        status: "completed",
      }),
    };
    persist.upsertMessage(request.threadId, userMessage);
  }

  const parsedModel = parseOpenCodeModelSlug(request.modelId);
  if (!parsedModel) {
    throw new Error("OpenCode models must use the provider/model format.");
  }

  const runId = generateId();
  const assistantId = generateId();
  const eventChannel = await createThreadEventChannel(runId);
  const placeholder: ThreadUIMessage = {
    id: assistantId,
    metadata: {
      branchId: assistantId,
      isActive: true,
      parentMessageId: assistantParentMessageId,
      runId,
      status: "pending",
      statusLabel: "Starting OpenCode session...",
    },
    parts: [{ text: " ", type: "text" }],
    role: "assistant",
  };

  persist.upsertMessage(request.threadId, placeholder);
  persist.setActiveStream(request.threadId, runId);
  persist.setThreadStatus(request.threadId, "streaming");
  await persist.updateThreadChatSettings(request.threadId, {
    engine: "opencode",
    modelId: request.modelId ?? null,
    mode: threadMode,
    ...(request.modelOptions ? { modelOptions: request.modelOptions } : {}),
    reasoningEffort: null,
  });
  await emitThreadSnapshot(request.threadId, eventChannel, runId);
  eventChannel.emit({ message: placeholder, runId, type: "message.upsert" });
  eventChannel.emit({ runId, type: "run.started" });
  logRuntimeTiming("session_start_started", timingStartedAt, {
    runId,
    threadId: request.threadId,
    userId: request.userId,
    workspaceId: request.workspaceId,
  });

  void beginExternalRuntimeRepoCheckpoint({
    projectPath: workspaceRoot,
    runId,
    thread: existingThread,
  });
  const toolsEnabled = request.toolsEnabled !== false;
  const existingOpenCodeState = getOpenCodeThreadState(
    existingThread?.chatEngineState,
    instance,
  );
  const selectedAgent =
    request.openCode?.agent ??
    existingOpenCodeState?.selectedAgent ??
    (threadMode === "plan" ? "plan" : null);
  const selectedVariant =
    request.openCode?.variant ?? existingOpenCodeState?.selectedVariant ?? null;
  let permissionMode: PermissionMode;
  let session: OpenCodeSession;
  try {
    permissionMode = resolveSupportedPermissionMode(
      await getToolPermissionMode(
        request.userId,
        request.workspaceId,
        request.threadId,
      ),
      DRIVER_CATALOG.opencode.capabilities.permissionModes,
    );
    session = await startOpenCodeSession({
      cwd: workspaceRoot,
      fullAccess: permissionMode === "full" && toolsEnabled,
      instance: instance ?? null,
      title: fallbackTitle,
    });
  } catch (error) {
    await clearExternalRuntimeRepoCheckpoint(runId);
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    eventChannel.close();
    throw error;
  }
  logRuntimeTiming("session_start_ready", timingStartedAt, {
    runId,
    threadId: request.threadId,
    userId: request.userId,
    workspaceId: request.workspaceId,
  });
  const state = createOpenCodeMirrorState({
    assistantId,
    requestedModelId: request.modelId,
    sessionId: session.sessionId,
    threadId: request.threadId,
  });
  const abortController = new AbortController();
  const control: ActiveOpenCodeRunControl = {
    abortController,
    assistantId,
    childSessionIds: new Set(),
    deferredSessionError: null,
    eventChannel,
    finished: false,
    interactive: request.interactive !== false,
    permissionMode,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    runId,
    session,
    state,
    threadId: request.threadId,
    toolsEnabled,
    userId: request.userId,
    workspaceId: request.workspaceId,
  };
  activeOpenCodeRunControls.set(runId, control);

  persist.updateOpenCodeThreadState(
    request.threadId,
    buildOpenCodeThreadState({
      cwd: workspaceRoot,
      modelId: request.modelId ?? null,
      selectedAgent,
      selectedVariant,
      sessionId: session.sessionId,
    }),
    instance,
  );

  watchOpenCodeServerExit(control);
  await startOpenCodeEventPump(control);

  const promptText = buildExternalRuntimePromptText({
    message:
      request.message ??
      ({
        id: request.threadId,
        metadata: {},
        parts: [{ text: "", type: "text" }],
        role: "user",
      } satisfies ThreadUIMessage),
    threadMode,
    transcript: modelTranscript,
    workspaceRoot,
  });

  const promptInput = {
    ...(selectedAgent ? { agent: selectedAgent } : {}),
    model: parsedModel,
    parts: [{ text: promptText, type: "text" as const }],
    sessionID: session.sessionId,
    ...(selectedVariant ? { variant: selectedVariant } : {}),
  };

  try {
    const promptPromise = session.client.session.promptAsync(promptInput);
    void Promise.resolve(promptPromise).catch(async (error) => {
      await finishOpenCodeRun(control, {
        errorMessage: error instanceof Error ? error.message : String(error),
        finishReason: null,
        status: "error",
        threadStatus: "idle",
      });
    });
  } catch (error) {
    void finishOpenCodeRun(control, {
      errorMessage: error instanceof Error ? error.message : String(error),
      finishReason: null,
      status: "error",
      threadStatus: "idle",
    });
  }

  return new Response(await streamContext.resumeExistingStream(runId), {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
