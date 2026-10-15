import "server-only";

import { pathToFileURL } from "node:url";

import { generateId } from "ai";

import { DRIVER_CATALOG } from "@/lib/ai/chat/engines/catalog";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  buildOpenCodeThreadState,
  parseOpenCodeModelSlug,
  startOpenCodeSession,
  type OpenCodePermissionReply,
  type OpenCodePromptFile,
  type OpenCodeRunEvent,
  type OpenCodeTurnSession,
} from "@/lib/ai/chat/engines/opencode-sdk";
import type { OpenCodeThreadState } from "@/lib/ai/chat/engines/state/opencode";
import { getOpenCodeThreadState } from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import { resolveSupportedPermissionMode } from "@/lib/security";
import { streamContext } from "@/lib/streams";
import type { PermissionMode } from "@/server/db/enums";

import {
  normalizeThreadChatErrorMessage,
  ThreadChatConflictError,
} from "../../errors";
import * as persist from "../../persistence";
import { getThreadCheckpointAnchorMessageId } from "../../repo/checkpoints";
import { loadThreadSessionSnapshot } from "../../session/server";
import type { ThreadChatRequest } from "../../types";
import { MISSED_TURNS_HEADING, planAcpHistory } from "../acp/history";
import { loadAttachment } from "../acp/prompt";
import {
  getFollowUpModelRequestOptions,
  resolveThreadEngineInstance,
} from "../engine-instance";
import { createMirrorEmitter, type MirrorEmitter } from "../external/emitter";
import {
  loadForwardedMcpServers,
  logSkippedMcpServers,
} from "../external/mcp-servers";
import {
  buildQuestionInput,
  parseQuestionResponse,
  type ExternalQuestion,
} from "../external/user-input";
import {
  beginExternalRuntimeRepoCheckpoint,
  buildExternalRuntimePromptText,
  clearExternalRuntimeRepoCheckpoint,
  finalizeExternalRuntimeRepoCheckpoint,
  shouldAutoApproveExternalPermission,
  shouldAutoDenyExternalPermission,
} from "../external-runtime";
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
import { UNATTENDED_DECLINE_MESSAGE } from "../unattended";
import { getToolPermissionMode, getWorkspaceRootPath } from "../workspace";
import {
  resolveOpenCodePromptResponse,
  type OpenCodePromptResponse,
} from "./event-helpers";
import {
  createOpenCodeMirror,
  normalizeOpenCodeToolName,
  type OpenCodeMirror,
} from "./mirror";
import {
  activeOpenCodeRunControls,
  resolveActiveOpenCodeRunControl,
} from "./state";

// One OpenCode turn (design acp-and-agents §5). The instance's long-lived
// `opencode serve` (engines/opencode-sdk/server-pool.ts) holds the thread's
// session between turns:
// - a persisted session of the same generation that still holds the
//   thread's last answered turn is prompted directly, with only the turns
//   it missed (another engine answered) and no transcript replay;
// - otherwise a new session gets the whole transcript.
// Events of both generations arrive normalized (OpenCodeRunEvent). A 1.x
// turn ends on `session.idle`, a 2.x one on `session.execution.*`.

type PendingOpenCodeApproval = {
  /** Mirror entry (the asking tool call, or the request itself). */
  key: string;
  sessionId: string;
};

type PendingOpenCodeQuestion = {
  key: string;
  questions: ExternalQuestion[];
  sessionId: string;
};

// A ContextOverflowError (1.x) held back until OpenCode shows whether it
// recovered by compacting (a new assistant message appears) or gave up
// (session.idle).
type DeferredOpenCodeSessionError = {
  knownMessageIds: ReadonlySet<string>;
  message: string;
};

