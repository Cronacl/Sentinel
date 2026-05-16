import {
  createAgentUIStream,
  createUIMessageStream,
  generateId,
  readUIMessageStream,
  smoothStream,
} from "ai";

import { getErrorMessage } from "@/lib/errors";
import {
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  prepareMessagesForModel,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";

import { createAttachmentDownloadHandler } from "../attachments";
import { buildPersistedAssistantMessage } from "../finalize";
import { resolveThreadChatModel } from "../../context/model";
import * as persist from "../../persistence";
import { createReasoningMetadataTracker } from "../reasoning";
import { getSystemPrompt } from "../system-prompt";
import { createThreadAgent } from "../../agent";
import {
  buildThreadPromptContext,
  createMcpPromptNamespace,
} from "../../context/prompt-context";
import type { ThreadPromptIntegration } from "../../context/prompt-context";
import { discoverProjectAwareness } from "../project-discovery";
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
import { resolveThreadTitleModel } from "../../title/model";
import { generateThreadTitle } from "../../title/generate";
import { prepareThreadChatRequest } from "./request-entry";
import {
  resolveThreadEngine,
  runExternalThreadEngine,
  stopThreadEngine,
} from "./engine-dispatcher";
import {
  drainFollowUpQueue,
  handleFollowUpAction,
  handleStopStream,
} from "./follow-up-queue";
import {
  buildActiveThreadMessages,
  buildFirstUserMessageTitle,
  buildModelTranscript,
  getFirstUserText,
  getParentMessageId,
  injectComposerContextIntoTranscript,
  truncateTranscriptAtMessage,
} from "../transcript";
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
} from "../../tools/selection/targeting";
import { loadIntegrationTools } from "@/lib/integrations/registry";
import {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
  getThreadCheckpointAnchorMessageId,
} from "../../repo/checkpoints";
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
} from "../workspace";
import {
  prepareThreadContextCompactionForGeneration,
  refreshThreadContextCompactionCheckpoint,
} from "../context-compaction-refresh";
import type { ThreadChatRequest } from "../../types";
import { normalizeThreadChatErrorMessage } from "../../errors";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";
import { loadThreadSessionSnapshot } from "../../session/server";
import {
  activeRunControls,
  createThreadEventChannel,
  emitLatestThreadSnapshot,
  streamStillOwnsThread,
  type ThreadEventChannel,
} from "./run-state";
import {
  logRuntimeTiming,
  threadChatLog as log,
  withOptionalPreflightBudget,
} from "./runtime-timing";
import {
  buildPlaceholderMessage,
  emitPendingAssistantStatusLabel,
  findContinuationAssistant,
  getInitialPendingStatusLabel,
  getThreadAgentRole,
  persistAssistantSnapshot,
  persistUserMessage,
  updatePendingAssistantStatusLabel,
} from "./sentinel-messages";

type ResolvedModel = Awaited<ReturnType<typeof resolveThreadChatModel>>;

const EMPTY_INTEGRATION_CONTEXT = {
  databases: {},
  tokens: {},
} as const;

// `runParsedThreadChat` owns routing and bootstrap; `executeBootstrappedThreadRun`
// owns Sentinel generation. Keeping that split visible prevents route handling
// from drifting back into model execution details.
function fallbackProjectAwareness(workspaceRoot: string | null) {
  return {
    preferredProjectRoot: workspaceRoot,
    projectCandidates: [],
    shellStartDirectory: workspaceRoot,
  } satisfies Awaited<ReturnType<typeof discoverProjectAwareness>>;
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
    messageId: run.assistantId,
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
      .then(async (normalizedModelTranscript) => {
        const prepared = await prepareThreadContextCompactionForGeneration({
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
        });
        if (prepared.mode === "blocking") {
          logRuntimeTiming("compaction_blocking", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
        } else if (prepared.mode === "deferred") {
          logRuntimeTiming("compaction_deferred", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          void prepared.backgroundRefresh?.catch((error) => {
            log.warn(
              `Skipping deferred context compaction: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
        } else if (prepared.mode === "reused") {
          logRuntimeTiming("compaction_reused", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
        }
        return prepared.result;
      })
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
            toolTags: run.request.toolTags ?? [],
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
        if (streamErrorMessage) {
          eventChannel.emit({
            error: streamErrorMessage,
            messageId: persistedAssistant.id,
            runId: run.runId,
            threadStatus: "idle",
            type: "run.failed",
          });
          log.error("run_failed", {
            engine: run.request.engine ?? "sentinel",
            error: streamErrorMessage,
            messageId: persistedAssistant.id,
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
          logRuntimeTiming("run_failed", run.timingStartedAt, {
            runId: run.runId,
            threadId: run.request.threadId,
            trigger: run.request.trigger,
            userId: run.request.userId,
            workspaceId: run.request.workspaceId,
          });
        } else {
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
        }
        if (titleUpdatePromise) {
          await titleUpdatePromise;
        }
        eventChannel.close();
        activeRunControls.delete(run.runId);

        if (!streamErrorMessage && !hasApprovalPending) {
          await drainFollowUpQueue(run.request, { runParsedThreadChat });
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

export async function runParsedThreadChat(
  rawInput: unknown,
  userId: string,
  _options?: { detached?: boolean },
) {
  const timingStartedAt = Date.now();
  const request = await prepareThreadChatRequest(
    rawInput,
    userId,
    timingStartedAt,
  );
  const existingThread = await persist.loadThread(request.threadId);
  const engine = resolveThreadEngine(request, existingThread);

  if (request.trigger === "stop-stream") {
    const engineStopResponse = await stopThreadEngine(
      engine,
      request,
      existingThread,
    );

    return (
      engineStopResponse ?? handleStopStream(request, { runParsedThreadChat })
    );
  }

  if (request.trigger === "queue-follow-up") {
    return handleFollowUpAction(request, existingThread, "tail", {
      runParsedThreadChat,
    });
  }

  if (request.trigger === "steer-follow-up") {
    return handleFollowUpAction(request, existingThread, "front", {
      runParsedThreadChat,
    });
  }

  const externalEngineResponse = await runExternalThreadEngine(
    engine,
    request,
    existingThread,
  );
  if (externalEngineResponse) {
    return externalEngineResponse;
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
    logRuntimeTiming("repo_checkpoint_started", timingStartedAt, {
      runId,
      threadId: request.threadId,
      trigger: request.trigger,
      userId: request.userId,
      workspaceId: request.workspaceId,
    });
    void beginThreadRepoCheckpointRun({
      projectPath: repoCheckpointProjectPath,
      runId,
      thread: existingThread,
    }).then(() => {
      logRuntimeTiming("repo_checkpoint_ready", timingStartedAt, {
        runId,
        threadId: request.threadId,
        trigger: request.trigger,
        userId: request.userId,
        workspaceId: request.workspaceId,
      });
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
