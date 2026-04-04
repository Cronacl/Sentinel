import "server-only";

import { generateId } from "ai";

import {
  createGeminiAcpClient,
  initializeGeminiSessionClient,
  setupGeminiFsProxy,
} from "@/lib/ai/chat/engines/gemini-acp";
import {
  getGeminiThreadState,
  type GeminiSessionMode,
} from "@/lib/ai/chat/engines/types";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";
import { streamContext } from "@/lib/streams";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

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
import type { ThreadChatRequest, ThreadToolApprovalResponse } from "../types";
import { ThreadChatConflictError } from "../errors";
import {
  buildActiveThreadMessages,
  getFirstUserText,
  getUserParentMessageId,
  truncateTranscriptAtMessage,
} from "./transcript";
import {
  getMcpServerRuntime,
  getToolPermissionMode,
  getWorkspaceRootPath,
} from "./workspace";

const log = createLogger("GeminiThreadChat");

type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

type GeminiMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type GeminiMirrorTool = {
  approval?: {
    id: string;
    optionId?: string;
    options?: Array<{ kind?: string; name?: string; optionId: string }>;
    reason?: string | null;
    response?: string;
  };
  errorText?: string;
  id: string;
  input?: unknown;
  name: string;
  order: number;
  output?: unknown;
  state: GeminiMirrorToolState;
};

type GeminiMirrorState = {
  assistantId: string;
  nextOrder: number;
  reasoningText: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  sessionMode: GeminiSessionMode | null;
  text: string;
  textOrder: number;
  threadId: string;
  tools: Map<string, GeminiMirrorTool>;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
};

type PendingGeminiApproval = {
  options: Array<{ kind?: string; name?: string; optionId: string }>;
  toolCall?: Record<string, unknown>;
  type: "permission";
};

type PendingGeminiInput = {
  description?: string;
  type: "input";
};

type ActiveGeminiRunControl = {
  assistantId: string;
  client: Awaited<ReturnType<typeof createGeminiAcpClient>>;
  eventChannel: ThreadEventChannel;
  fsProxyCleanup: (() => void) | null;
  mirror: GeminiMirrorState;
  pendingRequests: Map<string, PendingGeminiApproval | PendingGeminiInput>;
  runId: string;
  sessionId: string;
  threadId: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __sentinelActiveGeminiRunControls:
    | Map<string, ActiveGeminiRunControl>
    | undefined;
}

const activeGeminiRunControls =
  globalThis.__sentinelActiveGeminiRunControls ??
  (globalThis.__sentinelActiveGeminiRunControls = new Map<
    string,
    ActiveGeminiRunControl
  >());

