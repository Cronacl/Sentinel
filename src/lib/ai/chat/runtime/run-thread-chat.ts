import {
  createAgentUIStream,
  createUIMessageStream,
  generateId,
  readUIMessageStream,
  smoothStream,
} from "ai";

import { streamContext } from "@/lib/streams";
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
import {
  getThreadPlanState,
  answerThreadPlanQuestionSet,
} from "@/lib/plan/service";
import { buildPlanPromptLines, normalizeThreadMode } from "@/lib/plan";
import { getSkillSnapshot } from "@/lib/skills";
import { resolveThreadTitleModel } from "../title/model";
import { generateThreadTitle } from "../title/generate";
import { parseRequest } from "./parse-request";
import {
  buildActiveThreadMessages,
  buildModelTranscript,
  getFirstUserText,
  getParentMessageId,
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
  getContextCompactionSettings,
  getSearchProviderRuntime,
  getSearchSettings,
  getMemorySettings,
  getMcpServerRuntime,
  getSkillsBasePath,
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWebFetchSettings,
  getWorkspaceRootPath,
} from "./workspace";
import { applyContextCompaction } from "./context-compaction";
import type { ThreadChatRequest } from "../types";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";
import {
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
} from "../session-server";
import type { ThreadStreamEvent } from "../session-types";

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

