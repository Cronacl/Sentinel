import "server-only";

import { generateId } from "ai";

import {
  applyCursorSessionConfig,
  buildCursorThreadState,
  startCursorAcpSession,
  type CursorExtRequest,
  type CursorPermissionRequest,
  type CursorSessionUpdateNotification,
} from "@/lib/ai/chat/engines/cursor-acp";
import { getCursorThreadState } from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
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
  resolveCursorPromptResponse,
  type CursorPromptResponse,
} from "./cursor-event-helpers";
import {
  beginExternalRuntimeRepoCheckpoint,
  buildExternalRuntimePromptText,
  clearExternalRuntimeRepoCheckpoint,
  finalizeExternalRuntimeRepoCheckpoint,
  shouldAutoApproveExternalPermission,
  shouldAutoDenyExternalPermission,
} from "./external-runtime";
import { getToolPermissionMode, getWorkspaceRootPath } from "./workspace";
import type { PermissionMode } from "@/server/db/enums";

type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

type CursorMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type CursorMirrorTool = {
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
  state: CursorMirrorToolState;
};

type CursorMirrorState = {
  assistantId: string;
  nextOrder: number;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  text: string;
  textOrder: number;
  threadId: string;
  tools: Map<string, CursorMirrorTool>;
};

type PendingCursorApproval = {
  request: CursorPermissionRequest;
  resolve: (result: unknown) => void;
  toolCallId: string;
};

type PendingCursorQuestion = {
  params: {
    questions: Array<{
      id: string;
      prompt: string;
      options: Array<{ id: string; label: string }>;
    }>;
    toolCallId: string;
  };
  resolve: (result: unknown) => void;
  toolCallId: string;
};

type ActiveCursorRunControl = {
  assistantId: string;
  eventChannel: ThreadEventChannel;
  finished: boolean;
  permissionMode: PermissionMode;
  pendingApprovals: Map<string, PendingCursorApproval>;
  pendingQuestions: Map<string, PendingCursorQuestion>;
  promptPromise: Promise<unknown>;
  runId: string;
  session: Awaited<ReturnType<typeof startCursorAcpSession>>;
  state: CursorMirrorState;
  threadId: string;
  toolsEnabled: boolean;
  userId: string;
  workspaceId: string;
};

const log = createLogger("ThreadChatCursor");

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
  var __sentinelActiveCursorRunControls:
    | Map<string, ActiveCursorRunControl>
    | undefined;
}

const activeCursorRunControls =
  globalThis.__sentinelActiveCursorRunControls ??
  (globalThis.__sentinelActiveCursorRunControls = new Map<
    string,
    ActiveCursorRunControl
  >());

function getNextOrder(state: CursorMirrorState) {
  const order = state.nextOrder;
  state.nextOrder += 1;
  return order;
}

function getToolOrder(state: CursorMirrorState, toolId: string) {
  const existing = state.tools.get(toolId);
  if (existing) {
    return existing.order;
  }

  return getNextOrder(state);
}