export type ActiveOpenCodeRunControl = {
  abortController: AbortController;
  assistantId: string;
  baseState: OpenCodeThreadState;
  // Subagent (task tool) sessions spawned under this run's session; their
  // permission and question requests must be answered too or the run hangs.
  childSessionIds: Set<string>;
  deferredSessionError: DeferredOpenCodeSessionError | null;
  emitter: MirrorEmitter;
  eventChannel: ThreadEventChannel;
  /** 2.x: the execution failed with this message (step.failed). */
  executionError: string | null;
  /**
   * 2.x: this turn's `session.execution.started` arrived. Until then an
   * end event on the reused session is a late one of the execution before
   * (`session.interrupt` returns before it is published).
   */
  executionStarted: boolean;
  finished: boolean;
  instance: ResolvedEngineInstance | null;
  /**
   * False in unattended runs (automations): permission requests and
   * questions are declined unless full access approves them.
   */
  interactive?: boolean;
  /** 2.x: a step ended as interrupted. */
  interrupted: boolean;
  knownMessageIds: Set<string>;
  mirror: OpenCodeMirror;
  permissionMode: PermissionMode;
  pendingApprovals: Map<string, PendingOpenCodeApproval>;
  pendingQuestions: Map<string, PendingOpenCodeQuestion>;
  requestedModelId: string | null;
  runId: string;
  session: OpenCodeTurnSession;
  threadId: string;
  toolsEnabled: boolean;
  userId: string;
  workspaceId: string;
};

const log = createLogger("ThreadChatOpenCode");

const STOPPED_MESSAGE = "Generation stopped.";

/** How long a turn that ends early waits for OpenCode to stop its run. */
const OPENCODE_ABORT_TIMEOUT_MS = 5_000;

function persistAssistantMessage(
  control: Pick<
    ActiveOpenCodeRunControl,
    "assistantId" | "mirror" | "requestedModelId" | "runId" | "threadId"
  >,
  status: "cancelled" | "completed" | "error" | "pending" | "streaming",
  extra: {
    errorMessage?: string | null;
    finishReason?: string | null;
    repoCheckpointId?: string | null;
  } = {},
) {
  const usage = control.mirror.usageMetadata();
  return persist.upsertMessage(control.threadId, {
    id: control.assistantId,
    metadata: {
      branchId: control.assistantId,
      ...(extra.errorMessage ? { errorMessage: extra.errorMessage } : {}),
      ...(extra.finishReason ? { finishReason: extra.finishReason } : {}),
      isActive: true,
      model: {
        requestedModelId: control.requestedModelId ?? undefined,
        responseModelId:
          control.mirror.getResponseModelId() ??
          control.requestedModelId ??
          undefined,
      },
      ...(extra.repoCheckpointId
        ? { repoCheckpointId: extra.repoCheckpointId }
        : {}),
      runId: control.runId,
      status,
      statusLabel: null,
      ...(usage ? { usage } : {}),
    },
    parts: control.mirror.toParts({ streaming: status === "streaming" }),
    role: "assistant",
  });
}

function emitMessage(
  eventChannel: ThreadEventChannel,
  runId: string,
  message: ThreadUIMessage,
) {
  eventChannel.emit({ message, runId, type: "message.upsert" });
  eventChannel.emit({
    messageId: message.id,
    runId,
    status: message.metadata?.status,
    type: "message.status",
  });
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

function writeThreadState(
  control: Pick<ActiveOpenCodeRunControl, "instance" | "threadId">,
  state: OpenCodeThreadState,
) {
  persist.updateOpenCodeThreadState(
    control.threadId,
    buildOpenCodeThreadState(state),
    control.instance,
  );
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

/**
 * Stops the session's execution when the turn ends before OpenCode said it
 * did (Stop, a dropped or silent event stream, a failed prompt): the pooled
 * server outlives the turn, so a run left going would keep using tools and
 * settle the next turn. A server that does not answer is ended.
 */
async function stopOpenCodeExecution(control: ActiveOpenCodeRunControl) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    control.session.abort().then(
      () => "stopped" as const,
      (error: unknown) =>
        error instanceof Error ? error.message : String(error),
    ),
    new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), OPENCODE_ABORT_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (outcome === "stopped") return;
  log.warn("opencode_abort_failed", {
    error: outcome,
    runId: control.runId,
    threadId: control.threadId,
  });
  await control.session.discardServer().catch(() => undefined);
}

