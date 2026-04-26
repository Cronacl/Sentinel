import {
  createAgentUIStream,
  createUIMessageStream,
  generateId,
  readUIMessageStream,
  smoothStream,
} from "ai";

import {
  safelyCloseReadableStreamController,
  safelyEnqueueReadableStreamController,
  streamContext,
} from "@/lib/streams";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import {
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  prepareMessagesForModel,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";

import { createAttachmentDownloadHandler } from "./attachments";
import { buildPersistedAssistantMessage } from "./finalize";
import { resolveThreadChatModel } from "../model";
import * as persist from "../persistence";
import { createReasoningMetadataTracker } from "./reasoning";
import { disposeShellSession } from "../tools/shell";
import { getSystemPrompt } from "./system-prompt";
import { createThreadAgent } from "../agent";
import {
  buildThreadPromptContext,
  createMcpPromptNamespace,
} from "../prompt-context";
import type { ThreadPromptIntegration } from "../prompt-context";
import { discoverProjectAwareness } from "./project-discovery";
import { loadMcpTools } from "@/lib/mcp/tools";
import {
  autosaveConversationMemories,
  buildMemoryPromptLines,
  extractLatestUserText,
  retrieveRelevantMemories,
} from "@/lib/memory/service";
import { describeMemoryRuntimeUnavailability } from "@/lib/memory/runtime";
import { normalizeTranscriptDocumentsForModel } from "@/lib/documents/bootstrap";
import {
  getThreadPlanState,
  answerThreadPlanQuestionSet,
} from "@/lib/plan/service";
import { buildPlanPromptLines, normalizeThreadMode } from "@/lib/plan";
import { getSkillSnapshot } from "@/lib/skills";
import { resolveThreadTitleModel } from "../title/model";
import { generateThreadTitle } from "../title/generate";
import { parseRequest } from "./parse-request";
import { runCodexThreadChat, stopCodexThreadRun } from "./codex";
import { runClaudeThreadChat, stopClaudeThreadRun } from "./claude";
import { runCopilotThreadChat, stopCopilotThreadRun } from "./copilot";
import { runCursorThreadChat, stopCursorThreadRun } from "./cursor";
import { runOpenCodeThreadChat, stopOpenCodeThreadRun } from "./opencode";
import {
  buildActiveThreadMessages,
  buildFirstUserMessageTitle,
  buildModelTranscript,
  getFirstUserText,
  getParentMessageId,
  getUserParentMessageId,
  injectComposerContextIntoTranscript,
  truncateTranscriptAtMessage,
} from "./transcript";
import {
  getEnabledIntegrations,
  buildIntegrationContext,
  getIntegrationLabel,
  getIntegrationToolPrefix,
  countIntegrationTools,
} from "@/lib/integrations/runtime";
import {
  getIntegrationRoutingProfile,
  getMcpRoutingProfile,
} from "../tool-targeting";
import { loadIntegrationTools } from "@/lib/integrations/registry";
import {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
  getThreadCheckpointAnchorMessageId,
} from "../repo-checkpoints";
import {
  getMemoryRuntimeState,
  getImageGenerationRuntime,
  getMcpServerRuntime,
  getSearchProviderRuntime,
  getSearchSettings,
  getThreadRuntimeBootstrap,
  getVideoGenerationRuntime,
  getWorkspaceRootPath,
  getToolApprovalPolicies,
} from "./workspace";
import { refreshThreadContextCompactionCheckpoint } from "./context-compaction-refresh";
import type { ThreadChatRequest } from "../types";
import { normalizeThreadChatErrorMessage } from "../errors";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";
import {
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
} from "../session-server";
import type { ThreadStreamEvent } from "../session-types";

function getThreadAgentRole(
  thread: Awaited<ReturnType<typeof persist.loadThread>> | null | undefined,
) {
  return thread?.visibility === "virtual" || thread?.sourceVirtualThreadId
    ? "subagent"
    : "primary";
}

type ResolvedModel = Awaited<ReturnType<typeof resolveThreadChatModel>>;
type ThreadEventChannel = Awaited<ReturnType<typeof createThreadEventChannel>>;

type ActiveRunControl = {
  abortController: AbortController;
  cancelled: boolean;
  eventChannel: ThreadEventChannel;
};

const activeRunControls = new Map<string, ActiveRunControl>();
const log = createLogger("ThreadChat");
const EMPTY_INTEGRATION_CONTEXT = {
  databases: {},
  tokens: {},
} as const;
const OPTIONAL_PREFLIGHT_TIMEOUT_MS =
  process.env.NODE_ENV === "test" ? 25 : 1_200;

function logRuntimeTiming(
  phase:
    | "agent_stream_created"
    | "bootstrap_ready"
    | "compaction_ready"
    | "documents_normalized"
    | "first_message_upsert"
    | "optional_preflight_ready"
    | "optional_preflight_started"
    | "preflight_ready"
    | "prompt_context_ready"
    | "request_received"
    | "run_failed"
    | "run_finished"
    | "stream_execute_started",
  startedAt: number,
  context: {
    runId?: string | null;
    threadId: string;
    trigger?: string;
    userId: string;
    workspaceId?: string | null;
  },
  extra?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  log.debug(`timing:${phase}`, {
    elapsedMs: Date.now() - startedAt,
    phase,
    ...context,
    ...(extra ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Stop-stream handler
// ---------------------------------------------------------------------------

async function handleStopStream(request: ThreadChatRequest): Promise<Response> {
  const thread = await persist.loadThread(request.threadId);
  const activeRunId = thread?.activeStreamId ?? null;
  const activeRunControl = activeRunId
    ? activeRunControls.get(activeRunId)
    : undefined;

  if (request.messageId) {
    await persist.updateMessageMetadata(request.threadId, request.messageId, {
      errorMessage: "Generation stopped.",
      statusLabel: null,
      status: "cancelled",
    });
  }

  if (activeRunControl && !activeRunControl.cancelled) {
    activeRunControl.cancelled = true;
    activeRunControl.abortController.abort(new Error("Generation stopped."));
  }

  await disposeShellSession(request.threadId);
  persist.clearActiveStream(request.threadId);
  persist.setThreadStatus(request.threadId, "idle");

  if (activeRunId && activeRunControl) {
    const snapshot = await loadThreadSessionSnapshot(request.threadId);
    if (snapshot) {
      activeRunControl.eventChannel.emit({
        snapshot,
        type: "thread.snapshot",
      });
    }
    activeRunControl.eventChannel.emit({
      ...(request.messageId ? { messageId: request.messageId } : {}),
      runId: activeRunId,
      threadStatus: "idle",
      type: "run.cancelled",
    });
    activeRunControl.eventChannel.close();
    activeRunControls.delete(activeRunId);
  }

  await drainFollowUpQueue(request);
  return new Response(null, { status: 204 });
}

async function handleFollowUpAction(
  request: ThreadChatRequest,
  existingThread: Awaited<ReturnType<typeof persist.loadThread>>,
  position: "front" | "tail",
): Promise<Response> {
  if (!request.message || !request.modelId) {
    throw new Error("Queued follow-ups require a message payload and model.");
  }

  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const fallbackTitle =
    getFirstUserText([request.message])?.slice(0, 100) ?? "New thread";

  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    existingThread?.chatEngine ?? request.engine ?? "sentinel",
  );

  const payload = {
    id: request.message.id,
    modelId: request.modelId,
    parts: request.message.parts,
    reasoningEffort: request.reasoningEffort ?? null,
    threadId: request.threadId,
    threadMode,
  } as const;

  if (position === "front") {
    persist.enqueueThreadFollowUpAtFront(payload);
  } else {
    persist.enqueueThreadFollowUp(payload);
  }

  const latestThread = await persist.loadThread(request.threadId);
  const shouldInterruptActiveRun =
    latestThread?.activeStreamId != null ||
    latestThread?.status === "streaming" ||
    latestThread?.status === "awaiting_approval";

  if (position === "front" && shouldInterruptActiveRun) {
    const latestAssistantId = await persist.getLatestAssistantMessageId(
      request.threadId,
    );
    const stopRequest = {
      ...request,
      ...(latestAssistantId ? { messageId: latestAssistantId } : {}),
      trigger: "stop-stream",
    } satisfies ThreadChatRequest;
    const engine =
      latestThread?.chatEngine ??
      existingThread?.chatEngine ??
      request.engine ??
      "sentinel";

    if (engine === "codex") {
      return stopCodexThreadRun(stopRequest, latestThread);
    }

    if (engine === "claude") {
      return stopClaudeThreadRun(stopRequest, latestThread);
    }

    if (engine === "copilot") {
      return stopCopilotThreadRun(stopRequest, latestThread);
    }

    if (engine === "cursor") {
      return stopCursorThreadRun(stopRequest, latestThread);
    }

    if (engine === "opencode") {
      return stopOpenCodeThreadRun(stopRequest, latestThread);
    }

    return handleStopStream(stopRequest);
  }

  await drainFollowUpQueue(request);
  return new Response(null, { status: 204 });
}

async function drainFollowUpQueue(
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
    await runParsedThreadChat(
      {
        id: request.threadId,
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
        threadMode: nextFollowUp.threadMode,
        trigger: "submit-user-message",
        workspaceId: request.workspaceId,
      },
      request.userId,
      { detached: true },
    );
    persist.deleteThreadFollowUp(request.threadId, nextFollowUp.id);
  } catch (error) {
    persist.requeueThreadFollowUp(request.threadId, nextFollowUp.id);
    throw error;
  }
}

function describeStartupError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function fallbackProjectAwareness(workspaceRoot: string | null) {
  return {
    preferredProjectRoot: workspaceRoot,
    projectCandidates: [],
    shellStartDirectory: workspaceRoot,
  } satisfies Awaited<ReturnType<typeof discoverProjectAwareness>>;
}

function withOptionalPreflightBudget<T>({
  fallback,
  label,
  promise,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
}) {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return new Promise<T>((resolve) => {
    const finish = (value: T) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      resolve(value);
    };

    timeout = setTimeout(() => {
      log.warn(
        `Skipping ${label} during startup after ${OPTIONAL_PREFLIGHT_TIMEOUT_MS}ms.`,
      );
      finish(fallback);
    }, OPTIONAL_PREFLIGHT_TIMEOUT_MS);

    promise.then(finish).catch((error) => {
      log.warn(
        `Skipping ${label} during startup: ${describeStartupError(error)}`,
      );
      finish(fallback);
    });
  });
}

async function streamStillOwnsThread(
  threadId: string,
  streamId: string | null,
) {
  if (!streamId) {
    return true;
  }

  const currentThread = await persist.loadThread(threadId);
  if (!currentThread) {
    return true;
  }

  return currentThread?.activeStreamId === streamId;
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

// ---------------------------------------------------------------------------
// Placeholder message construction
// ---------------------------------------------------------------------------

function buildPlaceholderMessage(
  request: ThreadChatRequest,
  parentId: string | null,
  assistantId: string,
  continuationAssistant: ThreadUIMessage | undefined,
): ThreadUIMessage {
  if (continuationAssistant) {
    return {
      ...continuationAssistant,
      metadata: mergeThreadMessageMetadata(continuationAssistant.metadata, {
        isActive: true,
        parentMessageId:
          continuationAssistant.metadata?.parentMessageId ?? parentId,
        status: "pending",
      }),
    };
  }

  const branchId =
    request.trigger === "edit-user-message"
      ? request.message?.id
      : (parentId ?? assistantId);

  return {
    id: assistantId,
    role: "assistant",
    parts: [{ text: " ", type: "text" }],
    metadata: {
      branchId,
      isActive: true,
      parentMessageId: parentId,
      status: "pending",
    },
  };
}

// ---------------------------------------------------------------------------
// Integration prompt summary
// ---------------------------------------------------------------------------

function buildIntegrationPromptSummary(
  enabledIntegrations: { provider: string }[],
  integrationToolNames: string[],
): ThreadPromptIntegration[] {
  return enabledIntegrations.map((integration) => {
    const provider = integration.provider as Parameters<
      typeof getIntegrationLabel
    >[0];
    const label = getIntegrationLabel(provider);
    const profile = getIntegrationRoutingProfile({
      label,
      provider,
    });

    return {
      capabilitySummary: profile.capabilitySummary,
      label,
      provider,
      toolCount: countIntegrationTools(provider, integrationToolNames),
      toolPrefix: getIntegrationToolPrefix(provider),
    };
  });
}

function launchBackgroundContextCompactionWarmup(input: {
  contextCompactionSettings: {
    enabled: boolean;
    fixedWindowSize?: number | null;
    useFixedWindow?: boolean;
    windowPercent: number;
  };
  model: Pick<
    ResolvedModel,
    "contextWindow" | "languageModel" | "providerOptions"
  >;
  threadId: string;
  transcript: ThreadUIMessage[];
}) {
  if (!input.contextCompactionSettings.enabled) {
    return;
  }

  void (async () => {
    try {
      await refreshThreadContextCompactionCheckpoint({
        contextWindow: input.model.contextWindow,
        enabled: input.contextCompactionSettings.enabled,
        fixedWindowSize: input.contextCompactionSettings.fixedWindowSize,
        languageModel: input.model.languageModel,
        ...(input.model.providerOptions
          ? { providerOptions: input.model.providerOptions }
          : {}),
        staleWriteProtection: true,
        threadId: input.threadId,
        transcript: input.transcript,
        useFixedWindow: input.contextCompactionSettings.useFixedWindow,
        windowPercent: input.contextCompactionSettings.windowPercent,
      });
    } catch (error) {
      log.warn(
        `Skipping background context compaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  })();
}

// ---------------------------------------------------------------------------
// Title generation (fire-and-forget for new threads)
// ---------------------------------------------------------------------------

function createTitleTask(
  shouldGenerateTitle: boolean,
  request: ThreadChatRequest,
  baseMessages: ThreadUIMessage[],
  resolvedModel: ResolvedModel,
): Promise<string | null> | null {
  if (!shouldGenerateTitle || request.trigger !== "submit-user-message") {
    return null;
  }

  const text = getFirstUserText(baseMessages);
  if (!text?.trim()) return null;

  return (async () => {
    const titleModel = await resolveThreadTitleModel({
      providerId: resolvedModel.providerId,
      userId: request.userId,
    });
    return generateThreadTitle({ firstUserText: text, model: titleModel });
  })();
}

// ---------------------------------------------------------------------------
// User message persistence (submit / edit)
// ---------------------------------------------------------------------------

function persistUserMessage(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
  runId?: string,
): string | null {
  if (
    !request.message ||
    (request.trigger !== "submit-user-message" &&
      request.trigger !== "edit-user-message")
  ) {
    return null;
  }

  const parentMessageId = resolveUserParentId(request, transcript, allRecords);

  const userMsg: ThreadUIMessage = {
    ...request.message,
    metadata: mergeThreadMessageMetadata(request.message.metadata, {
      branchId: request.message.id,
      isActive: true,
      parentMessageId,
      ...(runId ? { runId } : {}),
      status: "completed",
      ...(request.trigger === "edit-user-message" && request.messageId
        ? { editedFromMessageId: request.messageId }
        : {}),
    }),
  };

  persist.upsertMessage(request.threadId, userMsg);
  return userMsg.id;
}

function persistAssistantSnapshot(
  threadId: string,
  runId: string,
  message: ThreadUIMessage,
) {
  return persist.upsertMessage(threadId, {
    ...message,
    metadata: mergeThreadMessageMetadata(message.metadata, {
      runId,
      statusLabel: null,
      status: "streaming",
    }),
  });
}

function updatePendingAssistantStatusLabel(
  threadId: string,
  message: ThreadUIMessage,
  statusLabel: string | null,
) {
  return persist.upsertMessage(threadId, {
    ...message,
    metadata: mergeThreadMessageMetadata(message.metadata, {
      statusLabel,
    }),
  });
}

function emitPendingAssistantStatusLabel(
  run: Pick<
    BootstrappedThreadRun,
    "eventChannel" | "placeholderMessage" | "request" | "runId"
  >,
  statusLabel: string | null,
) {
  if (run.placeholderMessage.metadata?.statusLabel === statusLabel) {
    return;
  }

  const nextMessage = updatePendingAssistantStatusLabel(
    run.request.threadId,
    run.placeholderMessage,
    statusLabel,
  );
  run.placeholderMessage = nextMessage;
  run.eventChannel.emit({
    message: nextMessage,
    runId: run.runId,
    type: "message.upsert",
  });
}

function getInitialPendingStatusLabel(trigger: ThreadChatRequest["trigger"]) {
  switch (trigger) {
    case "retry-assistant-message":
      return "Retrying response...";
    case "regenerate-assistant-message":
      return "Regenerating response...";
    case "edit-user-message":
      return "Updating response...";
    case "submit-tool-approval":
      return "Resuming after approval...";
    case "submit-plan-answer":
      return "Continuing with plan answers...";
    case "submit-user-message":
    default:
      return "Preparing workspace...";
  }
}

function resolveUserParentId(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
): string | null {
  return getUserParentMessageId(request, transcript, allRecords);
}

// ---------------------------------------------------------------------------
// Continuation assistant resolution
// ---------------------------------------------------------------------------

function findContinuationAssistant(
  request: ThreadChatRequest,
  modelTranscript: ThreadUIMessage[],
): ThreadUIMessage | undefined {
  const isContinuation =
    request.trigger === "submit-tool-approval" ||
    request.trigger === "submit-plan-answer";

  if (!isContinuation) return undefined;

  return [...modelTranscript]
    .reverse()
    .find((message) => message.role === "assistant");
}

// ---------------------------------------------------------------------------
// MCP empty fallback
// ---------------------------------------------------------------------------

const EMPTY_MCP_RUNTIME = {
  closeAll: async () => {},
  tools: {} as Record<string, never>,
} as const;

type BootstrappedThreadRun = {
  abortController: AbortController;
  assistantId: string;
  baseMessages: ThreadUIMessage[];
  eventChannel: ThreadEventChannel;
  modelTranscript: ThreadUIMessage[];
  parentId: string | null;
  placeholderMessage: ThreadUIMessage;
  request: ThreadChatRequest;
  runId: string;
  shouldGenerateTitle: boolean;
  targetMessage: PersistedThreadMessageRecord | undefined;
  timingStartedAt: number;
  threadAgentRole: ReturnType<typeof getThreadAgentRole>;
  threadMode: ReturnType<typeof normalizeThreadMode>;
};

async function emitLatestThreadSnapshot(
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

async function failThreadRun(
  run: Pick<
    BootstrappedThreadRun,
    "assistantId" | "eventChannel" | "request" | "runId" | "timingStartedAt"
  >,
  error: unknown,
) {
  const message = normalizeThreadChatErrorMessage(
    error,
    "Sentinel run failed.",
  );

  await clearThreadRepoCheckpointRun(run.runId);
  persist.clearActiveStream(run.request.threadId);
  persist.setThreadStatus(run.request.threadId, "idle");
  await persist.updateMessageMetadata(run.request.threadId, run.assistantId, {
    errorMessage: message,
    runId: run.runId,
    statusLabel: null,
    status: "error",
  });
  await emitLatestThreadSnapshot(run.request.threadId, run.eventChannel);
  run.eventChannel.emit({
    error: message,
    runId: run.runId,
    threadStatus: "idle",
    type: "run.failed",
  });
  log.error("run_failed", {
    engine: run.request.engine ?? "sentinel",
    error: message,
    runId: run.runId,
    threadId: run.request.threadId,
    trigger: run.request.trigger,
    userId: run.request.userId,
    workspaceId: run.request.workspaceId,
  });
  logRuntimeTiming(
    "run_failed",
    run.timingStartedAt,
    {
      runId: run.runId,
      threadId: run.request.threadId,
      trigger: run.request.trigger,
      userId: run.request.userId,
      workspaceId: run.request.workspaceId,
    },
    { error: message },
  );
  run.eventChannel.close();
  activeRunControls.delete(run.runId);
}

function launchTitleGeneration(
  run: Pick<
    BootstrappedThreadRun,
    | "baseMessages"
    | "eventChannel"
    | "request"
    | "runId"
    | "shouldGenerateTitle"
  >,
  resolvedModel: ResolvedModel,
): Promise<void> | null {
  const titleTask = createTitleTask(
    run.shouldGenerateTitle,
    run.request,
    run.baseMessages,
    resolvedModel,
  );

  if (!titleTask) {
    return null;
  }

  return (async () => {
    const title = await titleTask.catch(() => null);
    if (!title) {
      return;
    }

    persist.updateThreadTitle(run.request.threadId, title);

    if (!activeRunControls.has(run.runId)) {
      return;
    }

    await emitLatestThreadSnapshot(run.request.threadId, run.eventChannel);
  })();
}

async function executeBootstrappedThreadRun(run: BootstrappedThreadRun) {
  const { abortController, assistantId, eventChannel, parentId } = run;
  let firstMessageUpsertLogged = false;
  let latestInputTokens: number | undefined;

  try {
    emitPendingAssistantStatusLabel(run, "Loading workspace context...");
    const resolvedModelPromise = resolveThreadChatModel(
      run.request,
      run.targetMessage,
    );
    const runtimeBootstrapPromise = getThreadRuntimeBootstrap(
      run.request.userId,
      run.request.workspaceId,
      run.request.threadId,
    );

    const [
      resolvedModel,
      runtimeBootstrap,
      memoryRuntime,
      imageGenerationRuntime,
      videoGenerationRuntime,
      mcpServers,
      searchSettings,
      searchProviders,
      toolApprovalPolicies,
      planState,
      enabledIntegrations,
    ] = await Promise.all([
      resolvedModelPromise,
      runtimeBootstrapPromise,
      getMemoryRuntimeState(run.request.userId),
      getImageGenerationRuntime(run.request.userId),
      getVideoGenerationRuntime(run.request.userId),
      getMcpServerRuntime(run.request.userId),
      getSearchSettings(run.request.userId),
      getSearchProviderRuntime(run.request.userId),
      getToolApprovalPolicies(run.request.userId),
      getThreadPlanState({ threadId: run.request.threadId }).catch(() => ({
        pendingQuestionSet: null,
        plan: null,
      })),
      getEnabledIntegrations(run.request.userId).catch(() => []),
    ]);
    const {
      contextCompactionSettings,
      permissionMode,
      personalizationPrompt,
      skillsBasePath,
      webFetchSettings,
      workspaceRoot,
    } = runtimeBootstrap;

    const titleUpdatePromise = launchTitleGeneration(run, resolvedModel);
    const normalizedModelTranscriptPromise =
      normalizeTranscriptDocumentsForModel({
        messages: injectComposerContextIntoTranscript(run.modelTranscript),
        providerId: resolvedModel.providerId,
        responseModelId: resolvedModel.responseModelId,
      }).then((normalizedModelTranscript) => {
        logRuntimeTiming("documents_normalized", run.timingStartedAt, {
          runId: run.runId,
          threadId: run.request.threadId,
          trigger: run.request.trigger,
          userId: run.request.userId,
          workspaceId: run.request.workspaceId,
        });
        return normalizedModelTranscript;
      });

    const latestUserText = extractLatestUserText(run.baseMessages);
    const toolsEnabled = run.request.toolsEnabled ?? Boolean(workspaceRoot);
    const hasIntegrations =
      run.threadMode === "chat" && enabledIntegrations.length > 0;
    const integrationApprovalFn = (toolName: string) =>
      (toolApprovalPolicies as Record<string, boolean>)[toolName] ?? true;
    logRuntimeTiming("optional_preflight_started", run.timingStartedAt, {
      runId: run.runId,
      threadId: run.request.threadId,
      trigger: run.request.trigger,
      userId: run.request.userId,
      workspaceId: run.request.workspaceId,
    });
    const projectAwarenessPromise = withOptionalPreflightBudget({
      fallback: fallbackProjectAwareness(workspaceRoot),
      label: "project discovery",
      promise: discoverProjectAwareness(workspaceRoot),
    });
    const skillSnapshotPromise = withOptionalPreflightBudget({
      fallback: {
        revision: 0,
        skillRoots: [],
        skills: [],
        updatedAt: Date.now(),
      },
      label: "skills snapshot",
      promise: getSkillSnapshot({
        workspaceRoot,
        globalBase: skillsBasePath,
      }),
    });
    const mcpRuntimePromise =
      run.threadMode === "chat"
        ? withOptionalPreflightBudget({
            fallback: EMPTY_MCP_RUNTIME,
            label: "MCP tools",
            promise: loadMcpTools({
              entries: mcpServers,
              userId: run.request.userId,
              workspaceRoot,
            }),
          })
        : Promise.resolve(EMPTY_MCP_RUNTIME);
    if (!memoryRuntime.available && memoryRuntime.reason !== "disabled") {
      log.warn(
        `Skipping memory retrieval during startup: ${describeMemoryRuntimeUnavailability(memoryRuntime)}`,
      );
    }
    const retrievedMemoriesPromise = memoryRuntime.available
      ? withOptionalPreflightBudget({
          fallback: [],
          label: "memory retrieval",
          promise: retrieveRelevantMemories({
            memoryRuntime,
            query: latestUserText,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          }),
        })
      : Promise.resolve([]);
    const integrationContextPromise = hasIntegrations
      ? withOptionalPreflightBudget({
          fallback: EMPTY_INTEGRATION_CONTEXT,
          label: "integration context",
          promise: buildIntegrationContext(enabledIntegrations),
        })
      : Promise.resolve(EMPTY_INTEGRATION_CONTEXT);
    const integrationToolsPromise = hasIntegrations
      ? withOptionalPreflightBudget({
          fallback: {},
          label: "integration tools",
          promise: integrationContextPromise.then((integrationContext) =>
            loadIntegrationTools(
              enabledIntegrations.map((integration) => integration.provider),
              integrationContext,
              integrationApprovalFn,
            ),
          ),
        })
      : Promise.resolve({});
    const compactionResultPromise = normalizedModelTranscriptPromise
      .then((normalizedModelTranscript) =>
        refreshThreadContextCompactionCheckpoint({
          contextWindow: resolvedModel.contextWindow,
          enabled: contextCompactionSettings.enabled,
          fixedWindowSize: contextCompactionSettings.fixedWindowSize,
          languageModel: resolvedModel.languageModel,
          onCompactionStart: async () => {
            emitPendingAssistantStatusLabel(run, "Compacting context...");
          },
          ...(resolvedModel.providerOptions
            ? { providerOptions: resolvedModel.providerOptions }
            : {}),
          threadId: run.request.threadId,
          transcript: normalizedModelTranscript,
          useFixedWindow: contextCompactionSettings.useFixedWindow,
          windowPercent: contextCompactionSettings.windowPercent,
        }),
      )
      .then((compactionResult) => {
        logRuntimeTiming("compaction_ready", run.timingStartedAt, {
          runId: run.runId,
          threadId: run.request.threadId,
          trigger: run.request.trigger,
          userId: run.request.userId,
          workspaceId: run.request.workspaceId,
        });
        return compactionResult;
      })
      .catch((error) => {
        log.warn(
          `Skipping context compaction: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return normalizedModelTranscriptPromise.then(
          (normalizedModelTranscript) => ({
            checkpointWasInvalid: false,
            didCompact: false,
            inputTokens: null,
            thresholdTokens: 0,
            transcript: prepareMessagesForModel(normalizedModelTranscript),
            updatedCheckpoint: null,
          }),
        );
      });

    const agent = createThreadAgent({
      attachmentDownload: createAttachmentDownloadHandler(),
      languageModel: resolvedModel.languageModel,
      providerOptions: resolvedModel.providerOptions,
    });

    const tracker = createReasoningMetadataTracker({
      clock: { now: () => Date.now() },
      providerId: resolvedModel.providerId,
      requestedModelId: resolvedModel.requestedModelId,
    });
    let streamErrorMessage: string | undefined;
    let closeMcpTools = async () => {};
    const normalizedModelTranscript = await normalizedModelTranscriptPromise;

    const stream = createUIMessageStream({
      originalMessages: normalizedModelTranscript,
      execute: async ({ writer }) => {
        try {
          logRuntimeTiming("stream_execute_started", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          const [
            projectAwareness,
            skillSnapshot,
            retrievedMemories,
            mcpRuntime,
            integrationTools,
          ] = await Promise.all([
            projectAwarenessPromise,
            skillSnapshotPromise,
            retrievedMemoriesPromise,
            mcpRuntimePromise,
            integrationToolsPromise,
          ]);
          closeMcpTools = mcpRuntime.closeAll;
          const mcpToolNames = Object.keys(mcpRuntime.tools);
          const integrationToolNames = Object.keys(integrationTools);
          logRuntimeTiming("optional_preflight_ready", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          logRuntimeTiming("preflight_ready", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          emitPendingAssistantStatusLabel(run, "Building prompt...");

          const promptContext = buildThreadPromptContext({
            agentRole: run.threadAgentRole,
            allowedInspectionRoots: [
              ...(workspaceRoot ? [workspaceRoot] : []),
              ...skillSnapshot.skillRoots,
            ],
            allowedMutationRoot: workspaceRoot,
            availableSkills: skillSnapshot.skills,
            enabledIntegrations: buildIntegrationPromptSummary(
              enabledIntegrations,
              integrationToolNames,
            ),
            imageGeneration: {
              available:
                Object.keys(imageGenerationRuntime.providers).length > 0,
              defaultProvider: imageGenerationRuntime.defaultProvider,
              enabledProviders: Object.values(
                imageGenerationRuntime.providers,
              ).map((entry) => ({
                modelId: entry.modelId,
                provider: entry.provider,
              })),
            },
            videoGeneration: {
              available:
                Object.keys(videoGenerationRuntime.providers).length > 0,
              defaultProvider: videoGenerationRuntime.defaultProvider,
              enabledProviders: Object.values(
                videoGenerationRuntime.providers,
              ).map((entry) => ({
                modelId: entry.modelId,
                provider: entry.provider,
              })),
            },
            enabledMcpServers: mcpServers
              .filter((entry) => entry.isEnabled)
              .map((entry) => {
                const namespace = createMcpPromptNamespace(
                  entry.catalogId ?? entry.name,
                );
                const profile = getMcpRoutingProfile({
                  ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
                  name: entry.name,
                  namespace,
                });
                return {
                  ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
                  capabilitySummary: profile.capabilitySummary,
                  id: entry.id,
                  name: entry.name,
                  namespace,
                  toolCount: mcpToolNames.filter((toolName) =>
                    toolName.startsWith(`mcp_${namespace}__`),
                  ).length,
                  transport: entry.transport,
                };
              }),
            latestUserText,
            latentToolSummary: {
              categories: [],
              integrationNamespaces: enabledIntegrations.map(
                (integration) => integration.provider,
              ),
              mcpNamespaces: mcpServers
                .filter((entry) => entry.isEnabled)
                .map((entry) =>
                  createMcpPromptNamespace(entry.catalogId ?? entry.name),
                ),
            },
            mcpToolNames,
            memoryPromptLines: buildMemoryPromptLines(retrievedMemories),
            memoryRuntime,
            permissionMode,
            planSummary: planState.plan
              ? {
                  audience: planState.plan.audience,
                  goal: planState.plan.goal,
                  hasPendingQuestions: Boolean(planState.pendingQuestionSet),
                  summary: planState.plan.summary,
                  taskCount: planState.plan.tasks.length,
                  title: planState.plan.title,
                }
              : null,
            preferredProjectRoot: projectAwareness.preferredProjectRoot,
            projectCandidates: projectAwareness.projectCandidates,
            searchProviders,
            searchSettings,
            shellStartDirectory: projectAwareness.shellStartDirectory,
            skillRoots: skillSnapshot.skillRoots,
            sourceMessageId: parentId,
            threadMode: run.threadMode,
            toolApprovalPolicies,
            webFetchSettings,
            workspaceRoot,
          });
          logRuntimeTiming("prompt_context_ready", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });

          const planPromptLines = buildPlanPromptLines(planState.plan);
          const baseSystemPromptPromise = Promise.resolve(
            getSystemPrompt({
              personalization: personalizationPrompt,
              promptContext,
            }),
          );
          const [baseSystemPrompt, compactionResult] = await Promise.all([
            baseSystemPromptPromise,
            compactionResultPromise,
          ]);
          emitPendingAssistantStatusLabel(run, "Starting generation...");
          const systemPrompt =
            planPromptLines.length > 0
              ? [baseSystemPrompt, ...planPromptLines]
                  .filter(Boolean)
                  .join("\n\n")
              : baseSystemPrompt;
          const agentMessages = compactionResult.transcript;

          const result = await createAgentUIStream({
            agent,
            abortSignal: abortController.signal,
            experimental_transform: smoothStream(),
            generateMessageId: () => assistantId,
            onStepFinish: async ({ usage }) => {
              latestInputTokens = usage.inputTokens;
            },
            messageMetadata: ({ part }) => tracker.getMessageMetadata(part),
            onError: (error) => {
              streamErrorMessage = getErrorMessage(error, "Unknown error");
              return streamErrorMessage;
            },
            options: {
              agentRole: run.threadAgentRole,
              availableSkills: skillSnapshot.skills,
              ...(workspaceRoot ? { defaultDirectory: workspaceRoot } : {}),
              globalSkillsBasePath: skillsBasePath,
              imageGenerationRuntime,
              integrationTools,
              mcpTools: mcpRuntime.tools,
              memoryRuntime,
              permissionMode,
              promptContext,
              preferredProjectRoot: projectAwareness.preferredProjectRoot,
              resolvedModelId: resolvedModel.responseModelId,
              resolvedProviderId: resolvedModel.providerId,
              searchProviders,
              searchSettings,
              shellStartDirectory: projectAwareness.shellStartDirectory,
              skillRoots: skillSnapshot.skillRoots,
              sourceMessageId: parentId,
              systemPrompt,
              threadId: run.request.threadId,
              threadMode: run.threadMode,
              toolApprovalPolicies,
              toolsEnabled,
              userId: run.request.userId,
              videoGenerationRuntime,
              webFetchSettings,
              workspaceId: run.request.workspaceId,
            },
            originalMessages: agentMessages as never,
            sendReasoning: true,
            sendSources: true,
            uiMessages: agentMessages as never,
          });
          logRuntimeTiming("agent_stream_created", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          writer.merge(result as ReadableStream<any>);
        } catch (error) {
          await closeMcpTools();
          throw error;
        }
      },
      onFinish: async ({ responseMessage }) => {
        await closeMcpTools();
        if (!(await streamStillOwnsThread(run.request.threadId, run.runId))) {
          await clearThreadRepoCheckpointRun(run.runId);
          eventChannel.close();
          activeRunControls.delete(run.runId);
          return;
        }
        const finalized = tracker.finalize(
          [...normalizedModelTranscript, responseMessage as ThreadUIMessage],
          responseMessage as ThreadUIMessage,
        );
        const normalizedFinalized = normalizeThreadUIMessages(finalized);
        const [finalAssistantBase] = normalizedFinalized.slice(-1);
        const finalAssistant =
          finalAssistantBase && latestInputTokens !== undefined
            ? {
                ...finalAssistantBase,
                metadata: mergeThreadMessageMetadata(
                  finalAssistantBase.metadata,
                  {
                    usage: {
                      inputTokens: latestInputTokens,
                    },
                  },
                ),
              }
            : finalAssistantBase;
        const finalizedTranscript =
          finalAssistantBase && finalAssistant
            ? [...normalizedFinalized.slice(0, -1), finalAssistant]
            : normalizedFinalized;
        const hasApprovalPending = (
          responseMessage as ThreadUIMessage
        ).parts.some(
          (part) => "state" in part && part.state === "approval-requested",
        );
        const repoCheckpointId =
          !streamErrorMessage && !hasApprovalPending
            ? await finalizeThreadRepoCheckpointRun({
                assistantMessageId: assistantId,
                runId: run.runId,
                threadId: run.request.threadId,
              })
            : (await clearThreadRepoCheckpointRun(run.runId), null);
        const persistedAssistant = persist.upsertMessage(
          run.request.threadId,
          buildPersistedAssistantMessage({
            assistantId,
            ...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {}),
            finalAssistant,
            placeholder: run.placeholderMessage,
            repoCheckpointId,
          }),
        );
        eventChannel.emit({
          message: persistedAssistant,
          runId: run.runId,
          type: "message.upsert",
        });
        eventChannel.emit({
          messageId: persistedAssistant.id,
          runId: run.runId,
          status: persistedAssistant.metadata?.status,
          type: "message.status",
        });

        if (!streamErrorMessage && memoryRuntime.available) {
          void autosaveConversationMemories({
            messages: finalizedTranscript,
            model: resolvedModel.languageModel,
            providerOptions: resolvedModel.providerOptions,
            memoryRuntime,
            sourceMessageId: assistantId,
            threadId: run.request.threadId,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
        }

        persist.clearActiveStream(run.request.threadId);
        persist.setThreadStatus(
          run.request.threadId,
          hasApprovalPending ? "awaiting_approval" : "idle",
        );
        const settledThread = await persist.loadThread(run.request.threadId);
        if (
          !streamErrorMessage &&
          !hasApprovalPending &&
          settledThread?.sourceVirtualThreadId
        ) {
          await persist.syncThreadFromThread({
            sourceThreadId: run.request.threadId,
            targetThreadId: settledThread.sourceVirtualThreadId,
          });
        }
        if (!streamErrorMessage && !hasApprovalPending) {
          launchBackgroundContextCompactionWarmup({
            contextCompactionSettings,
            model: resolvedModel,
            threadId: run.request.threadId,
            transcript: finalizedTranscript,
          });
        }
        await emitLatestThreadSnapshot(
          run.request.threadId,
          eventChannel,
          run.runId,
        );
        eventChannel.emit({
          runId: run.runId,
          threadStatus: hasApprovalPending ? "awaiting_approval" : "idle",
          type: "run.finished",
        });
        logRuntimeTiming("run_finished", run.timingStartedAt, {
          runId: run.runId,
          threadId: run.request.threadId,
          trigger: run.request.trigger,
          userId: run.request.userId,
          workspaceId: run.request.workspaceId,
        });
        if (titleUpdatePromise) {
          await titleUpdatePromise;
        }
        eventChannel.close();
        activeRunControls.delete(run.runId);

        if (!hasApprovalPending) {
          await drainFollowUpQueue(run.request);
        }
      },
    });

    void (async () => {
      try {
        for await (const assistantMessage of readUIMessageStream<ThreadUIMessage>(
          {
            message: run.placeholderMessage,
            stream,
          },
        )) {
          if (!(await streamStillOwnsThread(run.request.threadId, run.runId))) {
            await clearThreadRepoCheckpointRun(run.runId);
            eventChannel.close();
            return;
          }

          const persistedAssistant = persistAssistantSnapshot(
            run.request.threadId,
            run.runId,
            assistantMessage,
          );
          eventChannel.emit({
            message: persistedAssistant,
            runId: run.runId,
            type: "message.upsert",
          });
          if (!firstMessageUpsertLogged) {
            firstMessageUpsertLogged = true;
            logRuntimeTiming("first_message_upsert", run.timingStartedAt, {
              runId: run.runId,
              threadId: run.request.threadId,
              trigger: run.request.trigger,
              userId: run.request.userId,
              workspaceId: run.request.workspaceId,
            });
          }
        }
      } catch (error) {
        await closeMcpTools();
        if (await streamStillOwnsThread(run.request.threadId, run.runId)) {
          await failThreadRun(run, error);
          return;
        }
        eventChannel.close();
        activeRunControls.delete(run.runId);
      }
    })();
  } catch (error) {
    await failThreadRun(run, error);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function runParsedThreadChat(
  rawInput: unknown,
  userId: string,
  _options?: { detached?: boolean },
) {
  const timingStartedAt = Date.now();
  const request = await parseRequest(rawInput, userId);
  logRuntimeTiming("request_received", timingStartedAt, {
    threadId: request.threadId,
    trigger: request.trigger,
    userId: request.userId,
    workspaceId: request.workspaceId,
  });
  const existingThread = await persist.loadThread(request.threadId);
  const engine = existingThread?.chatEngine ?? request.engine ?? "sentinel";

  if (request.trigger === "stop-stream") {
    if (engine === "codex") {
      return stopCodexThreadRun(request, existingThread);
    }

    if (engine === "claude") {
      return stopClaudeThreadRun(request, existingThread);
    }

    if (engine === "copilot") {
      return stopCopilotThreadRun(request, existingThread);
    }

    if (engine === "cursor") {
      return stopCursorThreadRun(request, existingThread);
    }

    if (engine === "opencode") {
      return stopOpenCodeThreadRun(request, existingThread);
    }

    return handleStopStream(request);
  }

  if (request.trigger === "queue-follow-up") {
    return handleFollowUpAction(request, existingThread, "tail");
  }

  if (request.trigger === "steer-follow-up") {
    return handleFollowUpAction(request, existingThread, "front");
  }

  if (engine === "codex") {
    return runCodexThreadChat(request, existingThread);
  }

  if (engine === "claude") {
    return runClaudeThreadChat(request, existingThread);
  }

  if (engine === "copilot") {
    return runCopilotThreadChat(request, existingThread);
  }

  if (engine === "cursor") {
    return runCursorThreadChat(request, existingThread);
  }

  if (engine === "opencode") {
    return runOpenCodeThreadChat(request, existingThread);
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const checkpointAnchorMessageId =
    request.trigger === "submit-user-message" ||
    request.trigger === "edit-user-message"
      ? getThreadCheckpointAnchorMessageId(existingThread)
      : null;
  const transcript = truncateTranscriptAtMessage(
    buildActiveThreadMessages(allRecords),
    checkpointAnchorMessageId,
  );
  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const targetMessage = request.messageId
    ? allRecords.find((m) => m.messageId === request.messageId)
    : undefined;
  const modelTranscript = buildModelTranscript(request, transcript, allRecords);

  const baseMessages =
    modelTranscript.length > 0
      ? modelTranscript
      : request.message
        ? [request.message]
        : [];

  const fallbackTitle = buildFirstUserMessageTitle(
    getFirstUserText(baseMessages),
  );
  const shouldGenerateTitle =
    request.trigger === "submit-user-message" &&
    allRecords.length === 0 &&
    (!existingThread ||
      !existingThread.title ||
      existingThread.title === "New thread");
  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
    engine,
    request.draftRepoState ? { repo: request.draftRepoState } : null,
  );
  if (
    shouldGenerateTitle &&
    existingThread?.title === "New thread" &&
    fallbackTitle !== "New thread"
  ) {
    persist.updateThreadTitle(request.threadId, fallbackTitle);
  }
  let activeRunId: string | null = null;
  let assistantId: string | null = null;
  let parentId: string | null = null;
  let persistedUserId: string | null = null;
  let placeholderDraft: ThreadUIMessage | null = null;
  let placeholderMessage: ThreadUIMessage | null = null;

  try {
    if (request.trigger === "submit-plan-answer" && request.planQuestionSetId) {
      await answerThreadPlanQuestionSet({
        answers: request.planAnswers ?? [],
        questionSetId: request.planQuestionSetId,
        threadId: request.threadId,
      });
    }

    await persist.updateThreadChatSettings(request.threadId, {
      engine,
      ...(request.modelId ? { modelId: request.modelId } : {}),
      ...(request.reasoningEffort !== undefined
        ? { reasoningEffort: request.reasoningEffort ?? null }
        : {}),
      mode: threadMode,
    });

    const runId = generateId();
    activeRunId = runId;
    const continuationAssistant = findContinuationAssistant(
      request,
      modelTranscript,
    );
    assistantId = continuationAssistant?.id ?? crypto.randomUUID();
    parentId = getParentMessageId(request, allRecords);
    const placeholder = buildPlaceholderMessage(
      request,
      parentId,
      assistantId,
      continuationAssistant,
    );
    placeholderDraft = placeholder;
    persistedUserId = persistUserMessage(
      request,
      transcript,
      allRecords,
      runId,
    );
    if (persistedUserId) {
      await persist.setActiveMessage(request.threadId, persistedUserId);
      if (checkpointAnchorMessageId) {
        persist.updateThreadRepoState(request.threadId, {
          checkpointAnchorMessageId: null,
        });
      }
    }
    placeholderMessage = persist.upsertMessage(request.threadId, {
      ...placeholder,
      metadata: mergeThreadMessageMetadata(placeholder.metadata, {
        runId,
      }),
    });
    placeholderMessage = updatePendingAssistantStatusLabel(
      request.threadId,
      placeholderMessage,
      getInitialPendingStatusLabel(request.trigger),
    );
    await persist.setActiveMessage(request.threadId, assistantId);
    const abortController = new AbortController();
    const eventChannel = await createThreadEventChannel(runId);
    activeRunControls.set(runId, {
      abortController,
      cancelled: false,
      eventChannel,
    });
    persist.setActiveStream(request.threadId, runId);
    persist.setThreadStatus(request.threadId, "streaming");
    const repoCheckpointProjectPath = await getWorkspaceRootPath(
      request.workspaceId,
      request.userId,
      request.threadId,
    );
    await beginThreadRepoCheckpointRun({
      projectPath: repoCheckpointProjectPath,
      runId,
      thread: existingThread,
    });
    const initialSnapshot = await loadThreadSessionSnapshot(request.threadId);
    if (initialSnapshot) {
      eventChannel.emit({
        snapshot: initialSnapshot,
        type: "thread.snapshot",
      });
    }
    eventChannel.emit({ runId, type: "run.started" });
    if (!initialSnapshot) {
      throw new Error("Unable to bootstrap the chat session.");
    }
    logRuntimeTiming("bootstrap_ready", timingStartedAt, {
      runId,
      threadId: request.threadId,
      trigger: request.trigger,
      userId: request.userId,
      workspaceId: request.workspaceId,
    });

    void executeBootstrappedThreadRun({
      abortController,
      assistantId,
      baseMessages,
      eventChannel,
      modelTranscript,
      parentId,
      placeholderMessage,
      request,
      runId,
      shouldGenerateTitle,
      targetMessage,
      timingStartedAt,
      threadAgentRole: getThreadAgentRole(existingThread),
      threadMode,
    });

    return Response.json(
      {
        activeRunId: runId,
        snapshot: initialSnapshot,
      },
      { status: 202 },
    );
  } catch (error) {
    const errorMessage = normalizeThreadChatErrorMessage(
      error,
      "Unable to start Sentinel run.",
    );

    if (
      persistedUserId &&
      assistantId &&
      (placeholderMessage || placeholderDraft)
    ) {
      const persistedAssistant = persist.upsertMessage(
        request.threadId,
        buildPersistedAssistantMessage({
          assistantId,
          errorMessage,
          placeholder: placeholderMessage ?? placeholderDraft!,
        }),
      );
      await persist.setActiveMessage(request.threadId, persistedAssistant.id);
    }

    if (activeRunId) {
      await clearThreadRepoCheckpointRun(activeRunId);
    }
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    if (activeRunId && activeRunControls.has(activeRunId)) {
      activeRunControls.get(activeRunId)?.eventChannel.close();
      activeRunControls.delete(activeRunId);
    }
    log.error("run_bootstrap_failed", {
      engine,
      error: errorMessage,
      runId: activeRunId,
      threadId: request.threadId,
      trigger: request.trigger,
      userId: request.userId,
      workspaceId: request.workspaceId,
    });
    throw error;
  }
}

export async function runThreadChat(rawInput: unknown, userId: string) {
  return runParsedThreadChat(rawInput, userId);
}