function logRuntimeTiming(
  phase:
    | "agent_stream_created"
    | "bootstrap_ready"
    | "first_message_upsert"
    | "preflight_ready"
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
  const isStreaming =
    latestThread?.activeStreamId != null ||
    latestThread?.status === "streaming";

  if (position === "front" && isStreaming) {
    const latestAssistantId = await persist.getLatestAssistantMessageId(
      request.threadId,
    );
    return handleStopStream({
      ...request,
      ...(latestAssistantId ? { messageId: latestAssistantId } : {}),
      trigger: "stop-stream",
    });
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

// ---------------------------------------------------------------------------
// Title generation (fire-and-forget for new threads)
// ---------------------------------------------------------------------------

function createTitleTask(
  isNewThread: boolean,
  request: ThreadChatRequest,
  baseMessages: ThreadUIMessage[],
  resolvedModel: ResolvedModel,
): Promise<string | null> | null {
  if (!isNewThread || request.trigger !== "submit-user-message") return null;

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
  targetMessage: PersistedThreadMessageRecord | undefined,
  runId?: string,
): string | null {
  if (
    !request.message ||
    (request.trigger !== "submit-user-message" &&
      request.trigger !== "edit-user-message")
  ) {
    return null;
  }

  const parentMessageId = resolveUserParentId(
    request,
    transcript,
    targetMessage,
  );

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

function resolveUserParentId(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  targetMessage: PersistedThreadMessageRecord | undefined,
): string | null {
  switch (request.trigger) {
    case "submit-user-message":
      return transcript.at(-1)?.id ?? targetMessage?.messageId ?? null;
    case "edit-user-message":
      return (
        transcript.find((m) => m.id === request.messageId)?.metadata
          ?.parentMessageId ?? null
      );
    default:
      return null;
  }
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
  isNewThread: boolean;
  modelTranscript: ThreadUIMessage[];
  parentId: string | null;
  placeholderMessage: ThreadUIMessage;
  request: ThreadChatRequest;
  runId: string;
  targetMessage: PersistedThreadMessageRecord | undefined;
  timingStartedAt: number;
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
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

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
    "baseMessages" | "eventChannel" | "isNewThread" | "request" | "runId"
  >,
  resolvedModel: ResolvedModel,
): Promise<void> | null {
  const titleTask = createTitleTask(
    run.isNewThread,
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
  const {
    abortController,
    assistantId,
    eventChannel,
    modelTranscript,
    parentId,
  } = run;
  let firstMessageUpsertLogged = false;
  let latestInputTokens: number | undefined;

  try {
    const resolvedModel = await resolveThreadChatModel(
      run.request,
      run.targetMessage,
    );

    const titleUpdatePromise = launchTitleGeneration(run, resolvedModel);

    const [
      workspaceRoot,
      permissionMode,
      memorySettings,
      contextCompactionSettings,
      mcpServers,
      searchSettings,
      searchProviders,
      toolApprovalPolicies,
      webFetchSettings,
      planState,
      contextCompactionCheckpoint,
      skillsBasePath,
      enabledIntegrations,
    ] = await Promise.all([
      getWorkspaceRootPath(run.request.workspaceId, run.request.userId),
      getToolPermissionMode(run.request.userId, run.request.workspaceId),
      getMemorySettings(run.request.userId),
      getContextCompactionSettings(run.request.userId),
      getMcpServerRuntime(run.request.userId),
      getSearchSettings(run.request.userId),
      getSearchProviderRuntime(run.request.userId),
      getToolApprovalPolicies(run.request.userId),
      getWebFetchSettings(run.request.userId),
      getThreadPlanState({ threadId: run.request.threadId }).catch(() => ({
        pendingQuestionSet: null,
        plan: null,
      })),
      persist.getThreadContextCompactionCheckpoint(run.request.threadId),
      getSkillsBasePath(run.request.userId),
      getEnabledIntegrations(run.request.userId).catch(() => []),
    ]);

    const latestUserText = extractLatestUserText(run.baseMessages);
    const toolsEnabled = Boolean(workspaceRoot);
    const hasIntegrations =
      run.threadMode === "chat" && enabledIntegrations.length > 0;
    const integrationApprovalFn = (toolName: string) =>
      (toolApprovalPolicies as Record<string, boolean>)[toolName] ?? true;
    const projectAwarenessPromise = discoverProjectAwareness(workspaceRoot);
    const skillSnapshotPromise = getSkillSnapshot({
      workspaceRoot,
      globalBase: skillsBasePath,
    }).catch(() => ({
      revision: 0,
      skillRoots: [],
      skills: [],
      updatedAt: Date.now(),
    }));
    const mcpRuntimePromise =
      run.threadMode === "chat"
        ? loadMcpTools({
            entries: mcpServers,
            userId: run.request.userId,
            workspaceRoot,
          }).catch((error) => {
            log.warn(
              `Skipping MCP tools during startup: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return EMPTY_MCP_RUNTIME;
          })
        : Promise.resolve(EMPTY_MCP_RUNTIME);
    const retrievedMemoriesPromise = retrieveRelevantMemories({
      query: latestUserText,
      settings: memorySettings,
      userId: run.request.userId,
      workspaceId: run.request.workspaceId,
    }).catch(() => []);
    const integrationContextPromise = hasIntegrations
      ? buildIntegrationContext(enabledIntegrations).catch((error) => {
          log.warn(
            `Skipping integration context during startup: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return EMPTY_INTEGRATION_CONTEXT;
        })
      : Promise.resolve(EMPTY_INTEGRATION_CONTEXT);
    const integrationToolsPromise = hasIntegrations
      ? integrationContextPromise
          .then((integrationContext) =>
            loadIntegrationTools(
              enabledIntegrations.map((integration) => integration.provider),
              integrationContext,
              integrationApprovalFn,
            ),
          )
          .catch((error) => {
            log.warn(
              `Skipping integration tools during startup: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return {};
          })
      : Promise.resolve({});

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

    const stream = createUIMessageStream({
      originalMessages: modelTranscript,
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
          logRuntimeTiming("preflight_ready", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });

          const promptContext = buildThreadPromptContext({
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
            memorySettings,
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

          const baseSystemPrompt = await getSystemPrompt(
            run.request.userId,
            promptContext,
          );
          const planPromptLines = buildPlanPromptLines(planState.plan);
          const systemPrompt =
            planPromptLines.length > 0
              ? [baseSystemPrompt, ...planPromptLines]
                  .filter(Boolean)
                  .join("\n\n")
              : baseSystemPrompt;
          const compactionResult = await applyContextCompaction({
            checkpoint: contextCompactionCheckpoint,
            contextWindow: resolvedModel.contextWindow,
            enabled: contextCompactionSettings.enabled,
            fixedWindowSize: contextCompactionSettings.fixedWindowSize,
            languageModel: resolvedModel.languageModel,
            onCompactionStart: async () => {
              const compactingMessage = updatePendingAssistantStatusLabel(
                run.request.threadId,
                run.placeholderMessage,
                "Compacting context...",
              );
              run.placeholderMessage = compactingMessage;
              eventChannel.emit({
                message: compactingMessage,
                runId: run.runId,
                type: "message.upsert",
              });
            },
            providerOptions: resolvedModel.providerOptions,
            transcript: modelTranscript,
            useFixedWindow: contextCompactionSettings.useFixedWindow,
            windowPercent: contextCompactionSettings.windowPercent,
          }).catch((error) => {
            log.warn(
              `Skipping context compaction: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return {
              checkpointWasInvalid: false,
              didCompact: false,
              inputTokens: null,
              thresholdTokens: 0,
              transcript: prepareMessagesForModel(modelTranscript),
              updatedCheckpoint: null,
            };
          });
          const agentMessages = compactionResult.transcript;

          if (compactionResult.updatedCheckpoint) {
            persist.updateThreadContextCompactionCheckpoint(
              run.request.threadId,
              {
                coveredThroughMessageId:
                  compactionResult.updatedCheckpoint.coveredThroughMessageId,
                summary: compactionResult.updatedCheckpoint.summary,
              },
            );
          }

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
              streamErrorMessage =
                error instanceof Error
                  ? error.message
                  : String(error ?? "Unknown error");
              return streamErrorMessage;
            },
            options: {
              availableSkills: skillSnapshot.skills,
              ...(workspaceRoot ? { defaultDirectory: workspaceRoot } : {}),
              globalSkillsBasePath: skillsBasePath,
              integrationTools,
              mcpTools: mcpRuntime.tools,
              memorySettings,
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
          eventChannel.close();
          activeRunControls.delete(run.runId);
          return;
        }
        const finalized = tracker.finalize(
          [...modelTranscript, responseMessage as ThreadUIMessage],
          responseMessage as ThreadUIMessage,
        );
        const [finalAssistantBase] =
          normalizeThreadUIMessages(finalized).slice(-1);
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
        const persistedAssistant = persist.upsertMessage(
          run.request.threadId,
          buildPersistedAssistantMessage({
            assistantId,
            ...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {}),
            finalAssistant,
            placeholder: run.placeholderMessage,
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

        if (!streamErrorMessage) {
          void autosaveConversationMemories({
            messages: [...modelTranscript, responseMessage as ThreadUIMessage],
            model: resolvedModel.languageModel,
            providerOptions: resolvedModel.providerOptions,
            settings: memorySettings,
            sourceMessageId: assistantId,
            threadId: run.request.threadId,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
        }

        persist.clearActiveStream(run.request.threadId);

        const hasApprovalPending = (
          responseMessage as ThreadUIMessage
        ).parts.some(
          (part) => "state" in part && part.state === "approval-requested",
        );
        persist.setThreadStatus(
          run.request.threadId,
          hasApprovalPending ? "awaiting_approval" : "idle",
        );
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

  if (request.trigger === "stop-stream") {
    return handleStopStream(request);
  }

  if (request.trigger === "queue-follow-up") {
    return handleFollowUpAction(request, existingThread, "tail");
  }

  if (request.trigger === "steer-follow-up") {
    return handleFollowUpAction(request, existingThread, "front");
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const transcript = buildActiveThreadMessages(allRecords);
  const threadMode = normalizeThreadMode(
    request.threadMode ?? existingThread?.mode,
  );
  const isNewThread = !existingThread;
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

  const fallbackTitle =
    getFirstUserText(baseMessages)?.slice(0, 100) ?? "New thread";
  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
    threadMode,
  );
  let activeRunId: string | null = null;

  try {
    if (request.trigger === "submit-plan-answer" && request.planQuestionSetId) {
      await answerThreadPlanQuestionSet({
        answers: request.planAnswers ?? [],
        questionSetId: request.planQuestionSetId,
        threadId: request.threadId,
      });
    }

    await persist.updateThreadChatSettings(request.threadId, {
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
    const assistantId = continuationAssistant?.id ?? crypto.randomUUID();
    const parentId = getParentMessageId(request, allRecords);
    const placeholder = buildPlaceholderMessage(
      request,
      parentId,
      assistantId,
      continuationAssistant,
    );
    const persistedUserId = persistUserMessage(
      request,
      transcript,
      targetMessage,
      runId,
    );
    if (persistedUserId) {
      await persist.setActiveMessage(request.threadId, persistedUserId);
    }
    const placeholderMessage = persist.upsertMessage(request.threadId, {
      ...placeholder,
      metadata: mergeThreadMessageMetadata(placeholder.metadata, {
        runId,
      }),
    });
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
      isNewThread,
      modelTranscript,
      parentId,
      placeholderMessage,
      request,
      runId,
      targetMessage,
      timingStartedAt,
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
    persist.clearActiveStream(request.threadId);
    persist.setThreadStatus(request.threadId, "idle");
    if (activeRunId && activeRunControls.has(activeRunId)) {
      activeRunControls.get(activeRunId)?.eventChannel.close();
      activeRunControls.delete(activeRunId);
    }
    throw error;
  }
}

export async function runThreadChat(rawInput: unknown, userId: string) {
  return runParsedThreadChat(rawInput, userId);
}