async function finishOpenCodeRun(
  control: ActiveOpenCodeRunControl,
  input: {
    errorMessage?: string | null;
    /** OpenCode reported the run over (or its server is gone). */
    executionEnded?: boolean;
    finishReason?: string | null;
    status: "cancelled" | "completed" | "error";
  },
) {
  if (control.finished) return;

  control.finished = true;
  control.emitter.close();
  const errorMessage =
    input.status === "error"
      ? normalizeThreadChatErrorMessage(
          input.errorMessage,
          "OpenCode run failed.",
        )
      : (input.errorMessage ?? null);
  control.mirror.finishDanglingTools(
    input.status === "cancelled" ? STOPPED_MESSAGE : "Tool did not finish.",
  );
  const repoCheckpointId =
    input.status === "completed"
      ? await finalizeExternalRuntimeRepoCheckpoint({
          assistantMessageId: control.assistantId,
          runId: control.runId,
          threadId: control.threadId,
        })
      : (await clearExternalRuntimeRepoCheckpoint(control.runId), null);
  try {
    // Ends the event stream; a fetch reader can rethrow the abort here.
    control.abortController.abort();
  } catch {
    // Already ended.
  }
  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, "idle");
  emitMessage(
    control.eventChannel,
    control.runId,
    persistAssistantMessage(control, input.status, {
      errorMessage,
      finishReason: input.finishReason,
      repoCheckpointId,
    }),
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
      threadStatus: "idle",
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
      threadStatus: "idle",
      type: "run.failed",
    });
  } else {
    control.eventChannel.emit({
      runId: control.runId,
      threadStatus: "idle",
      type: "run.finished",
    });
  }

  control.eventChannel.close();
  activeOpenCodeRunControls.delete(control.runId);
  if (input.status !== "completed" && !input.executionEnded) {
    await stopOpenCodeExecution(control);
  }
  // The server stays up for the thread's next turn; only the plan agent a
  // 2.x turn switched to is put back.
  await control.session.finishTurn().catch(() => undefined);
  control.session.release();

  await drainQueuedOpenCodeFollowUp({
    threadId: control.threadId,
    userId: control.userId,
    workspaceId: control.workspaceId,
  });
}

function isOpenCodeRunSettled(control: ActiveOpenCodeRunControl) {
  return control.finished || control.abortController.signal.aborted;
}

function eventSessionId(event: OpenCodeRunEvent) {
  return "sessionId" in event ? event.sessionId : null;
}

// Only requests are taken from subagent sessions: their messages, idle and
// errors belong to the task tool call the parent session is already showing.
const CHILD_SESSION_EVENT_TYPES = new Set<OpenCodeRunEvent["type"]>([
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.settled",
]);

// The task tool creates subagent sessions with `parentID` set. Adapted from
// t3code OpenCodeAdapterV2.ts (relatedSessionOwners, MIT), which routes
// their requests to the parent.
function isEventForRun(
  control: ActiveOpenCodeRunControl,
  event: OpenCodeRunEvent,
) {
  const sessionId = eventSessionId(event);
  if (sessionId === control.session.sessionId) return true;
  return (
    sessionId !== null &&
    control.childSessionIds.has(sessionId) &&
    CHILD_SESSION_EVENT_TYPES.has(event.type)
  );
}

function setAwaiting(control: ActiveOpenCodeRunControl) {
  persist.setThreadStatus(control.threadId, "awaiting_approval");
  control.emitter.flush();
  void emitThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  );
}

function resumeStreaming(control: ActiveOpenCodeRunControl) {
  if (
    control.pendingApprovals.size === 0 &&
    control.pendingQuestions.size === 0
  ) {
    persist.setThreadStatus(control.threadId, "streaming");
  }
  control.emitter.flush();
}

function toPermissionReply(response: {
  approved?: boolean;
  decision?: string;
}): OpenCodePermissionReply {
  if (response.approved === false) return "reject";
  return response.decision === "acceptForSession" ||
    response.decision === "always"
    ? "always"
    : "once";
}

async function handlePermissionAsked(
  control: ActiveOpenCodeRunControl,
  event: Extract<OpenCodeRunEvent, { type: "permission.asked" }>,
) {
  const key = control.mirror.requestApproval({
    input: {
      ...event.metadata,
      patterns: event.patterns,
      permission: event.permission,
    },
    name: normalizeOpenCodeToolName(event.permission || "permission"),
    requestId: event.requestId,
    toolCallId: event.toolCallId,
  });
  const autoApprove = shouldAutoApproveExternalPermission({
    permissionMode: control.permissionMode,
    toolsEnabled: control.toolsEnabled,
  });
  if (
    autoApprove ||
    shouldAutoDenyExternalPermission({
      interactive: control.interactive,
      toolsEnabled: control.toolsEnabled,
    })
  ) {
    // Full access approves even when nobody could be asked.
    control.mirror.respondToApproval(key, {
      approved: autoApprove,
      decision: autoApprove ? "accept" : "decline",
      ...(autoApprove
        ? {}
        : {
            reason: control.toolsEnabled
              ? UNATTENDED_DECLINE_MESSAGE
              : "Tools are disabled for this thread.",
          }),
    });
    control.emitter.flush();
    await control.session.replyPermission(
      event.requestId,
      autoApprove ? "once" : "reject",
      event.sessionId,
    );
    return;
  }
  control.pendingApprovals.set(event.requestId, {
    key,
    sessionId: event.sessionId,
  });
  setAwaiting(control);
}