function normalizeCursorToolName(toolName: string) {
  return `cursor_${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

function normalizeCursorPermissionOptionId(
  request: CursorPermissionRequest,
  approved: boolean,
) {
  const options = request.options ?? [];
  const preferred = approved
    ? options.find((option) => option.kind?.startsWith("allow"))
    : options.find((option) => option.kind?.startsWith("reject"));

  return preferred?.optionId ?? options[0]?.optionId ?? null;
}

function extractPermissionReason(request: CursorPermissionRequest) {
  return (
    request.toolCall?.content
      ?.flatMap((entry) => {
        if (entry.type !== "content" || entry.content?.type !== "text") {
          return [];
        }
        return [entry.content.text?.trim() ?? ""];
      })
      .filter(Boolean)
      .join("\n") || undefined
  );
}

function createCursorMirrorState(input: {
  assistantId: string;
  requestedModelId?: string | null;
  sessionId: string;
  threadId: string;
}) {
  return {
    assistantId: input.assistantId,
    nextOrder: 0,
    requestedModelId: input.requestedModelId ?? null,
    responseModelId: input.requestedModelId ?? null,
    sessionId: input.sessionId,
    text: "",
    textOrder: 0,
    threadId: input.threadId,
    tools: new Map(),
  } satisfies CursorMirrorState;
}

function upsertCursorTool(
  state: CursorMirrorState,
  input: Omit<CursorMirrorTool, "order"> & { order?: number },
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

function buildAssistantParts(state: CursorMirrorState) {
  const parts: ThreadUIMessage["parts"] = [];
  const orderedTools = [...state.tools.values()].sort(
    (left, right) => left.order - right.order,
  );

  type OrderedItem =
    | { kind: "text"; order: number; text: string }
    | { kind: "tool"; order: number; tool: CursorMirrorTool };

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
      parts.push({
        text: item.text,
        type: "text",
      });
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
  state: CursorMirrorState,
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
}

async function emitThreadSnapshot(
  threadId: string,
  eventChannel: ThreadEventChannel,
  runId?: string,
) {
  const snapshot = await loadThreadSessionSnapshot(threadId);
  if (!snapshot) {
    return null;
  }

  eventChannel.emit({
    snapshot,
    type: "thread.snapshot",
  });

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

async function drainQueuedCursorFollowUp(
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
    await runCursorThreadChat(
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

function resolveActiveCursorRunControl(input: {
  activeRunId: string | null;
  threadId: string;
}) {
  if (input.activeRunId) {
    const byRunId = activeCursorRunControls.get(input.activeRunId);
    if (byRunId) {
      return byRunId;
    }
  }

  for (const control of activeCursorRunControls.values()) {
    if (control.threadId === input.threadId) {
      return control;
    }
  }

  return null;
}

async function applyCursorPromptResponse(
  control: ActiveCursorRunControl,
  response: CursorPromptResponse,
) {
  if (response.kind === "user-input") {
    const pendingQuestion = control.pendingQuestions.get(response.approvalId);
    if (!pendingQuestion) {
      return false;
    }

    control.pendingQuestions.delete(response.approvalId);
    upsertCursorTool(control.state, {
      approval: {
        id: response.approvalId,
        response: response.response,
      },
      id: response.approvalId,
      name: "cursor_ask_question",
      state: "input-available",
    });

    const firstQuestionId =
      pendingQuestion.params.questions[0]?.id ?? "response";
    pendingQuestion.resolve({
      answers: {
        [firstQuestionId]: response.response,
      },
    });
    return true;
  }

  const pendingApproval = control.pendingApprovals.get(response.approvalId);
  if (!pendingApproval) {
    return false;
  }

  control.pendingApprovals.delete(response.approvalId);
  const optionId = normalizeCursorPermissionOptionId(
    pendingApproval.request,
    response.approved !== false,
  );
  if (!optionId) {
    throw new Error("Cursor approval options were missing.");
  }

  upsertCursorTool(control.state, {
    approval: {
      approved: response.approved !== false,
      ...(response.decision ? { decision: response.decision } : {}),
      id: response.approvalId,
      ...(response.reason ? { reason: response.reason } : {}),
      ...(response.response ? { response: response.response } : {}),
    },
    id: response.approvalId,
    name:
      control.state.tools.get(response.approvalId)?.name ?? "cursor_runtime",
    state: response.approved === false ? "output-denied" : "approval-responded",
  });

  pendingApproval.resolve({
    outcome: {
      outcome: "selected",
      optionId,
    },
  });
  return true;
}

async function finishCursorRun(
  control: ActiveCursorRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "cancelled" | "completed" | "error";
    threadStatus: "idle" | "streaming" | "awaiting_approval";
  },
) {
  if (control.finished) {
    return;
  }

  control.finished = true;
  const errorMessage =
    input.status === "error"
      ? normalizeThreadChatErrorMessage(
          input.errorMessage,
          "Cursor run failed.",
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
  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, input.threadStatus);
  await emitAssistantMessageUpdate(
    control.state,
    control.runId,
    input.status,
    input.finishReason,
    errorMessage,
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
    log.error("cursor_run_failed", {
      error: errorMessage,
      runId: control.runId,
      threadId: control.threadId,
      userId: control.userId,
      workspaceId: control.workspaceId,
    });
    control.eventChannel.emit({
      error: errorMessage ?? "Cursor run failed.",
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
  activeCursorRunControls.delete(control.runId);
  control.session.client.close();

  if (input.threadStatus === "idle") {
    await drainQueuedCursorFollowUp({
      threadId: control.threadId,
      userId: control.userId,
      workspaceId: control.workspaceId,
    });
  }
}

async function handleCursorSessionUpdate(
  control: ActiveCursorRunControl,
  notification: CursorSessionUpdateNotification,
) {
  const update = notification.update;
  if (!update || typeof update.sessionUpdate !== "string") {
    return;
  }

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const text =
        update.content &&
        typeof update.content === "object" &&
        "text" in update.content &&
        typeof update.content.text === "string"
          ? update.content.text
          : "";
      if (text) {
        control.state.text += text;
        await emitAssistantMessageUpdate(
          control.state,
          control.runId,
          "streaming",
        );
      }
      break;
    }
    case "tool_call": {
      const toolCallId =
        typeof update.toolCallId === "string"
          ? update.toolCallId
          : crypto.randomUUID();
      const title =
        typeof update.title === "string"
          ? update.title
          : typeof update.kind === "string"
            ? update.kind
            : "tool";
      upsertCursorTool(control.state, {
        id: toolCallId,
        input: update.rawInput,
        name: normalizeCursorToolName(title),
        state: "input-available",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      break;
    }
    case "tool_call_update": {
      const toolCallId =
        typeof update.toolCallId === "string"
          ? update.toolCallId
          : crypto.randomUUID();
      const existing = control.state.tools.get(toolCallId);
      const status =
        typeof update.status === "string" ? update.status : "completed";
      upsertCursorTool(control.state, {
        ...(status === "completed" ? { output: update.rawOutput } : {}),
        ...(status === "failed" ? { errorText: "Tool execution failed." } : {}),
        id: toolCallId,
        name: existing?.name ?? "cursor_runtime",
        state:
          status === "completed"
            ? "output-available"
            : status === "failed"
              ? "output-error"
              : "input-streaming",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      break;
    }
    case "plan": {
      const entries = Array.isArray(update.entries) ? update.entries : [];
      upsertCursorTool(control.state, {
        id: "cursor-plan",
        name: "update_plan",
        output: {
          audience: "technical",
          document: "",
          goal: "Active plan",
          summary: "",
          taskCount: entries.length,
          tasks: entries
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }

              const candidate = entry as Record<string, unknown>;
              return typeof candidate.content === "string"
                ? {
                    description: null,
                    title: candidate.content,
                  }
                : null;
            })
            .filter((entry): entry is { description: null; title: string } =>
              Boolean(entry),
            ),
          title: "Active plan",
        },
        state: "output-available",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      break;
    }
    default:
      break;
  }

  const snapshot = await loadThreadSessionSnapshot(control.threadId);
  const message =
    snapshot?.messages.find(
      (candidate) => candidate.id === control.assistantId,
    ) ?? null;
  if (message) {
    control.eventChannel.emit({
      message,
      runId: control.runId,
      type: "message.upsert",
    });
  }
}

function buildCursorQuestionInput(params: {
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; label: string }>;
  }>;
}) {
  return {
    questions: params.questions.map((question) => ({
      allowMultiple: false,
      header: "Question",
      options: question.options.map((option) => ({
        description: option.label,
        label: option.label,
      })),
      question: question.prompt,
    })),
  };
}

async function handleCursorPermissionRequest(
  control: ActiveCursorRunControl,
  request: CursorPermissionRequest,
  options?: { interactive: boolean; permissionMode: PermissionMode },
) {
  const permissionMode = options?.permissionMode ?? control.permissionMode;
  const toolsEnabled = options?.interactive !== false && control.toolsEnabled;

  if (
    shouldAutoApproveExternalPermission({
      permissionMode,
      toolsEnabled,
    }) ||
    shouldAutoDenyExternalPermission({ toolsEnabled })
  ) {
    const approved = permissionMode === "full" && toolsEnabled;
    const optionId = normalizeCursorPermissionOptionId(request, approved);
    if (!optionId) {
      throw new Error("Cursor approval options were missing.");
    }
    return {
      outcome: {
        outcome: "selected",
        optionId,
      },
    };
  }

  const toolCallId = request.toolCall?.toolCallId ?? crypto.randomUUID();
  const reason = extractPermissionReason(request);
  const existing = control.state.tools.get(toolCallId);

  upsertCursorTool(control.state, {
    approval: {
      id: toolCallId,
      ...(reason ? { reason } : {}),
    },
    id: toolCallId,
    input: request.toolCall?.rawInput ?? existing?.input,
    name:
      existing?.name ??
      normalizeCursorToolName(
        request.toolCall?.title ?? request.toolCall?.kind ?? "runtime",
      ),
    state: "approval-requested",
  });

  persist.setThreadStatus(control.threadId, "awaiting_approval");
  await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
  await emitThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  );

  return await new Promise((resolve) => {
    control.pendingApprovals.set(toolCallId, {
      request,
      resolve,
      toolCallId,
    });
  });
}

async function handleCursorExtRequest(
  control: ActiveCursorRunControl,
  request: CursorExtRequest,
  options?: { interactive: boolean },
) {
  if (request.method === "cursor/ask_question") {
    if (options?.interactive === false) {
      throw new Error(
        "Cursor requested interactive user input during a background run.",
      );
    }

    const params =
      request.params && typeof request.params === "object"
        ? (request.params as {
            questions?: Array<{
              id: string;
              options?: Array<{ id: string; label: string }>;
              prompt: string;
            }>;
            toolCallId?: string;
          })
        : {};
    const toolCallId = params.toolCallId ?? crypto.randomUUID();
    const questions = (params.questions ?? []).map((question) => ({
      id: question.id,
      options: question.options ?? [],
      prompt: question.prompt,
    }));

    upsertCursorTool(control.state, {
      approval: {
        id: toolCallId,
      },
      id: toolCallId,
      input: buildCursorQuestionInput({ questions }),
      name: "cursor_ask_question",
      state: "approval-requested",
    });

    persist.setThreadStatus(control.threadId, "awaiting_approval");
    await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
    await emitThreadSnapshot(
      control.threadId,
      control.eventChannel,
      control.runId,
    );

    return await new Promise((resolve) => {
      control.pendingQuestions.set(toolCallId, {
        params: {
          questions,
          toolCallId,
        },
        resolve,
        toolCallId,
      });
    });
  }

  if (request.method === "cursor/create_plan") {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as {
            name?: string;
            overview?: string;
            plan?: string;
            todos?: Array<{ content?: string; title?: string }>;
            toolCallId?: string;
          })
        : {};
    const tasks = (params.todos ?? [])
      .map((todo) => ({
        description: null,
        title: todo.content?.trim() || todo.title?.trim() || "",
      }))
      .filter((task) => task.title.length > 0);

    upsertCursorTool(control.state, {
      id: params.toolCallId ?? "cursor-create-plan",
      name: "create_plan",
      output: {
        audience: "technical",
        document: params.plan ?? "",
        goal: params.overview ?? "Cursor proposed a plan.",
        summary: params.overview ?? "",
        taskCount: tasks.length,
        tasks,
        title: params.name ?? "Cursor plan",
      },
      state: "output-available",
    });
    await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
    return { accepted: true };
  }

  return {};
}

async function handleCursorExtNotification(
  control: ActiveCursorRunControl,
  request: CursorExtRequest,
) {
  if (request.method !== "cursor/update_todos") {
    return;
  }

  const params =
    request.params && typeof request.params === "object"
      ? (request.params as {
          todos?: Array<{
            content?: string;
            status?: string;
            title?: string;
          }>;
          toolCallId?: string;
        })
      : {};
  const tasks = (params.todos ?? [])
    .map((todo) => ({
      description:
        todo.status && todo.status !== "pending" ? todo.status : null,
      title: todo.content?.trim() || todo.title?.trim() || "",
    }))
    .filter((task) => task.title.length > 0);

  upsertCursorTool(control.state, {
    id: params.toolCallId ?? "cursor-update-todos",
    name: "update_plan",
    output: {
      audience: "technical",
      document: "",
      goal: "Active plan",
      summary: "",
      taskCount: tasks.length,
      tasks,
      title: "Updated todo list",
    },
    state: "output-available",
  });
  await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
}

export async function stopCursorThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const activeControl = resolveActiveCursorRunControl({
    activeRunId: existingThread?.activeStreamId ?? null,
    threadId: request.threadId,
  });

  if (!activeControl) {
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    return new Response(null, { status: 204 });
  }

  await activeControl.session.client
    .cancel(activeControl.state.sessionId)
    .catch(() => undefined);
  await finishCursorRun(activeControl, {
    errorMessage: "Generation stopped.",
    finishReason: null,
    status: "cancelled",
    threadStatus: "idle",
  });

  return new Response(null, { status: 204 });
}

export async function runCursorThreadChat(
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

    const activeControl = resolveActiveCursorRunControl({
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
    const response = resolveCursorPromptResponse({
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
        "That Cursor approval request is no longer active.",
      );
    }

    const applied = await applyCursorPromptResponse(activeControl, response);
    if (!applied) {
      throw new ThreadChatConflictError(
        "That Cursor approval request is no longer active.",
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
      `The Cursor engine does not support "${request.trigger}" yet.`,
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
    "cursor",
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
      statusLabel: "Starting Cursor session...",
    },
    parts: [{ text: " ", type: "text" }],
    role: "assistant",
  };

  persist.upsertMessage(request.threadId, placeholder);
  persist.setActiveStream(request.threadId, runId);
  persist.setThreadStatus(request.threadId, "streaming");
  await persist.updateThreadChatSettings(request.threadId, {
    engine: "cursor",
    modelId: request.modelId ?? null,
    mode: threadMode,
    reasoningEffort: request.reasoningEffort ?? null,
  });
  void beginExternalRuntimeRepoCheckpoint({
    projectPath: workspaceRoot,
    runId,
    thread: existingThread,
  });
  await emitThreadSnapshot(request.threadId, eventChannel, runId);
  eventChannel.emit({
    message: placeholder,
    runId,
    type: "message.upsert",
  });
  eventChannel.emit({
    runId,
    type: "run.started",
  });
  logRuntimeTiming("session_start_started", timingStartedAt, {
    runId,
    threadId: request.threadId,
    userId: request.userId,
    workspaceId: request.workspaceId,
  });

  const toolsEnabled = request.toolsEnabled !== false;
  let permissionMode: PermissionMode;
  let session: Awaited<ReturnType<typeof startCursorAcpSession>>;
  try {
    permissionMode = await getToolPermissionMode(
      request.userId,
      request.workspaceId,
      request.threadId,
    );
    const resumeSessionId = getCursorThreadState(
      existingThread?.chatEngineState,
    )?.sessionId;
    session = await startCursorAcpSession({
      cwd: workspaceRoot,
      onExtNotification: (extRequest) => {
        const control = activeCursorRunControls.get(runId);
        if (!control) {
          return;
        }
        void handleCursorExtNotification(control, extRequest);
      },
      onExtRequest: async (extRequest) => {
        const control = activeCursorRunControls.get(runId);
        if (!control) {
          throw new Error("Cursor run is no longer active.");
        }
        return await handleCursorExtRequest(control, extRequest, {
          interactive: toolsEnabled,
        });
      },
      onProcessExit: (error) => {
        const control = activeCursorRunControls.get(runId);
        if (!control || control.finished) {
          return;
        }
        void finishCursorRun(control, {
          errorMessage: error.message,
          finishReason: null,
          status: "error",
          threadStatus: "idle",
        });
      },
      onRequestPermission: async (permissionRequest) => {
        const control = activeCursorRunControls.get(runId);
        if (!control) {
          throw new Error("Cursor run is no longer active.");
        }
        return await handleCursorPermissionRequest(control, permissionRequest, {
          interactive: toolsEnabled,
          permissionMode,
        });
      },
      onSessionUpdate: (notification) => {
        const control = activeCursorRunControls.get(runId);
        if (!control) {
          return;
        }
        void handleCursorSessionUpdate(control, notification);
      },
      resumeSessionId,
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

  const state = createCursorMirrorState({
    assistantId,
    requestedModelId: request.modelId,
    sessionId: session.sessionId,
    threadId: request.threadId,
  });

  persist.updateCursorThreadState(
    request.threadId,
    buildCursorThreadState({
      cwd: workspaceRoot,
      modelId: request.modelId ?? null,
      reasoningEffort: request.reasoningEffort ?? null,
      sessionId: session.sessionId,
    }),
  );

  const control: ActiveCursorRunControl = {
    assistantId,
    eventChannel,
    finished: false,
    permissionMode,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    promptPromise: Promise.resolve(),
    runId,
    session,
    state,
    threadId: request.threadId,
    toolsEnabled,
    userId: request.userId,
    workspaceId: request.workspaceId,
  };
  activeCursorRunControls.set(runId, control);

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

  try {
    await applyCursorSessionConfig({
      client: session.client,
      configOptions: session.configOptions,
      modelId: request.modelId,
      reasoningEffort: request.reasoningEffort ?? null,
      sessionId: session.sessionId,
    });
  } catch (error) {
    await finishCursorRun(control, {
      errorMessage: error instanceof Error ? error.message : String(error),
      finishReason: null,
      status: "error",
      threadStatus: "idle",
    });
    throw error;
  }

  control.promptPromise = (async () => {
    try {
      await session.client.prompt({
        prompt: [{ text: promptText, type: "text" }],
        sessionId: session.sessionId,
      });

      if (
        control.pendingApprovals.size > 0 ||
        control.pendingQuestions.size > 0
      ) {
        return;
      }

      await finishCursorRun(control, {
        finishReason: "stop",
        status: "completed",
        threadStatus: "idle",
      });
    } catch (error) {
      if (control.finished) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      await finishCursorRun(control, {
        errorMessage: message,
        finishReason: null,
        status: "error",
        threadStatus: "idle",
      });
    }
  })();

  return new Response(await streamContext.resumeExistingStream(runId), {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
