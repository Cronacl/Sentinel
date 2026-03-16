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

export async function runThreadChat(rawInput: unknown, userId: string) {
  const request = await parseRequest(rawInput, userId);

  if (request.trigger === "stop-stream") {
    if (request.messageId) {
      await persist.updateMessageMetadata(request.threadId, request.messageId, {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      });
    }
    await disposeShellSession(request.threadId);
    persist.clearActiveStream(request.threadId);
    return new Response(null, { status: 204 });
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

  if (
    request.message &&
    (request.trigger === "submit-user-message" ||
      request.trigger === "edit-user-message")
  ) {
    const parentMessageId =
      request.trigger === "submit-user-message"
        ? (transcript.at(-1)?.id ?? targetMessage?.messageId ?? null)
        : (transcript.find((m) => m.id === request.messageId)?.metadata
            ?.parentMessageId ?? null);

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
    await persist.setActiveMessage(request.threadId, userMsg.id);
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
    getThreadPlanState({
      threadId: request.threadId,
    }).catch(() => ({ pendingQuestionSet: null, plan: null })),
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
  const continuationAssistant =
    request.trigger === "submit-tool-approval" ||
    request.trigger === "submit-plan-answer"
      ? [...modelTranscript]
          .reverse()
          .find((message) => message.role === "assistant")
      : undefined;

  const resolvedTitlePromise =
    isNewThread && request.trigger === "submit-user-message"
      ? (() => {
          const text = getFirstUserText(baseMessages);
          if (!text?.trim()) {
            return null;
          }

          return (async () => {
            const titleModel = await resolveThreadTitleModel({
              providerId: resolvedModel.providerId,
              userId: request.userId,
            });

            return generateThreadTitle({
              firstUserText: text,
              model: titleModel,
            });
          })();
        })()
      : null;

  const assistantId = continuationAssistant?.id ?? crypto.randomUUID();
  const parentId = getParentMessageId(request, allRecords);
  const placeholder: ThreadUIMessage = continuationAssistant
    ? {
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
      }
    : {
        id: assistantId,
        role: "assistant",
        parts: [{ text: " ", type: "text" }],
        metadata: {
          branchId:
            request.trigger === "edit-user-message"
              ? request.message?.id
              : (parentId ?? assistantId),
          isActive: true,
          model: {
            providerId: resolvedModel.providerId,
            requestedModelId: resolvedModel.requestedModelId,
          },
          parentMessageId: parentId,
          status: "pending",
        },
      };

  persist.upsertMessage(request.threadId, placeholder);
  await persist.setActiveMessage(request.threadId, assistantId);

  const mcpRuntimePromise =
    threadMode === "chat"
      ? loadMcpTools({
          entries: mcpServers,
          userId: request.userId,
          workspaceRoot,
        })
      : Promise.resolve({ closeAll: async () => {}, tools: {} });

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
            : { closeAll: async () => {}, tools: {} };
        closeMcpTools = mcpRuntime.closeAll;
        const mcpToolNames = Object.keys(mcpRuntime.tools);

        const integrationContext =
          threadMode === "chat" && enabledIntegrations.length > 0
            ? await buildIntegrationContext(enabledIntegrations)
            : { tokens: {} };

        const integrationApprovalFn = (toolName: string) =>
          (toolApprovalPolicies as Record<string, boolean>)[toolName] ?? true;

        const integrationTools =
          threadMode === "chat" && enabledIntegrations.length > 0
            ? await loadIntegrationTools(
                enabledIntegrations.map((i) => i.provider),
                integrationContext,
                integrationApprovalFn,
              )
            : {};

        const promptContext = buildThreadPromptContext({
          availableSkills: skillSnapshot.skills,
          enabledIntegrations: enabledIntegrations.map((i) => ({
            provider: i.provider,
            label:
              i.provider === "gmail"
                ? "Gmail"
                : i.provider === "google_calendar"
                  ? "Google Calendar"
                  : i.provider === "google_drive"
                    ? "Google Drive"
                    : i.provider === "github"
                      ? "GitHub"
                      : i.provider === "linear"
                        ? "Linear"
                        : i.provider,
            toolCount: Object.keys(integrationTools).filter((name) =>
              i.provider === "gmail"
                ? name.startsWith("gmail_")
                : i.provider === "google_calendar"
                  ? name.startsWith("gcal_")
                  : i.provider === "google_drive"
                    ? name.startsWith("gdrive_")
                    : i.provider === "github"
                      ? name.startsWith("gh_")
                      : i.provider === "linear"
                        ? name.startsWith("linear_")
                        : false,
            ).length,
          })),
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
          ...(streamErrorMessage ? { errorMessage: streamErrorMessage } : {}),
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
    },
  });

  return createUIMessageStreamResponse({
    headers: {
      "Content-Encoding": "none",
    },
    stream,
    async consumeSseStream({ stream: sseStream }) {
      const streamId = generateId();
      persist.setActiveStream(request.threadId, streamId);
      try {
        await streamContext.createNewResumableStream(streamId, () => sseStream);
      } catch (error) {
        persist.clearActiveStream(request.threadId);
        throw error;
      }
    },
  });
}