async function handleQuestionAsked(
  control: ActiveOpenCodeRunControl,
  event: Extract<OpenCodeRunEvent, { type: "question.asked" }>,
) {
  const key = control.mirror.askQuestion({
    input: buildQuestionInput({
      questions: event.questions,
      title: event.title,
    }),
    requestId: event.requestId,
    toolCallId: event.toolCallId,
  });
  if (!control.toolsEnabled || control.interactive === false) {
    control.mirror.declineQuestion(
      key,
      control.toolsEnabled
        ? UNATTENDED_DECLINE_MESSAGE
        : "Tools are disabled for this thread.",
    );
    control.emitter.flush();
    await control.session.rejectQuestion(event.requestId, event.sessionId);
    return;
  }
  control.pendingQuestions.set(event.requestId, {
    key,
    questions: event.questions,
    sessionId: event.sessionId,
  });
  setAwaiting(control);
}

async function handleOpenCodeEvent(
  control: ActiveOpenCodeRunControl,
  event: OpenCodeRunEvent,
) {
  if (event.type === "session.child") {
    if (
      event.parentId === control.session.sessionId ||
      control.childSessionIds.has(event.parentId)
    ) {
      control.childSessionIds.add(event.sessionId);
    }
    return;
  }
  if (!isEventForRun(control, event)) return;

  switch (event.type) {
    case "message": {
      // A new assistant message after a ContextOverflowError means OpenCode
      // compacted the session and carried on, so the error was not final.
      if (
        event.role === "assistant" &&
        control.deferredSessionError &&
        !control.deferredSessionError.knownMessageIds.has(event.messageId)
      ) {
        control.deferredSessionError = null;
      }
      control.knownMessageIds.add(event.messageId);
      if (control.mirror.apply(event)) control.emitter.schedule();
      return;
    }
    case "message.removed":
    case "part.text":
    case "part.delta":
    case "tool":
    case "usage": {
      const change = control.mirror.apply(event);
      if (change === "structural") control.emitter.flush();
      else if (change === "delta") control.emitter.schedule();
      return;
    }
    case "permission.asked":
      await handlePermissionAsked(control, event);
      return;
    case "permission.replied": {
      const pending = control.pendingApprovals.get(event.requestId);
      control.pendingApprovals.delete(event.requestId);
      const key = pending?.key ?? event.requestId;
      if (control.mirror.getTool(key)?.state === "approval-requested") {
        const approved = event.reply !== "reject";
        control.mirror.respondToApproval(key, {
          approved,
          decision: approved ? "accept" : "decline",
        });
      }
      resumeStreaming(control);
      return;
    }
    case "question.asked":
      await handleQuestionAsked(control, event);
      return;
    case "question.settled": {
      const pending = control.pendingQuestions.get(event.requestId);
      control.pendingQuestions.delete(event.requestId);
      const key = pending?.key ?? event.requestId;
      if (control.mirror.getTool(key)?.state === "approval-requested") {
        if (event.outcome === "replied") {
          control.mirror.answerQuestion(key, {
            response: event.response ?? "",
          });
        } else {
          control.mirror.declineQuestion(key, "Declined");
        }
      }
      resumeStreaming(control);
      return;
    }
    case "session.idle": {
      if (
        control.pendingApprovals.size > 0 ||
        control.pendingQuestions.size > 0
      ) {
        return;
      }
      const deferred = control.deferredSessionError;
      await finishOpenCodeRun(
        control,
        deferred
          ? {
              errorMessage: deferred.message,
              executionEnded: true,
              status: "error",
            }
          : { finishReason: "stop", status: "completed" },
      );
      return;
    }
    case "session.error": {
      if (event.contextOverflow) {
        // Keep the run alive: OpenCode has just started compacting.
        // session.idle settles the outcome.
        control.deferredSessionError = {
          knownMessageIds: new Set(control.knownMessageIds),
          message: event.message,
        };
        return;
      }
      // 1.x ends the prompt loop on session.error.
      await finishOpenCodeRun(
        control,
        event.aborted
          ? {
              errorMessage: STOPPED_MESSAGE,
              executionEnded: true,
              status: "cancelled",
            }
          : {
              errorMessage: event.message,
              executionEnded: true,
              status: "error",
            },
      );
      return;
    }
    // t3code provider-opencode v2/adapter.ts (awaitingStart, MIT): what
    // arrives before this turn's execution started belongs to the last one.
    case "step.failed":
      if (!control.executionStarted) return;
      if (event.aborted) control.interrupted = true;
      else if (event.message) control.executionError = event.message;
      return;
    case "execution.started":
      control.executionStarted = true;
      return;
    case "execution.ended": {
      if (!control.executionStarted) return;
      if (event.outcome === "interrupted" || control.interrupted) {
        await finishOpenCodeRun(control, {
          errorMessage: STOPPED_MESSAGE,
          executionEnded: true,
          status: "cancelled",
        });
        return;
      }
      await finishOpenCodeRun(
        control,
        event.outcome === "succeeded"
          ? { finishReason: "stop", status: "completed" }
          : {
              errorMessage: event.error ?? control.executionError,
              executionEnded: true,
              status: "error",
            },
      );
      return;
    }
  }
}

