import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  smoothStream,
} from "ai";

import { streamContext } from "@/lib/streams";
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
  countIntegrationTools,
} from "@/lib/integrations/runtime";
import { loadIntegrationTools } from "@/lib/integrations/registry";
import {
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
import type { ThreadChatRequest } from "../types";
import type { PersistedThreadMessageRecord } from "@/lib/ai/messages/branches";

type ResolvedModel = Awaited<ReturnType<typeof resolveThreadChatModel>>;

// ---------------------------------------------------------------------------
// Stop-stream handler
// ---------------------------------------------------------------------------

async function handleStopStream(request: ThreadChatRequest): Promise<Response> {
  if (request.messageId) {
    await persist.updateMessageMetadata(request.threadId, request.messageId, {
      errorMessage: "Generation stopped.",
      status: "cancelled",
    });
  }
  await disposeShellSession(request.threadId);
  persist.clearActiveStream(request.threadId);
  persist.setThreadStatus(request.threadId, "idle");
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Placeholder message construction
// ---------------------------------------------------------------------------

function buildPlaceholderMessage(
  request: ThreadChatRequest,
  resolvedModel: ResolvedModel,
  parentId: string | null,
  assistantId: string,
  continuationAssistant: ThreadUIMessage | undefined,
): ThreadUIMessage {
  if (continuationAssistant) {
    return {
      ...continuationAssistant,
      metadata: mergeThreadMessageMetadata(continuationAssistant.metadata, {
        isActive: true,
        model: {
          providerId: resolvedModel.providerId,
          requestedModelId: resolvedModel.requestedModelId,
        },
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
      model: {
        providerId: resolvedModel.providerId,
        requestedModelId: resolvedModel.requestedModelId,
      },
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
  return enabledIntegrations.map((integration) => ({
    provider: integration.provider as Parameters<typeof getIntegrationLabel>[0],
    label: getIntegrationLabel(
      integration.provider as Parameters<typeof getIntegrationLabel>[0],
    ),
    toolCount: countIntegrationTools(
      integration.provider as Parameters<typeof countIntegrationTools>[0],
      integrationToolNames,
    ),
  }));
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
      status: "completed",
      ...(request.trigger === "edit-user-message" && request.messageId
        ? { editedFromMessageId: request.messageId }
        : {}),
    }),
  };

  persist.upsertMessage(request.threadId, userMsg);
  return userMsg.id;
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runThreadChat(rawInput: unknown, userId: string) {
  const request = await parseRequest(rawInput, userId);

  if (request.trigger === "stop-stream") {
    return handleStopStream(request);
  }

  const allRecords = await persist.loadThreadMessages(request.threadId);
  const existingThread = await persist.loadThread(request.threadId);
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
  persist.setThreadStatus(request.threadId, "streaming");

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

    const persistedUserId = persistUserMessage(
      request,
      transcript,
      targetMessage,
    );
    if (persistedUserId) {
      await persist.setActiveMessage(request.threadId, persistedUserId);
    }

    persist.clearActiveStream(request.threadId);

    const resolvedModel = await resolveThreadChatModel(request, targetMessage);

    const [
      workspaceRoot,
      permissionMode,
      memorySettings,
      mcpServers,
      searchSettings,
      searchProviders,
      toolApprovalPolicies,
      webFetchSettings,
      planState,
      skillsBasePath,
      enabledIntegrations,
    ] = await Promise.all([
      getWorkspaceRootPath(request.workspaceId, request.userId),
      getToolPermissionMode(request.userId),
      getMemorySettings(request.userId),
      getMcpServerRuntime(request.userId),
      getSearchSettings(request.userId),
      getSearchProviderRuntime(request.userId),
      getToolApprovalPolicies(request.userId),
      getWebFetchSettings(request.userId),
      getThreadPlanState({ threadId: request.threadId }).catch(() => ({
        pendingQuestionSet: null,
        plan: null,
      })),
      getSkillsBasePath(request.userId),
      getEnabledIntegrations(request.userId).catch(() => []),
    ]);

    const skillSnapshot = await getSkillSnapshot({
      workspaceRoot,
      globalBase: skillsBasePath,
    }).catch(() => ({
      revision: 0,
      skillRoots: [],
      skills: [],
      updatedAt: Date.now(),
    }));

    const toolsEnabled = Boolean(workspaceRoot);
    const continuationAssistant = findContinuationAssistant(
      request,
      modelTranscript,
    );

    const resolvedTitlePromise = createTitleTask(
      isNewThread,
      request,
      baseMessages,
      resolvedModel,
    );

    const assistantId = continuationAssistant?.id ?? crypto.randomUUID();
    const parentId = getParentMessageId(request, allRecords);

    const placeholder = buildPlaceholderMessage(
      request,
      resolvedModel,
      parentId,
      assistantId,
      continuationAssistant,
    );

    persist.upsertMessage(request.threadId, placeholder);
    await persist.setActiveMessage(request.threadId, assistantId);

    const mcpRuntimePromise =
      threadMode === "chat"
        ? loadMcpTools({
            entries: mcpServers,
            userId: request.userId,
            workspaceRoot,
          })
        : Promise.resolve(EMPTY_MCP_RUNTIME);

    const memoryQuery = extractLatestUserText(baseMessages);
    const retrievedMemories = await retrieveRelevantMemories({
      query: memoryQuery,
      settings: memorySettings,
      userId: request.userId,
      workspaceId: request.workspaceId,
    }).catch(() => []);

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

    const agentMessages = prepareMessagesForModel(modelTranscript);
    let streamErrorMessage: string | undefined;
    let closeMcpTools = async () => {};

    const stream = createUIMessageStream({
      originalMessages: modelTranscript,
      execute: async ({ writer }) => {
        try {
          const mcpRuntime =
            threadMode === "chat"
              ? await mcpRuntimePromise
              : EMPTY_MCP_RUNTIME;
          closeMcpTools = mcpRuntime.closeAll;
          const mcpToolNames = Object.keys(mcpRuntime.tools);

          const hasIntegrations =
            threadMode === "chat" && enabledIntegrations.length > 0;

          const integrationContext = hasIntegrations
            ? await buildIntegrationContext(enabledIntegrations)
            : { tokens: {}, databases: {} };

          const integrationApprovalFn = (toolName: string) =>
            (toolApprovalPolicies as Record<string, boolean>)[toolName] ?? true;

          const integrationTools = hasIntegrations
            ? await loadIntegrationTools(
                enabledIntegrations.map((i) => i.provider),
                integrationContext,
                integrationApprovalFn,
              )
            : {};

          const integrationToolNames = Object.keys(integrationTools);

          const promptContext = buildThreadPromptContext({
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
                return {
                  ...(entry.catalogId ? { catalogId: entry.catalogId } : {}),
                  id: entry.id,
                  name: entry.name,
                  namespace,
                  toolCount: mcpToolNames.filter((toolName) =>
                    toolName.startsWith(`mcp_${namespace}__`),
                  ).length,
                  transport: entry.transport,
                };
              }),
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
            searchProviders,
            searchSettings,
            skillRoots: skillSnapshot.skillRoots,
            sourceMessageId: parentId,
            threadMode,
            toolApprovalPolicies,
            webFetchSettings,
            workspaceRoot,
          });

          const baseSystemPrompt = await getSystemPrompt(
            request.userId,
            promptContext,
          );
          const planPromptLines = buildPlanPromptLines(planState.plan);
          const systemPrompt =
            planPromptLines.length > 0
              ? [baseSystemPrompt, ...planPromptLines]
                  .filter(Boolean)
                  .join("\n\n")
              : baseSystemPrompt;

          const result = await createAgentUIStream({
            agent,
            experimental_transform: smoothStream({ chunking: "line" }),
            generateMessageId: () => assistantId,
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
              searchProviders,
              searchSettings,
              skillRoots: skillSnapshot.skillRoots,
              sourceMessageId: parentId,
              systemPrompt,
              threadId: request.threadId,
              threadMode,
              toolApprovalPolicies,
              toolsEnabled,
              userId: request.userId,
              webFetchSettings,
              workspaceId: request.workspaceId,
            },
            originalMessages: modelTranscript as never,
            sendReasoning: true,
            sendSources: true,
            uiMessages: agentMessages as never,
          });
          writer.merge(result as ReadableStream<any>);
        } catch (error) {
          await closeMcpTools();
          throw error;
        }

        if (resolvedTitlePromise) {
          const title = await resolvedTitlePromise.catch(() => null);
          if (title) {
            persist.updateThreadTitle(request.threadId, title);
            writer.write({
              type: "data-thread-title",
              data: { threadId: request.threadId, title },
            });
            writer.write({
              type: "data-thread-invalidation",
              data: { target: "all", threadId: request.threadId },
            });
          }
        }
      },
      onFinish: async ({ responseMessage }) => {
        await closeMcpTools();
        const finalized = tracker.finalize(
          [...modelTranscript, responseMessage as ThreadUIMessage],
          responseMessage as ThreadUIMessage,
        );
        const [finalAssistant] = normalizeThreadUIMessages(finalized).slice(-1);
        persist.upsertMessage(
          request.threadId,
          buildPersistedAssistantMessage({
            assistantId,
            ...(streamErrorMessage
              ? { errorMessage: streamErrorMessage }
              : {}),
            finalAssistant,
            placeholder,
          }),
        );

        if (!streamErrorMessage) {
          void autosaveConversationMemories({
            messages: [...modelTranscript, responseMessage as ThreadUIMessage],
            model: resolvedModel.languageModel,
            providerOptions: resolvedModel.providerOptions,
            settings: memorySettings,
            sourceMessageId: assistantId,
            threadId: request.threadId,
            userId: request.userId,
            workspaceId: request.workspaceId,
          });
        }

        persist.clearActiveStream(request.threadId);

        const hasApprovalPending = (
          responseMessage as ThreadUIMessage
        ).parts.some(
          (part) => "state" in part && part.state === "approval-requested",
        );
        persist.setThreadStatus(
          request.threadId,
          hasApprovalPending ? "awaiting_approval" : "idle",
        );
      },
    });

    return createUIMessageStreamResponse({
      headers: { "Content-Encoding": "none" },
      stream,
      async consumeSseStream({ stream: sseStream }) {
        const streamId = generateId();
        persist.setActiveStream(request.threadId, streamId);
        try {
          await streamContext.createNewResumableStream(
            streamId,
            () => sseStream,
          );
        } catch (error) {
          persist.clearActiveStream(request.threadId);
          persist.setThreadStatus(request.threadId, "idle");
          throw error;
        }
      },
    });
  } catch (error) {
    persist.setThreadStatus(request.threadId, "idle");
    throw error;
  }
}
