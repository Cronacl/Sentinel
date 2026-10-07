import "server-only";

import { generateId } from "ai";
import type {
  AssistantUsageEvent,
  CopilotSession,
  PermissionRequest,
  PermissionRequestResult,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";

import {
  buildCopilotThreadState,
  getCopilotClientManager,
  normalizeCopilotErrorMessage,
} from "@/lib/ai/chat/engines/copilot-sdk";
import { getCopilotThreadState } from "@/lib/ai/chat/engines/types";
import {
  mergeThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";
import { createLogger } from "@/lib/logger";
import { normalizeThreadMode } from "@/lib/plan";

import {
  normalizeThreadChatErrorMessage,
  ThreadChatConflictError,
} from "../../errors";
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
  resolveCopilotPromptResponse,
  type CopilotPromptResponse,
} from "./event-helpers";
import { buildPlanModePromptPreamble } from "../plan-mode-instructions";
import {
  buildCopilotPermissionToolName,
  buildCopilotRejectedPermission,
  COPILOT_AUTO_APPROVED_PERMISSION,
  COPILOT_USER_APPROVED_PERMISSION,
  COPILOT_USER_UNAVAILABLE_PERMISSION,
  describeCopilotPermissionRequest,
  isCopilotSubAgentEvent,
  requiresApprovalForCopilotPermission,
  toCopilotSdkReasoningEffort,
} from "./permissions";
import {
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWorkspaceRootPath,
} from "../workspace";
import {
  activeCopilotRunControls,
  resolveActiveCopilotRunControl,
} from "./state";

const log = createLogger("CopilotThreadChat");

type CopilotUserInputHandler = NonNullable<SessionConfig["onUserInputRequest"]>;
type CopilotUserInputRequest = Parameters<CopilotUserInputHandler>[0];
type CopilotUserInputResponse = Awaited<ReturnType<CopilotUserInputHandler>>;

type CopilotMirrorToolState =
  | "approval-requested"
  | "approval-responded"
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-denied"
  | "output-error";

type CopilotMirrorTool = {
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
  state: CopilotMirrorToolState;
};

type CopilotMirrorState = {
  assistantId: string;
  nextOrder: number;
  requestedModelId: string | null;
  responseModelId: string | null;
  reasoningText: string;
  sessionId: string;
  text: string;
  textOrder: number;
  threadId: string;
  tools: Map<string, CopilotMirrorTool>;
  usage: {
    contextWindow?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
};

type PendingCopilotApproval = {
  request: PermissionRequest;
  resolve: (result: PermissionRequestResult) => void;
  toolCallId: string;
  toolName: string;
};

type PendingCopilotUserInput = {
  request: CopilotUserInputRequest;
  resolve: (result: CopilotUserInputResponse) => void;
  toolCallId: string;
};

export type ActiveCopilotRunControl = {
  abortController: AbortController;
  assistantId: string;
  eventChannel: ThreadEventChannel;
  eventQueue: Promise<void>;
  finished: boolean;
  pendingApprovals: Map<string, PendingCopilotApproval>;
  pendingQuestions: Map<string, PendingCopilotUserInput>;
  runId: string;
  session: CopilotSession;
  sessionId: string;
  state: CopilotMirrorState;
  threadId: string;
  userId: string;
  workspaceId: string;
};

function sanitizeCopilotMirrorTool(tool: CopilotMirrorTool): CopilotMirrorTool {
  const next: CopilotMirrorTool = { ...tool };

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

function createCopilotMirrorState(input: {
  assistantId: string;
  requestedModelId: string | null;
  responseModelId: string | null;
  sessionId: string;
  threadId: string;
}): CopilotMirrorState {
  return {
    assistantId: input.assistantId,
    nextOrder: 0,
    requestedModelId: input.requestedModelId,
    responseModelId: input.responseModelId,
    reasoningText: "",
    sessionId: input.sessionId,
    text: "",
    textOrder: -1,
    threadId: input.threadId,
    tools: new Map(),
    usage: null,
  };
}

function getNextOrder(state: CopilotMirrorState) {
  const order = state.nextOrder;
  state.nextOrder += 1;
  return order;
}

function getToolOrder(state: CopilotMirrorState, toolId: string) {
  const existing = state.tools.get(toolId);
  if (existing) {
    return existing.order;
  }

  return getNextOrder(state);
}

function normalizeCopilotToolName(toolName: string) {
  return `copilot_${toolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")}`;
}

function buildCopilotUserInputToolInput(request: CopilotUserInputRequest) {
  if (Array.isArray(request.choices) && request.choices.length > 0) {
    return {
      questions: [
        {
          allowMultiple: false,
          header: "Response",
          multiSelect: false,
          options: request.choices.map((choice: string) => ({
            description: `Choose "${choice}".`,
            label: choice,
          })),
          question: request.question,
        },
      ],
    };
  }

  return {
    prompt: request.question,
  };
}

function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(url);
  if (!match) {
    return null;
  }

  return {
    data: match[2] ?? "",
    isBase64: /;base64,/i.test(url),
    mimeType: match[1] ?? "application/octet-stream",
  };
}

function buildCopilotPromptText(message: ThreadUIMessage) {
  const textParts = message.parts.filter(
    (
      part,
    ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
      part.type === "text",
  );

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

  return text.trim();
}

function buildCopilotMessagePayload(input: {
  message: ThreadUIMessage;
  promptOverride?: string | null;
}) {
  const fileParts = input.message.parts.filter(
    (
      part,
    ): part is Extract<ThreadUIMessage["parts"][number], { type: "file" }> =>
      part.type === "file",
  );

  const attachments = fileParts
    .map((part) => {
      const parsed = parseDataUrl(part.url);
      if (!parsed?.isBase64) {
        return null;
      }

      return {
        data: parsed.data,
        displayName: part.filename ?? "Attachment",
        mimeType: parsed.mimeType,
        type: "blob" as const,
      };
    })
    .filter((attachment): attachment is NonNullable<typeof attachment> =>
      Boolean(attachment),
    );

  const prompt =
    input.promptOverride?.trim() || buildCopilotPromptText(input.message);

  return {
    ...(attachments.length > 0 ? { attachments } : {}),
    mode: "immediate" as const,
    prompt: prompt || "Continue.",
  };
}

function formatCopilotTranscriptMessage(message: ThreadUIMessage) {
  const text = message.parts
    .map((part) => {
      if (part.type === "text") {
        return part.text.trim();
      }

      if (part.type === "file") {
        return `[Attachment: ${part.filename ?? part.mediaType}]`;
      }

      if (part.type === "reasoning") {
        return `[Reasoning omitted]`;
      }

      if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
        return `[Tool: ${"toolName" in part ? part.toolName : part.type.slice(5)}]`;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    return null;
  }

  return `${message.role.toUpperCase()}: ${text}`;
}

function buildTranscriptBootstrapPrompt(
  transcript: ThreadUIMessage[],
  threadMode: "chat" | "plan",
) {
  const renderedTranscript = transcript
    .map(formatCopilotTranscriptMessage)
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");

  const planModePreamble =
    threadMode === "plan"
      ? buildPlanModePromptPreamble(
          "Plan Mode is active for this fresh Copilot session. Follow the full contract below for the first response and continue honoring it until the mode changes.",
        )
      : null;

  if (!renderedTranscript) {
    return planModePreamble;
  }

  return [
    "Continue this Sentinel conversation faithfully.",
    ...(planModePreamble
      ? [planModePreamble]
      : [`Current mode: ${threadMode}.`]),
    "The prior transcript follows. Use it as conversation context, then continue naturally from the final user message.",
    "",
    renderedTranscript,
  ].join("\n");
}

function upsertCopilotTool(
  state: CopilotMirrorState,
  input: {
    approval?: CopilotMirrorTool["approval"];
    errorText?: string;
    id: string;
    input?: unknown;
    name: string;
    output?: unknown;
    state: CopilotMirrorToolState;
  },
) {
  const order = getToolOrder(state, input.id);
  const existing = state.tools.get(input.id);

  state.tools.set(
    input.id,
    sanitizeCopilotMirrorTool({
      approval: input.approval ?? existing?.approval,
      errorText: input.errorText ?? existing?.errorText,
      id: input.id,
      input: input.input ?? existing?.input,
      name: input.name,
      order,
      output: input.output ?? existing?.output,
      state: input.state,
    }),
  );
}

function buildAssistantParts(state: CopilotMirrorState) {
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
  const hasText = state.text.trim().length > 0;

  type OrderedItem =
    | { kind: "text"; order: number; text: string }
    | { kind: "tool"; order: number; tool: CopilotMirrorTool };

  const items: OrderedItem[] = [
    ...orderedTools.map((tool) => ({
      kind: "tool" as const,
      order: tool.order,
      tool,
    })),
    ...(hasText
      ? [{ kind: "text" as const, order: state.textOrder, text: state.text }]
      : []),
  ].sort((left, right) => left.order - right.order);

  for (const item of items) {
    if (item.kind === "text") {
      parts.push({
        text: item.text.trim(),
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

function updateCopilotUsage(
  state: CopilotMirrorState,
  event: AssistantUsageEvent,
) {
  const inputTokens = event.data.inputTokens;
  const outputTokens = event.data.outputTokens;

  state.responseModelId = event.data.model ?? state.responseModelId;
  state.usage = {
    ...(typeof inputTokens === "number" ? { inputTokens } : {}),
    ...(typeof outputTokens === "number" ? { outputTokens } : {}),
    ...(typeof inputTokens === "number" && typeof outputTokens === "number"
      ? { totalTokens: inputTokens + outputTokens }
      : {}),
  };
}

async function emitAssistantMessageUpdate(
  state: CopilotMirrorState,
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

function shouldGenerateRuntimeThreadTitle(input: {
  existingTitle?: string | null;
  messageCount: number;
  trigger: ThreadChatRequest["trigger"];
}) {
  return (
    input.trigger === "submit-user-message" &&
    input.messageCount === 0 &&
    (!input.existingTitle || input.existingTitle === "New thread")
  );
}

function launchCopilotThreadTitleGeneration(input: {
  eventChannel: ThreadEventChannel;
  existingThreadTitle?: string | null;
  messageCount: number;
  request: Pick<ThreadChatRequest, "message" | "threadId" | "trigger">;
}) {
  if (
    !shouldGenerateRuntimeThreadTitle({
      existingTitle: input.existingThreadTitle,
      messageCount: input.messageCount,
      trigger: input.request.trigger,
    })
  ) {
    return;
  }

  const firstUserText = getFirstUserText(
    input.request.message ? [input.request.message] : [],
  );
  const title = buildFirstUserMessageTitle(firstUserText);
  if (title === "New thread") {
    return;
  }

  persist.updateThreadTitle(input.request.threadId, title);
  void emitThreadSnapshot(input.request.threadId, input.eventChannel);
}

async function applyCopilotPromptResponse(
  control: ActiveCopilotRunControl,
  response: CopilotPromptResponse,
) {
  if (response.kind === "user-input") {
    const pendingQuestion = control.pendingQuestions.get(response.approvalId);
    if (!pendingQuestion) {
      return false;
    }

    control.pendingQuestions.delete(response.approvalId);
    upsertCopilotTool(control.state, {
      approval: {
        id: response.approvalId,
        response: response.response,
      },
      id: pendingQuestion.toolCallId,
      input: buildCopilotUserInputToolInput(pendingQuestion.request),
      name: "copilot_request_user_input",
      state: "input-available",
    });
    pendingQuestion.resolve({
      answer: response.response,
      wasFreeform: true,
    });
  } else {
    const pendingApproval = control.pendingApprovals.get(response.approvalId);
    if (!pendingApproval) {
      return false;
    }

    control.pendingApprovals.delete(response.approvalId);
    upsertCopilotTool(control.state, {
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
      id: pendingApproval.toolCallId,
      input: pendingApproval.request,
      name: pendingApproval.toolName,
      state: response.approved === false ? "output-denied" : "input-available",
    });
    pendingApproval.resolve(
      response.approved === false
        ? buildCopilotRejectedPermission(response.response ?? response.reason)
        : COPILOT_USER_APPROVED_PERMISSION,
    );
  }

  persist.setThreadStatus(control.threadId, "streaming");
  await emitAssistantMessageUpdate(control.state, control.runId, "streaming");
  await emitThreadSnapshot(control.threadId, control.eventChannel);
  return true;
}

async function finishCopilotRun(
  control: ActiveCopilotRunControl,
  input: {
    errorMessage?: string | null;
    finishReason?: string | null;
    status: "completed" | "error" | "cancelled";
    threadStatus: "idle" | "streaming" | "awaiting_approval";
  },
) {
  if (control.finished) {
    return;
  }

  control.finished = true;

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
    pending.resolve(COPILOT_USER_UNAVAILABLE_PERMISSION);
    control.pendingApprovals.delete(id);
  }

  for (const [id, pending] of control.pendingQuestions) {
    pending.resolve({
      answer: "",
      wasFreeform: true,
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
  const errorMessage =
    input.status === "error"
      ? normalizeThreadChatErrorMessage(
          input.errorMessage,
          "GitHub Copilot run failed.",
        )
      : (input.errorMessage ?? null);

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
  await emitThreadSnapshot(control.threadId, control.eventChannel);

  if (input.status === "cancelled") {
    control.eventChannel.emit({
      messageId: control.assistantId,
      runId: control.runId,
      threadStatus: input.threadStatus,
      type: "run.cancelled",
    });
  } else if (input.status === "error") {
    log.error("copilot_run_failed", {
      error: errorMessage,
      runId: control.runId,
      threadId: control.threadId,
      userId: control.userId,
      workspaceId: control.workspaceId,
    });
    control.eventChannel.emit({
      error: errorMessage ?? "GitHub Copilot run failed.",
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
  activeCopilotRunControls.delete(control.runId);

  await control.session.disconnect().catch((error) => {
    log.warn("copilot_disconnect_failed", {
      error,
      threadId: control.threadId,
    });
  });

  if (input.threadStatus === "idle" && input.status !== "error") {
    try {
      await drainQueuedCopilotFollowUp({
        threadId: control.threadId,
        userId: control.userId,
        workspaceId: control.workspaceId,
      });
    } catch (error) {
      log.error("copilot_follow_up_drain_failed", {
        error,
        threadId: control.threadId,
      });
    }
  }
}

const COPILOT_MAIN_AGENT_EVENT_TYPES = new Set<SessionEvent["type"]>([
  "assistant.message",
  "assistant.message_delta",
  "assistant.usage",
  "session.error",
  "session.idle",
  "session.model_change",
]);

async function handleCopilotEvent(
  control: ActiveCopilotRunControl,
  event: SessionEvent,
) {
  if (control.finished) {
    return;
  }

  // Sub-agent text, usage, model switches and errors belong to the sub-agent's
  // task tool call, not to the main assistant message or the run's outcome.
  // Their tool executions still render as tool parts.
  if (
    isCopilotSubAgentEvent(event) &&
    COPILOT_MAIN_AGENT_EVENT_TYPES.has(event.type)
  ) {
    return;
  }

  switch (event.type) {
    case "assistant.message_delta":
      if (control.state.textOrder < 0) {
        control.state.textOrder = getNextOrder(control.state);
      }
      control.state.text += event.data.deltaContent;
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "assistant.message":
      control.state.text = event.data.content ?? control.state.text;
      if (control.state.textOrder < 0 && control.state.text.trim()) {
        control.state.textOrder = getNextOrder(control.state);
      }
      control.state.reasoningText =
        event.data.reasoningText ?? control.state.reasoningText;

      for (const toolRequest of event.data.toolRequests ?? []) {
        upsertCopilotTool(control.state, {
          id: toolRequest.toolCallId,
          input: toolRequest.arguments,
          name: normalizeCopilotToolName(toolRequest.name),
          state:
            control.state.tools.get(toolRequest.toolCallId)?.state ??
            "input-available",
        });
      }

      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "assistant.usage":
      updateCopilotUsage(control.state, event);
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "tool.execution_start":
      upsertCopilotTool(control.state, {
        id: event.data.toolCallId,
        input: event.data.arguments,
        name: normalizeCopilotToolName(event.data.toolName),
        state: "input-streaming",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "tool.execution_progress": {
      const existing = control.state.tools.get(event.data.toolCallId);
      upsertCopilotTool(control.state, {
        id: event.data.toolCallId,
        input: existing?.input,
        name: existing?.name ?? "copilot_runtime",
        output:
          existing?.output && typeof existing.output === "object"
            ? {
                ...(existing.output as Record<string, unknown>),
                progressMessage: event.data.progressMessage,
              }
            : { progressMessage: event.data.progressMessage },
        state: "input-streaming",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    }
    case "tool.execution_partial_result": {
      const existing = control.state.tools.get(event.data.toolCallId);
      const previousText =
        existing?.output &&
        typeof existing.output === "object" &&
        typeof (existing.output as Record<string, unknown>).partialOutput ===
          "string"
          ? ((existing.output as Record<string, unknown>)
              .partialOutput as string)
          : "";
      upsertCopilotTool(control.state, {
        id: event.data.toolCallId,
        input: existing?.input,
        name: existing?.name ?? "copilot_runtime",
        output: {
          ...(existing?.output &&
          typeof existing.output === "object" &&
          !Array.isArray(existing.output)
            ? (existing.output as Record<string, unknown>)
            : {}),
          partialOutput: `${previousText}${event.data.partialOutput}`,
        },
        state: "input-streaming",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    }
    case "tool.execution_complete":
      upsertCopilotTool(control.state, {
        ...(event.data.error?.message
          ? { errorText: event.data.error.message }
          : {}),
        id: event.data.toolCallId,
        name:
          control.state.tools.get(event.data.toolCallId)?.name ??
          "copilot_runtime",
        output: event.data.success
          ? (event.data.result ?? { success: true })
          : (event.data.error ?? { success: false }),
        state: event.data.success ? "output-available" : "output-error",
      });
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "session.model_change":
      control.state.responseModelId =
        event.data.newModel ?? control.state.responseModelId;
      await emitAssistantMessageUpdate(
        control.state,
        control.runId,
        "streaming",
      );
      await emitThreadSnapshot(control.threadId, control.eventChannel);
      return;
    case "session.error":
      await finishCopilotRun(control, {
        errorMessage: normalizeCopilotErrorMessage(
          event.data.message,
          "GitHub Copilot run failed.",
        ),
        finishReason: event.data.errorType ?? null,
        status: "error",
        threadStatus: "idle",
      });
      return;
    case "session.idle":
      await finishCopilotRun(control, {
        finishReason: event.data.aborted ? "aborted" : "stop",
        status: event.data.aborted ? "cancelled" : "completed",
        threadStatus: "idle",
      });
      return;
    default:
      return;
  }
}

function enqueueCopilotEvent(
  control: ActiveCopilotRunControl,
  event: SessionEvent,
) {
  control.eventQueue = control.eventQueue
    .then(() => handleCopilotEvent(control, event))
    .catch((error) => {
      log.error("copilot_event_processing_failed", {
        error,
        eventType: event.type,
        threadId: control.threadId,
      });
      return finishCopilotRun(control, {
        errorMessage: normalizeCopilotErrorMessage(error),
        finishReason: null,
        status: "error",
        threadStatus: "idle",
      });
    });
}

async function drainQueuedCopilotFollowUp(
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
    await runCopilotThreadChat(
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

export async function stopCopilotThreadRun(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
) {
  const copilotState = getCopilotThreadState(existingThread?.chatEngineState);
  const activeRunId = existingThread?.activeStreamId ?? null;
  const control = resolveActiveCopilotRunControl({
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
    if (copilotState) {
      persist.updateCopilotThreadState(request.threadId, copilotState);
    }

    try {
      await drainQueuedCopilotFollowUp(request);
    } catch (error) {
      log.error("copilot_follow_up_drain_failed", {
        error,
        threadId: request.threadId,
      });
    }

    return new Response(null, { status: 204 });
  }

  await control.session.abort().catch((error) => {
    log.warn("copilot_abort_failed", { error, threadId: request.threadId });
  });
  control.abortController.abort(new Error("Generation stopped."));
  await finishCopilotRun(control, {
    errorMessage: "Generation stopped.",
    finishReason: null,
    status: "cancelled",
    threadStatus: "idle",
  });

  return new Response(null, { status: 204 });
}

function buildCopilotSessionConfig(input: {
  cwd: string;
  modelId: string | null;
  onEvent: (event: SessionEvent) => void;
  onPermissionRequest: NonNullable<SessionConfig["onPermissionRequest"]>;
  onUserInputRequest: NonNullable<SessionConfig["onUserInputRequest"]>;
  reasoningEffort: ReturnType<typeof toCopilotSdkReasoningEffort>;
}) {
  return {
    clientName: "sentinel",
    // Sentinel has no sub-agent stream view yet; non-streaming sub-agent events
    // and subagent.* lifecycle events still arrive.
    includeSubAgentStreamingEvents: false,
    ...(input.modelId ? { model: input.modelId } : {}),
    ...(input.reasoningEffort
      ? { reasoningEffort: input.reasoningEffort }
      : {}),
    onEvent: input.onEvent,
    onPermissionRequest: input.onPermissionRequest,
    onUserInputRequest: input.onUserInputRequest,
    streaming: true,
    workingDirectory: input.cwd,
  } satisfies SessionConfig;
}

export async function runCopilotThreadChat(
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

    const activeControl = resolveActiveCopilotRunControl({
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
    const response = resolveCopilotPromptResponse({
      messages: request.messages,
      pendingKind,
      toolApprovalResponse: request.toolApprovalResponse,
    });

    if (!response) {
      throw new Error("Unable to resolve the Copilot prompt response.");
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
        "That GitHub Copilot approval request is no longer active.",
      );
    }

    const applied = await applyCopilotPromptResponse(activeControl, response);
    if (!applied) {
      throw new ThreadChatConflictError(
        "That GitHub Copilot approval request is no longer active.",
      );
    }

    return new Response(null, { status: 204 });
  }

  if (
    request.trigger !== "submit-user-message" &&
    request.trigger !== "edit-user-message"
  ) {
    throw new Error(
      `The GitHub Copilot engine does not support "${request.trigger}" yet.`,
    );
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const checkpointAnchorMessageId =
    getThreadCheckpointAnchorMessageId(existingThread);
  const transcript = truncateTranscriptAtMessage(
    buildActiveThreadMessages(allRecords),
    checkpointAnchorMessageId,
  );
  const modelTranscript = buildModelTranscript(request, transcript, allRecords);
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

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    "copilot",
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
    request.threadId,
  );
  const toolApprovalPolicies = await getToolApprovalPolicies(request.userId);
  const existingCopilotState = getCopilotThreadState(
    existingThread?.chatEngineState,
  );
  const requestedModelId =
    request.modelId ?? existingCopilotState?.modelId ?? null;
  const cwd = workspaceRoot ?? existingCopilotState?.cwd ?? process.cwd();
  const didThreadModeChange =
    existingThread?.mode != null &&
    normalizeThreadMode(existingThread.mode) !== threadMode;
  const shouldCreateFreshSession =
    request.trigger === "edit-user-message" ||
    didThreadModeChange ||
    !existingCopilotState?.sessionId;
  const bootstrapPrompt =
    shouldCreateFreshSession && request.message
      ? buildTranscriptBootstrapPrompt(modelTranscript, threadMode)
      : null;

  const requestedReasoningEffort =
    request.reasoningEffort ?? existingCopilotState?.reasoningEffort ?? null;

  const runId = generateId();
  const assistantId = crypto.randomUUID();
  const eventChannel = await createThreadEventChannel(runId);
  const abortController = new AbortController();
  const pendingApprovals = new Map<string, PendingCopilotApproval>();
  const pendingQuestions = new Map<string, PendingCopilotUserInput>();
  let control: ActiveCopilotRunControl | null = null;

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

    // Only xhigh depends on the model: send it when the model lists it (or
    // when its efforts are unknown) and fall back to high otherwise.
    const supportedReasoningEfforts =
      requestedReasoningEffort === "xhigh" && requestedModelId
        ? await getCopilotClientManager().getSupportedReasoningEfforts(
            requestedModelId,
          )
        : null;
    const reasoningEffort = toCopilotSdkReasoningEffort(
      requestedReasoningEffort,
      supportedReasoningEfforts,
    );

    await persist.updateThreadChatSettings(request.threadId, {
      engine: "copilot",
      modelId: requestedModelId,
      mode: threadMode,
      reasoningEffort: request.reasoningEffort
        ? (toCopilotSdkReasoningEffort(
            request.reasoningEffort,
            supportedReasoningEfforts,
          ) ?? null)
        : null,
    });
    void beginThreadRepoCheckpointRun({
      projectPath: workspaceRoot,
      runId,
      thread: existingThread,
    });

    const provisionalSessionId =
      existingCopilotState?.sessionId ?? `copilot-${request.threadId}`;
    const mirror = createCopilotMirrorState({
      assistantId,
      requestedModelId,
      responseModelId: requestedModelId,
      sessionId: provisionalSessionId,
      threadId: request.threadId,
    });

    // Every permission kind (shell, file, URL, memory, MCP, custom tool, hook,
    // extension, workflow) goes through the same Sentinel approval flow.
    const onPermissionRequest = async (
      normalizedRequest: PermissionRequest,
    ): Promise<PermissionRequestResult> => {
      const approvalId = crypto.randomUUID();
      const toolCallId = normalizedRequest.toolCallId ?? approvalId;
      const toolName = buildCopilotPermissionToolName(normalizedRequest);
      const reason = describeCopilotPermissionRequest(normalizedRequest);

      if (
        !requiresApprovalForCopilotPermission({
          permissionMode: workspacePermissionMode,
          policies: toolApprovalPolicies,
          request: normalizedRequest,
        })
      ) {
        return COPILOT_AUTO_APPROVED_PERMISSION;
      }

      upsertCopilotTool(mirror, {
        approval: {
          id: approvalId,
          reason,
        },
        id: toolCallId,
        input: normalizedRequest,
        name: toolName,
        state: "approval-requested",
      });
      // Register the resolver before the approval reaches the UI so an
      // immediate answer cannot land on a placeholder.
      const decision = new Promise<PermissionRequestResult>((resolve) => {
        pendingApprovals.set(approvalId, {
          request: normalizedRequest,
          resolve,
          toolCallId,
          toolName,
        });
      });
      persist.setThreadStatus(request.threadId, "awaiting_approval");
      await emitAssistantMessageUpdate(mirror, runId, "streaming");
      await emitThreadSnapshot(request.threadId, eventChannel);

      return await decision;
    };

    const onUserInputRequest: CopilotUserInputHandler = async (
      inputRequest,
    ) => {
      const approvalId = crypto.randomUUID();
      upsertCopilotTool(mirror, {
        approval: {
          id: approvalId,
        },
        id: approvalId,
        input: buildCopilotUserInputToolInput(inputRequest),
        name: "copilot_request_user_input",
        state: "approval-requested",
      });
      const answer = new Promise<CopilotUserInputResponse>((resolve) => {
        pendingQuestions.set(approvalId, {
          request: inputRequest,
          resolve,
          toolCallId: approvalId,
        });
      });
      persist.setThreadStatus(request.threadId, "awaiting_approval");
      await emitAssistantMessageUpdate(mirror, runId, "streaming");
      await emitThreadSnapshot(request.threadId, eventChannel);

      return await answer;
    };

    const sessionConfig = buildCopilotSessionConfig({
      cwd,
      modelId: requestedModelId,
      onEvent: (event) => {
        if (control) {
          enqueueCopilotEvent(control, event);
        }
      },
      onPermissionRequest,
      onUserInputRequest,
      reasoningEffort,
    });

    const session = shouldCreateFreshSession
      ? await getCopilotClientManager().createSession(sessionConfig)
      : await getCopilotClientManager().resumeSession(
          existingCopilotState!.sessionId,
          sessionConfig,
        );

    const sessionId = session.sessionId;
    mirror.sessionId = sessionId;

    control = {
      abortController,
      assistantId,
      eventChannel,
      eventQueue: Promise.resolve(),
      finished: false,
      pendingApprovals,
      pendingQuestions,
      runId,
      session,
      sessionId,
      state: mirror,
      threadId: request.threadId,
      userId: request.userId,
      workspaceId: request.workspaceId,
    };
    activeCopilotRunControls.set(runId, control);

    persist.updateCopilotThreadState(
      request.threadId,
      buildCopilotThreadState({
        cwd,
        modelId: requestedModelId,
        reasoningEffort:
          reasoningEffort ?? existingCopilotState?.reasoningEffort,
        sessionId,
      }),
    );
    launchCopilotThreadTitleGeneration({
      eventChannel,
      existingThreadTitle: existingThread?.title ?? null,
      messageCount: allRecords.length,
      request,
    });

    if (!request.message) {
      throw new Error("GitHub Copilot turns require a user message.");
    }

    await emitThreadSnapshot(request.threadId, eventChannel);
    eventChannel.emit({ runId, type: "run.started" });

    await session.send(
      buildCopilotMessagePayload({
        message: request.message,
        promptOverride: bootstrapPrompt,
      }),
    );

    return Response.json(
      {
        activeRunId: runId,
        snapshot: await loadThreadSessionSnapshot(request.threadId),
      },
      { status: 202 },
    );
  } catch (error) {
    await clearThreadRepoCheckpointRun(runId);
    if (control) {
      activeCopilotRunControls.delete(runId);
      await control.session.disconnect().catch(() => {});
    }
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    eventChannel.close();
    throw new Error(normalizeCopilotErrorMessage(error));
  }
}
