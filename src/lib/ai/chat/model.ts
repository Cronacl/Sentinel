import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { threads } from "@/server/db/schema";

import {
  findModel,
  getReasoningProviderOptions,
  type ReasoningEffort,
} from "../providers/models";
import {
  getEnabledModels,
  getLanguageModel,
  parseModelId,
} from "../providers/resolver";
import {
  normalizeThreadMessageMetadata,
  type ThreadMessageMetadata,
} from "../messages/types";
import type { PersistedThreadMessageRecord } from "../messages/branches";

import type { ResolvedThreadChatModel, ThreadChatRequest } from "./types";

export async function resolveThreadChatModel(
  request: ThreadChatRequest,
  targetMessage?: PersistedThreadMessageRecord,
): Promise<ResolvedThreadChatModel> {
  const targetMeta = targetMessage
    ? normalizeThreadMessageMetadata(
        targetMessage.metadata as ThreadMessageMetadata | null | undefined,
      )
    : undefined;

  const thread = db
    .select({
      chatModelId: threads.chatModelId,
      chatReasoningEffort: threads.chatReasoningEffort,
    })
    .from(threads)
    .where(eq(threads.id, request.threadId))
    .get();
  const enabledModelIds = new Set(
    (await getEnabledModels(request.userId)).map((model) => model.compositeId),
  );
  const usableThreadModelId =
    thread?.chatModelId && enabledModelIds.has(thread.chatModelId)
      ? thread.chatModelId
      : undefined;

  const requestedModelId =
    request.modelId ??
    usableThreadModelId ??
    request.message?.metadata?.model?.requestedModelId ??
    request.message?.metadata?.model?.responseModelId ??
    targetMeta?.model?.requestedModelId ??
    targetMeta?.model?.responseModelId;

  if (!requestedModelId) {
    throw new Error("Model id is required for this chat operation.");
  }

  const parsedModel = parseModelId(requestedModelId);
  const reasoningEffort =
    ((request.reasoningEffort ??
      (usableThreadModelId ? thread?.chatReasoningEffort : undefined)) as
      | ReasoningEffort
      | undefined) ?? undefined;

  return {
    contextWindow: findModel(parsedModel.provider, parsedModel.model)
      ?.contextWindow,
    languageModel: await getLanguageModel(request.userId, requestedModelId),
    providerId: parsedModel.provider,
    providerOptions: getReasoningProviderOptions(
      parsedModel.provider,
      parsedModel.model,
      reasoningEffort,
    ),
    requestedModelId,
    responseModelId: parsedModel.model,
  };
}
