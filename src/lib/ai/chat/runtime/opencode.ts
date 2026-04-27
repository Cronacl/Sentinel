import "server-only";

import { generateId } from "ai";
import type {
  Part,
  PermissionRequest,
  QuestionRequest,
} from "@opencode-ai/sdk/v2";

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
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import {
  safelyCloseReadableStreamController,
  safelyEnqueueReadableStreamController,
  streamContext,
} from "@/lib/streams";

import {
  normalizeThreadChatErrorMessage,
  ThreadChatConflictError,
} from "../errors";
import * as persist from "../persistence";
import { getThreadCheckpointAnchorMessageId } from "../repo-checkpoints";
import {
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
} from "../session-server";
import type { ThreadStreamEvent } from "../session-types";
import type { ThreadChatRequest } from "../types";
import {
  buildActiveThreadMessages,
  buildFirstUserMessageTitle,
  buildModelTranscript,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "./transcript";
import {
  resolveOpenCodePromptResponse,
  type OpenCodePromptResponse,
} from "./opencode-event-helpers";
import { buildPlanModePromptPreamble } from "./plan-mode-instructions";
import { getToolPermissionMode, getWorkspaceRootPath } from "./workspace";

type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

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

type OpenCodeMirrorState = {
  assistantId: string;
  messageRoleById: Map<string, "assistant" | "user">;
  nextOrder: number;
  partById: Map<string, Part>;
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

type ActiveOpenCodeRunControl = {
  abortController: AbortController;
  assistantId: string;
  eventChannel: ThreadEventChannel;
  finished: boolean;
  pendingApprovals: Map<string, PendingOpenCodeApproval>;
  pendingQuestions: Map<string, PendingOpenCodeQuestion>;
  runId: string;
  session: OpenCodeSession;
  state: OpenCodeMirrorState;
  threadId: string;
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

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveOpenCodeRunControls:
    | Map<string, ActiveOpenCodeRunControl>
    | undefined;
}

const activeOpenCodeRunControls =
  globalThis.__sentinelActiveOpenCodeRunControls ??
  (globalThis.__sentinelActiveOpenCodeRunControls = new Map<
    string,
    ActiveOpenCodeRunControl
  >());

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
      if (closed) return;
      closed = true;
      safelyCloseReadableStreamController(controller);
      controller = null;
    },
    emit(event: ThreadStreamEvent) {
      if (closed) return;
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

function resolveActiveOpenCodeRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activeOpenCodeRunControls.get(input.activeRunId);
    if (byRunId) return byRunId;
  }

  for (const control of activeOpenCodeRunControls.values()) {
    if (control.threadId === input.threadId) return control;
  }

  return null;
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

async function handleOpenCodeEvent(
  control: ActiveOpenCodeRunControl,
  event: any,
) {
  if (getEventSessionId(event) !== control.session.sessionId) {
    return;
  }

  switch (event.type) {
    case "message.updated": {
      control.state.messageRoleById.set(
        event.properties.info.id,
        event.properties.info.role,
      );
      if (event.properties.info.role !== "assistant") break;
      for (const part of control.state.partById.values()) {
        if (part.messageID === event.properties.info.id) {
          const text = textFromPart(part);
          if (text) {
            control.state.text = text;
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
      if (
        existingPart &&
        existingPart.type !== "text" &&
        existingPart.type !== "reasoning"
      ) {
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
      control.state.text += delta;
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
      if (role === "assistant") {
        const text = textFromPart(part);
        if (text && text.length >= control.state.text.length) {
          control.state.text = text;
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
        await finishOpenCodeRun(control, {
          finishReason: "stop",
          status: "completed",
          threadStatus: "idle",
        });
      }
      break;
    }
    case "session.error": {
      await finishOpenCodeRun(control, {
        errorMessage:
          event.properties?.error?.message ??
          event.properties?.message ??
          "OpenCode run failed.",
        finishReason: null,
        status: "error",
        threadStatus: "idle",
      });
      break;
    }
  }
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

function buildOpenCodePromptText(input: {
  message: ThreadUIMessage;
  threadMode: "chat" | "plan";
  transcript: ThreadUIMessage[];
}) {
  const history = input.transcript
    .map((message) => {
      const text = message.parts
        .filter(
          (
            part,
          ): part is Extract<
            ThreadUIMessage["parts"][number],
            { type: "text" }
          > => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!text) return null;
      return `${message.role.toUpperCase()}:\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const latestText = input.message.parts
    .filter(
      (
        part,
      ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();

  const body = [history, latestText].filter(Boolean).join("\n\n");
  return input.threadMode === "plan"
    ? `${buildPlanModePromptPreamble()}\n\n${body}`
    : body;
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

  const permissionMode = await getToolPermissionMode(
    request.userId,
    request.workspaceId,
    request.threadId,
  );
  const existingOpenCodeState = getOpenCodeThreadState(
    existingThread?.chatEngineState,
  );
  const selectedAgent =
    request.openCode?.agent ??
    existingOpenCodeState?.selectedAgent ??
    (threadMode === "plan" ? "plan" : null);
  const selectedVariant =
    request.openCode?.variant ?? existingOpenCodeState?.selectedVariant ?? null;
  const session = await startOpenCodeSession({
    cwd: workspaceRoot,
    fullAccess: permissionMode === "full" && request.toolsEnabled !== false,
    title: fallbackTitle,
  });
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
    eventChannel,
    finished: false,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    runId,
    session,
    state,
    threadId: request.threadId,
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
  );

  await startOpenCodeEventPump(control);

  const promptText = buildOpenCodePromptText({
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
  });
  const composerContextText = request.message?.metadata?.composerContext
    ? serializeComposerContextToText(request.message.metadata.composerContext)
    : null;
  const finalPromptText = [composerContextText, promptText]
    .filter(Boolean)
    .join("\n\n");

  const promptInput = {
    ...(selectedAgent ? { agent: selectedAgent } : {}),
    model: parsedModel,
    parts: [{ text: finalPromptText, type: "text" as const }],
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
