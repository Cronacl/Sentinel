import { getReasoningProviderOptions } from "../models";
import { getLanguageModel, parseModelId } from "../resolver";
import {
  normalizeThreadMessageMetadata,
  type ThreadMessageMetadata,
} from "../thread-message-types";
import type { PersistedThreadMessageRecord } from "../thread-branches";

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

  const requestedModelId =
    request.modelId ??
    request.message?.metadata?.model?.requestedModelId ??
    request.message?.metadata?.model?.responseModelId ??
    targetMeta?.model?.requestedModelId ??
    targetMeta?.model?.responseModelId;

  if (!requestedModelId) {
    throw new Error("Model id is required for this chat operation.");
  }

  const parsedModel = parseModelId(requestedModelId);

  return {
    languageModel: await getLanguageModel(request.userId, requestedModelId),
    providerId: parsedModel.provider,
    providerOptions: getReasoningProviderOptions(
      parsedModel.provider,
      parsedModel.model,
      request.reasoningEffort,
    ),
    requestedModelId,
    responseModelId: parsedModel.model,
  };
}