function findActiveGeminiRunForThread(threadId: string) {
  for (const control of activeGeminiRunControls.values()) {
    if (control.threadId === threadId) {
      return control;
    }
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

function getGeminiSessionMode(input: {
  permissionMode: "default" | "full";
  threadMode: "chat" | "plan";
}): GeminiSessionMode {
  if (input.threadMode === "plan") {
    return "plan";
  }

  return input.permissionMode === "full" ? "auto_edit" : "default";
}

function getToolOrder(state: GeminiMirrorState, toolId: string) {
  const existing = state.tools.get(toolId);
  if (existing) {
    return existing.order;
  }

  const order = state.nextOrder;
  state.nextOrder += 1;
  return order;
}

function upsertGeminiTool(
  state: GeminiMirrorState,
  input: {
    approval?: GeminiMirrorTool["approval"];
    errorText?: string;
    id: string;
    input?: unknown;
    name: string;
    output?: unknown;
    state: GeminiMirrorToolState;
  },
) {
  const order = getToolOrder(state, input.id);
  const existing = state.tools.get(input.id);

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

function appendGeminiText(current: string, next: string) {
  if (!next.trim()) {
    return current;
  }

  return `${current}${next}`;
}

function buildAssistantParts(state: GeminiMirrorState) {
  const parts: ThreadUIMessage["parts"] = [];

  if (state.reasoningText.trim()) {
    parts.push({
      text: state.reasoningText.trim(),
      type: "reasoning",
    });
  }

  type OrderedItem =
    | { kind: "text"; order: number }
    | { kind: "tool"; order: number; tool: GeminiMirrorTool };

  const items: OrderedItem[] = [...state.tools.values()].map((tool) => ({
    kind: "tool" as const,
    order: tool.order,
    tool,
  }));

  if (state.text.trim()) {
    items.push({ kind: "text", order: state.textOrder });
  }

  items.sort((left, right) => left.order - right.order);

  for (const item of items) {
    if (item.kind === "text") {
      parts.push({
        text: state.text.trim(),
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
  state: GeminiMirrorState,
  runId: string,
  status: "pending" | "streaming" | "completed" | "error" | "cancelled",
  options?: {
    errorMessage?: string | null;
    finishReason?: string | null;
    repoCheckpointId?: string | null;
  },
) {
  persist.upsertMessage(state.threadId, {
    id: state.assistantId,
    metadata: {
      branchId: state.assistantId,
      ...(options?.errorMessage ? { errorMessage: options.errorMessage } : {}),
      ...(options?.finishReason ? { finishReason: options.finishReason } : {}),
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

function buildUserMessage(
  request: ThreadChatRequest,
  parentMessageId: string | null,
  runId: string,
) {
  if (
    !request.message ||
    (request.trigger !== "submit-user-message" &&
      request.trigger !== "edit-user-message")
  ) {
    return null;
  }

  return {
    ...request.message,
    metadata: {
      ...request.message.metadata,
      branchId: request.message.id,
      isActive: true,
      parentMessageId,
      runId,
      status: "completed" as const,
      ...(request.trigger === "edit-user-message" && request.messageId
        ? { editedFromMessageId: request.messageId }
        : {}),
    },
  } satisfies ThreadUIMessage;
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
      branchId: input.assistantId,
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

function createGeminiMirrorState(input: {
  assistantId: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  sessionMode: GeminiSessionMode | null;
  threadId: string;
}) {
  return {
    assistantId: input.assistantId,
    nextOrder: 0,
    reasoningText: "",
    requestedModelId: input.requestedModelId,
    responseModelId: input.responseModelId,
    sessionId: input.sessionId,
    sessionMode: input.sessionMode,
    text: "",
    textOrder: 0,
    threadId: input.threadId,
    tools: new Map(),
    usage: null,
  } satisfies GeminiMirrorState;
}

function inferToolName(toolCall: Record<string, unknown>) {
  return (
    (typeof toolCall.title === "string" && toolCall.title) ||
    (typeof toolCall.kind === "string" && toolCall.kind) ||
    (typeof toolCall.name === "string" && toolCall.name) ||
    "gemini_tool_call"
  );
}

function mapToolStatus(status: unknown): GeminiMirrorToolState {
  switch (status) {
    case "completed":
    case "success":
      return "output-available";
    case "error":
    case "failed":
      return "output-error";
    case "cancelled":
      return "output-denied";
    case "in_progress":
    case "running":
      return "input-streaming";
    case "pending":
    default:
      return "input-available";
  }
}

function buildGeminiPermissionOutcome(
  request: PendingGeminiApproval,
  response: ThreadToolApprovalResponse,
) {
  if (!response.approved) {
    return {
      outcome: {
        outcome: "cancelled",
      },
    };
  }

  const selectedOptionId =
    response.decision ??
    request.options.find((option) => option.kind === "allow_once")?.optionId ??
    request.options[0]?.optionId;

  if (!selectedOptionId) {
    return {
      outcome: {
        outcome: "cancelled",
      },
    };
  }

  return {
    outcome: {
      optionId: selectedOptionId,
      outcome: "selected",
    },
  };
}

async function handleGeminiSessionUpdate(
  control: ActiveGeminiRunControl,
  params: unknown,
) {
  const payload = (params ?? {}) as {
    sessionId?: string;
    update?: Record<string, unknown>;
  };
  if (payload.sessionId && payload.sessionId !== control.sessionId) {
    return;
  }

  const update = payload.update ?? {};
  const updateType = update.sessionUpdate;

  switch (updateType) {
    case "agent_message_chunk":
    case "assistant_message_chunk": {
      const content = (update.content ?? {}) as Record<string, unknown>;
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof update.text === "string"
            ? update.text
            : "";
      control.mirror.text = appendGeminiText(control.mirror.text, text);
      await emitAssistantMessageUpdate(
        control.mirror,
        control.runId,
        "streaming",
      );
      control.eventChannel.emit({
        message: {
          id: control.mirror.assistantId,
          metadata: {
            runId: control.runId,
            status: "streaming",
          },
          parts: buildAssistantParts(control.mirror),
          role: "assistant",
        },
        runId: control.runId,
        type: "message.upsert",
      });
      return;
    }
    case "thought_chunk": {
      const content = (update.content ?? {}) as Record<string, unknown>;
      const text =
        typeof content.text === "string"
          ? content.text
          : typeof update.text === "string"
            ? update.text
            : "";
      control.mirror.reasoningText = appendGeminiText(
        control.mirror.reasoningText,
        text,
      );
      await emitAssistantMessageUpdate(
        control.mirror,
        control.runId,
        "streaming",
      );
      return;
    }
    case "tool_call": {
      const toolCall = (update.toolCall ?? update) as Record<string, unknown>;
      const toolCallId =
        (typeof toolCall.toolCallId === "string" && toolCall.toolCallId) ||
        (typeof update.toolCallId === "string" && update.toolCallId) ||
        crypto.randomUUID();
      upsertGeminiTool(control.mirror, {
        id: toolCallId,
        input: toolCall,
        name: `gemini_${String(inferToolName(toolCall)).replace(/\s+/g, "_").toLowerCase()}`,
        state: mapToolStatus(toolCall.status),
      });
      await emitAssistantMessageUpdate(
        control.mirror,
        control.runId,
        "streaming",
      );
      return;
    }
    case "tool_call_update": {
      const toolCallId =
        (typeof update.toolCallId === "string" && update.toolCallId) ||
        crypto.randomUUID();
      const toolOutput = (update.content ?? update.output ?? update) as Record<
        string,
        unknown
      >;
      upsertGeminiTool(control.mirror, {
        ...(mapToolStatus(update.status) === "output-error"
          ? {
              errorText:
                (typeof update.error === "string" && update.error) ||
                (typeof toolOutput.error === "string" && toolOutput.error) ||
                "Gemini tool call failed.",
            }
          : { output: toolOutput }),
        id: toolCallId,
        name: "gemini_tool_call",
        state: mapToolStatus(update.status),
      });
      await emitAssistantMessageUpdate(
        control.mirror,
        control.runId,
        "streaming",
      );
      return;
    }
    case "current_mode_update":
      control.mirror.sessionMode =
        typeof update.currentModeId === "string"
          ? (update.currentModeId as GeminiSessionMode)
          : control.mirror.sessionMode;
      persist.updateGeminiThreadState(control.threadId, {
        cliVersion: null,
        cwd: null,
        modelId: control.mirror.requestedModelId,
        sessionId: control.sessionId,
        sessionMode: control.mirror.sessionMode,
      });
      return;
    case "session_info_update":
      if (typeof update.title === "string" && update.title.trim()) {
        persist.updateThreadTitle(control.threadId, update.title);
        await emitThreadSnapshot(control.threadId, control.eventChannel);
      }
      return;
    case "usage_update": {
      const usage = (update.usage ?? update) as Record<string, unknown>;
      control.mirror.usage = {
        ...(typeof usage.inputTokens === "number"
          ? { inputTokens: usage.inputTokens }
          : {}),
        ...(typeof usage.outputTokens === "number"
          ? { outputTokens: usage.outputTokens }
          : {}),
        ...(typeof usage.totalTokens === "number"
          ? { totalTokens: usage.totalTokens }
          : {}),
      };
      return;
    }
    default:
      return;
  }
}

async function finishGeminiRun(
  control: ActiveGeminiRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "completed" | "error" | "cancelled";
    threadStatus: "awaiting_approval" | "idle";
  },
) {
  const repoCheckpointId =
    input.status === "completed"
      ? await finalizeThreadRepoCheckpointRun({
          assistantMessageId: control.assistantId,
          runId: control.runId,
          threadId: control.threadId,
        }).catch(() => null)
      : null;

  if (input.status !== "completed") {
    await clearThreadRepoCheckpointRun(control.runId);
  }

  persist.clearActiveStream(control.threadId);
  persist.setThreadStatus(control.threadId, input.threadStatus);

  await emitAssistantMessageUpdate(
    control.mirror,
    control.runId,
    input.status,
    {
      errorMessage: input.errorMessage,
      finishReason: input.finishReason,
      repoCheckpointId,
    },
  );
  await emitThreadSnapshot(control.threadId, control.eventChannel);

  control.eventChannel.emit({
    runId: control.runId,
    threadStatus: input.threadStatus,
    type:
      input.status === "completed"
        ? "run.finished"
        : input.status === "cancelled"
          ? "run.cancelled"
          : "run.failed",
    ...(input.status === "error" && input.errorMessage
      ? { error: input.errorMessage }
      : {}),
  } as ThreadStreamEvent);

  control.fsProxyCleanup?.();
  await control.client.close().catch(() => {});
  control.eventChannel.close();
  activeGeminiRunControls.delete(control.runId);
}

export async function stopGeminiThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const activeRunId = existingThread?.activeStreamId ?? null;
  const control = activeRunId
    ? (activeGeminiRunControls.get(activeRunId) ?? null)
    : findActiveGeminiRunForThread(request.threadId);

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
    return new Response(null, { status: 204 });
  }

  for (const [requestId, pending] of control.pendingRequests.entries()) {
    if (pending.type === "permission") {
      await control.client.respond(requestId, {
        outcome: { outcome: "cancelled" },
      });
    }
  }

  await control.client.cancel({ sessionId: control.sessionId }).catch(() => {});
  await finishGeminiRun(control, {
    errorMessage: "Generation stopped.",
    finishReason: "cancelled",
    status: "cancelled",
    threadStatus: "idle",
  });
  return new Response(null, { status: 204 });
}

export async function runGeminiThreadChat(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  if (request.trigger === "submit-tool-approval") {
    const control = existingThread?.activeStreamId
      ? (activeGeminiRunControls.get(existingThread.activeStreamId) ?? null)
      : findActiveGeminiRunForThread(request.threadId);
    const response = request.toolApprovalResponse;

    if (!control || !response) {
      throw new ThreadChatConflictError(
        "That Gemini approval request is no longer active.",
      );
    }

    const pending = control.pendingRequests.get(response.id);
    if (!pending) {
      throw new ThreadChatConflictError(
        "That Gemini approval request is no longer active.",
      );
    }

    control.pendingRequests.delete(response.id);
    if (pending.type === "permission") {
      await control.client.respond(
        response.id,
        buildGeminiPermissionOutcome(pending, response),
      );
      upsertGeminiTool(control.mirror, {
        approval: {
          id: response.id,
          optionId: response.decision,
          options: pending.options,
          ...(response.response ? { response: response.response } : {}),
        },
        id: response.id,
        input: pending.toolCall,
        name: "gemini_request_permission",
        state: "approval-responded",
      });
    } else {
      await control.client.respond(response.id, {
        response: response.response ?? "",
      });
      upsertGeminiTool(control.mirror, {
        approval: {
          id: response.id,
          ...(response.response ? { response: response.response } : {}),
        },
        id: response.id,
        name: "requestUserInput",
        output: { response: response.response ?? "" },
        state: "output-available",
      });
    }

    persist.setThreadStatus(request.threadId, "streaming");
    await emitAssistantMessageUpdate(
      control.mirror,
      control.runId,
      "streaming",
    );
    await emitThreadSnapshot(request.threadId, control.eventChannel);
    return new Response(null, { status: 204 });
  }

  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The Gemini engine does not support "${request.trigger}" yet.`,
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
    "gemini",
    request.draftRepoState ? { repo: request.draftRepoState } : null,
  );

  const workspaceRoot = await getWorkspaceRootPath(
    request.workspaceId,
    request.userId,
    request.threadId,
  );
  const permissionMode = await getToolPermissionMode(
    request.userId,
    request.workspaceId,
  );
  const desiredMode = getGeminiSessionMode({
    permissionMode,
    threadMode,
  });
  const existingGeminiState = getGeminiThreadState(
    existingThread?.chatEngineState,
  );
  const requestedModelId =
    request.modelId ?? existingGeminiState?.modelId ?? null;
  const runId = generateId();
  const assistantId = crypto.randomUUID();
  const eventChannel = await createThreadEventChannel(runId);
  const client = await createGeminiAcpClient();
  const mirror = createGeminiMirrorState({
    assistantId,
    requestedModelId,
    responseModelId: requestedModelId,
    sessionId: existingGeminiState?.sessionId ?? crypto.randomUUID(),
    sessionMode: desiredMode,
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
        requestedModelId,
        runId,
      }),
    );
    await persist.setActiveMessage(request.threadId, assistantId);
    persist.setActiveStream(request.threadId, runId);
    persist.setThreadStatus(request.threadId, "streaming");
    await persist.updateThreadChatSettings(request.threadId, {
      engine: "gemini",
      modelId: requestedModelId,
      mode: threadMode,
      reasoningEffort: request.reasoningEffort ?? null,
    });
    await beginThreadRepoCheckpointRun({
      projectPath: workspaceRoot,
      runId,
      thread: existingThread,
    });

    const mcpServers = await getMcpServerRuntime(request.userId);
    await initializeGeminiSessionClient({
      client,
      mcpServers,
      workspaceRoot,
    });

    let sessionId = existingGeminiState?.sessionId ?? null;
    if (sessionId) {
      await client.loadSession({
        cwd: workspaceRoot ?? existingGeminiState?.cwd ?? process.cwd(),
        mcpServers: mcpServers
          .filter((entry) => entry.isEnabled)
          .map((entry) => ({ name: entry.name })),
        sessionId,
      });
    } else {
      const created = (await client.newSession({
        cwd: workspaceRoot ?? process.cwd(),
        mcpServers: mcpServers
          .filter((entry) => entry.isEnabled)
          .map((entry) => ({ name: entry.name })),
      })) as { modes?: { currentModeId?: string }; sessionId?: string };
      sessionId =
        (typeof created.sessionId === "string" && created.sessionId) ||
        crypto.randomUUID();
      mirror.sessionId = sessionId;
      if (typeof created.modes?.currentModeId === "string") {
        mirror.sessionMode = created.modes.currentModeId as GeminiSessionMode;
      }
    }

    const fsProxyCleanup = await setupGeminiFsProxy({
      client,
      sessionId,
      workspaceRoot,
    });

    const control: ActiveGeminiRunControl = {
      assistantId,
      client,
      eventChannel,
      fsProxyCleanup,
      mirror: { ...mirror, sessionId },
      pendingRequests: new Map(),
      runId,
      sessionId,
      threadId: request.threadId,
    };

    const unsubscribe = client.subscribe((event) => {
      void (async () => {
        if (
          event.type === "notification" &&
          event.method === "session/update"
        ) {
          await handleGeminiSessionUpdate(control, event.params);
          return;
        }

        if (
          event.type === "request" &&
          event.method === "session/request_permission"
        ) {
          const params = (event.params ?? {}) as {
            options?: Array<{
              kind?: string;
              name?: string;
              optionId: string;
            }>;
            toolCall?: Record<string, unknown>;
          };
          control.pendingRequests.set(event.id, {
            options: params.options ?? [],
            toolCall: params.toolCall,
            type: "permission",
          });
          upsertGeminiTool(control.mirror, {
            approval: {
              id: event.id,
              options: params.options,
            },
            id: event.id,
            input: params.toolCall,
            name: "gemini_request_permission",
            state: "approval-requested",
          });
          persist.setThreadStatus(request.threadId, "awaiting_approval");
          await emitAssistantMessageUpdate(control.mirror, runId, "streaming");
          await emitThreadSnapshot(request.threadId, eventChannel);
          return;
        }

        if (
          event.type === "request" &&
          (event.method === "requestUserInput" ||
            event.method === "session/request_input")
        ) {
          control.pendingRequests.set(event.id, {
            description: "Gemini requested input.",
            type: "input",
          });
          upsertGeminiTool(control.mirror, {
            approval: { id: event.id },
            id: event.id,
            name: "requestUserInput",
            state: "approval-requested",
          });
          persist.setThreadStatus(request.threadId, "awaiting_approval");
          await emitAssistantMessageUpdate(control.mirror, runId, "streaming");
          await emitThreadSnapshot(request.threadId, eventChannel);
        }
      })();
    });

    activeGeminiRunControls.set(runId, control);

    if (desiredMode !== existingGeminiState?.sessionMode) {
      await client
        .setSessionMode({
          modeId: desiredMode,
          sessionId,
        })
        .catch((error) => {
          log.warn("gemini_set_mode_failed", {
            error,
            sessionId,
            threadId: request.threadId,
          });
        });
    }

    if (requestedModelId && requestedModelId !== existingGeminiState?.modelId) {
      await client
        .setSessionModel({
          modelId: requestedModelId,
          sessionId,
        })
        .catch((error) => {
          log.warn("gemini_set_model_failed", {
            error,
            modelId: requestedModelId,
            sessionId,
            threadId: request.threadId,
          });
        });
    }

    persist.updateGeminiThreadState(request.threadId, {
      cliVersion: null,
      cwd: workspaceRoot,
      modelId: requestedModelId,
      sessionId,
      sessionMode: desiredMode,
    });

    await emitThreadSnapshot(request.threadId, eventChannel);
    eventChannel.emit({ runId, type: "run.started" });

    const promptResponse = (await client.prompt({
      prompt: [
        {
          text:
            request.message?.parts
              .filter(
                (
                  part,
                ): part is Extract<
                  ThreadUIMessage["parts"][number],
                  { type: "text" }
                > => part.type === "text",
              )
              .map((part) => part.text)
              .join("\n\n") ?? "",
          type: "text",
        },
      ],
      sessionId,
    })) as { stopReason?: string };

    unsubscribe();
    await finishGeminiRun(control, {
      finishReason: promptResponse.stopReason ?? "end_turn",
      status:
        promptResponse.stopReason === "cancelled" ? "cancelled" : "completed",
      threadStatus: "idle",
    });

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
    eventChannel.close();
    await client.close().catch(() => {});
    throw error;
  }
}