// Without this a crashed server leaves the thread "streaming" forever: the
// 1.x SDK's SSE reader retries a dead connection indefinitely.
function watchOpenCodeServerExit(control: ActiveOpenCodeRunControl) {
  void control.session.serverExited.then(async ({ code, signal }) => {
    if (isOpenCodeRunSettled(control)) return;
    await finishOpenCodeRun(control, {
      errorMessage: `OpenCode server exited unexpectedly (${
        signal ?? `code ${code ?? "unknown"}`
      }).`,
      executionEnded: true,
      status: "error",
    });
  });
}

/** Subscribes (before the prompt is sent) and pumps events in order. */
async function startOpenCodeEventPump(control: ActiveOpenCodeRunControl) {
  const events = await control.session.events(control.abortController.signal);
  void (async () => {
    try {
      for await (const event of events) {
        if (control.finished) return;
        await handleOpenCodeEvent(control, event);
      }
      // The stream ended (the server closed it); no turn end can follow.
      if (isOpenCodeRunSettled(control)) return;
      await Promise.race([
        control.session.serverExited,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      if (isOpenCodeRunSettled(control)) return;
      await finishOpenCodeRun(control, {
        errorMessage: "OpenCode event stream ended unexpectedly.",
        status: "error",
      });
    } catch (error) {
      if (isOpenCodeRunSettled(control)) return;
      // A dying server drops the stream first; its exit explains more.
      await Promise.race([
        control.session.serverExited,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      if (isOpenCodeRunSettled(control)) return;
      await finishOpenCodeRun(control, {
        errorMessage: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
  })();
}

async function applyOpenCodePromptResponse(
  control: ActiveOpenCodeRunControl,
  response: OpenCodePromptResponse,
) {
  if (response.kind === "user-input") {
    const pending = control.pendingQuestions.get(response.approvalId);
    if (!pending) return false;

    control.pendingQuestions.delete(response.approvalId);
    const parsed = parseQuestionResponse(pending.questions, response.response);
    control.mirror.answerQuestion(pending.key, {
      answers: parsed.answers,
      ...(parsed.additionalContext
        ? { additionalContext: parsed.additionalContext }
        : {}),
      response: response.response,
    });
    resumeStreaming(control);
    await control.session.answerQuestion(
      response.approvalId,
      response.response,
      pending.sessionId,
    );
    return true;
  }

  const pending = control.pendingApprovals.get(response.approvalId);
  if (!pending) return false;

  control.pendingApprovals.delete(response.approvalId);
  const approved = response.approved !== false;
  control.mirror.respondToApproval(pending.key, {
    approved,
    ...(response.decision ? { decision: response.decision } : {}),
    ...(response.reason ? { reason: response.reason } : {}),
  });
  resumeStreaming(control);
  await control.session.replyPermission(
    response.approvalId,
    toPermissionReply(response),
    pending.sessionId,
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

  // finishOpenCodeRun stops the session's execution.
  await finishOpenCodeRun(activeControl, {
    errorMessage: STOPPED_MESSAGE,
    status: "cancelled",
  });

  return new Response(null, { status: 204 });
}

async function handleToolApprovalTrigger(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
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
  return new Response(null, { status: 204 });
}

type FilePart = Extract<ThreadUIMessage["parts"][number], { type: "file" }>;

/**
 * Attachments as OpenCode file inputs: images inline (data: URL), other
 * files by their stored path. Ones that cannot be passed are listed in a
 * note instead of being dropped silently.
 */
async function buildOpenCodePromptFiles(message: ThreadUIMessage | null) {
  const files: OpenCodePromptFile[] = [];
  const notes: string[] = [];
  for (const part of message?.parts ?? []) {
    if (part.type !== "file") continue;
    const file = part as FilePart;
    const name = file.filename ?? file.mediaType;
    const loaded = await loadAttachment(file).catch(() => null);
    if (file.mediaType.startsWith("image/") && loaded) {
      files.push({
        ...(file.filename ? { filename: file.filename } : {}),
        mediaType: file.mediaType,
        path: loaded.path,
        url: file.url.startsWith("data:")
          ? file.url
          : `data:${file.mediaType};base64,${loaded.data.toString("base64")}`,
      });
    } else if (loaded?.path) {
      files.push({
        filename: name,
        mediaType: file.mediaType,
        path: loaded.path,
        url: pathToFileURL(loaded.path).toString(),
      });
    } else {
      notes.push(`Attachment ${name} could not be passed to OpenCode.`);
    }
  }
  return { files, notes };
}

function getUserText(message: ThreadUIMessage | null | undefined) {
  return (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

/** `/name args` when `name` is one of the session's commands. */
async function matchOpenCodeCommand(
  session: OpenCodeTurnSession,
  text: string,
) {
  const match = /^\/([A-Za-z0-9][\w:.-]*)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;
  const commands = await session.listCommands().catch(() => [] as string[]);
  const name = match[1]!;
  return commands.includes(name)
    ? { arguments: (match[2] ?? "").trim(), name }
    : null;
}

export async function runOpenCodeThreadChat(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
  /** The thread's engine instance (the dispatcher resolves it). */
  instance?: ResolvedEngineInstance | null,
) {
  if (request.trigger === "submit-tool-approval") {
    return await handleToolApprovalTrigger(request, existingThread);
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

  void beginExternalRuntimeRepoCheckpoint({
    projectPath: workspaceRoot,
    runId,
    thread: existingThread,
  });
  const toolsEnabled = request.toolsEnabled !== false;
  const existingState = getOpenCodeThreadState(
    existingThread?.chatEngineState,
    instance,
  );
  // Only an agent the user picked is kept; plan mode picks `plan` for its
  // turns alone. State from older builds could hold a stale `plan`.
  const selectedAgent =
    request.openCode?.agent ??
    (existingState?.selectedAgent === "plan"
      ? null
      : (existingState?.selectedAgent ?? null));
  const turnAgent = threadMode === "plan" ? "plan" : selectedAgent;
  const selectedVariant =
    request.openCode?.variant ?? existingState?.selectedVariant ?? null;

  // What the persisted session is missing. State without the sync mark
  // comes from builds that made a new session per turn: never continued.
  const history = planAcpHistory({
    currentMessageId: request.message?.id ?? null,
    state:
      existingState?.syncedMessageId && existingState.cwd === workspaceRoot
        ? {
            historyDelivered: true,
            sessionId: existingState.sessionId,
            syncedMessageId: existingState.syncedMessageId,
          }
        : null,
    transcript: modelTranscript,
  });
  const canResume = history.type === "none" || history.type === "since";

  let permissionMode: PermissionMode;
  let session: OpenCodeTurnSession;
  try {
    permissionMode = resolveSupportedPermissionMode(
      await getToolPermissionMode(
        request.userId,
        request.workspaceId,
        request.threadId,
      ),
      DRIVER_CATALOG.opencode.capabilities.permissionModes,
    );
    // The user's MCP servers; their tools ask through the session's rules.
    const forwardedMcp = await loadForwardedMcpServers({
      env: instance?.env ?? process.env,
      userId: request.userId,
    });
    logSkippedMcpServers("opencode", forwardedMcp.skipped);
    session = await startOpenCodeSession({
      cwd: workspaceRoot,
      instance: instance ?? null,
      mcp: forwardedMcp,
      model: { ...parsedModel, variant: selectedVariant },
      // Without tools every request is asked (and declined here).
      permissionMode: toolsEnabled ? permissionMode : "default",
      planMode: threadMode === "plan",
      resume:
        canResume && existingState
          ? {
              generation: existingState.generation ?? null,
              sessionId: existingState.sessionId,
            }
          : null,
      title: fallbackTitle,
    });
  } catch (error) {
    await clearExternalRuntimeRepoCheckpoint(runId);
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    eventChannel.close();
    throw error;
  }

  const mirror = createOpenCodeMirror({
    assumeAssistant: session.generation === "v2",
  });
  const baseState: OpenCodeThreadState = {
    cwd: workspaceRoot,
    generation: session.generation,
    modelId: request.modelId ?? null,
    selectedAgent,
    selectedVariant,
    sessionId: session.sessionId,
    // Until this turn's prompt is accepted the session holds what it held.
    syncedMessageId: session.resumed
      ? (existingState?.syncedMessageId ?? null)
      : null,
  };
  const control: ActiveOpenCodeRunControl = {
    abortController: new AbortController(),
    assistantId,
    baseState,
    childSessionIds: new Set(),
    deferredSessionError: null,
    emitter: createMirrorEmitter({
      emit: (message) => emitMessage(eventChannel, runId, message),
      persist: () => persistAssistantMessage(control, "streaming"),
    }),
    eventChannel,
    executionError: null,
    executionStarted: false,
    finished: false,
    instance: instance ?? null,
    interactive: request.interactive !== false,
    interrupted: false,
    knownMessageIds: new Set(),
    mirror,
    permissionMode,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    requestedModelId: request.modelId ?? null,
    runId,
    session,
    threadId: request.threadId,
    toolsEnabled,
    userId: request.userId,
    workspaceId: request.workspaceId,
  };
  activeOpenCodeRunControls.set(runId, control);
  writeThreadState(control, baseState);

  // A continued session already holds the turns up to the sync mark.
  const historyMessages = !session.resumed
    ? modelTranscript
    : history.type === "since"
      ? history.messages
      : [];
  const promptMessage =
    request.message ??
    ({
      id: request.threadId,
      metadata: {},
      parts: [{ text: "", type: "text" }],
      role: "user",
    } satisfies ThreadUIMessage);
  const { files, notes } = await buildOpenCodePromptFiles(
    request.message ?? null,
  );
  const promptText = [
    buildExternalRuntimePromptText({
      ...(session.resumed && history.type === "since"
        ? { historyHeading: MISSED_TURNS_HEADING }
        : {}),
      includeHistory: historyMessages.length > 0,
      message: promptMessage,
      threadMode,
      transcript: historyMessages,
      workspaceRoot,
    }),
    ...notes,
  ].join("\n\n");

  const send = async () => {
    const command = await matchOpenCodeCommand(
      session,
      getUserText(request.message),
    );
    const base = {
      agent: turnAgent,
      files,
      model: { ...parsedModel, variant: selectedVariant },
    };
    if (command) {
      await session.command({ ...base, ...command });
    } else {
      await session.prompt({ ...base, text: promptText });
    }
    // The session now holds this turn and everything before it, except
    // the history a command could not carry: it stays unsynced, so the
    // next turn sends it (a new session without a mark gets a replay).
    writeThreadState(control, {
      ...baseState,
      syncedMessageId:
        command && historyMessages.length > 0
          ? baseState.syncedMessageId
          : assistantId,
    });
  };

  try {
    watchOpenCodeServerExit(control);
    await startOpenCodeEventPump(control);
    // Sent in the background: the response is the event stream.
    void send().catch(async (error) => {
      await finishOpenCodeRun(control, {
        errorMessage: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    });
  } catch (error) {
    await finishOpenCodeRun(control, {
      errorMessage: error instanceof Error ? error.message : String(error),
      status: "error",
    });
  }

  return new Response(await streamContext.resumeExistingStream(runId), {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
