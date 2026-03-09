import { getReasoningProviderOptions } from "../models";
import { getLanguageModel, parseModelId } from "../resolver";
import {
  normalizeThreadMessageMetadata,
  type ThreadMessageMetadata,
} from "../thread-message-types";

import type {
  ResolvedThreadChatModel,
  ThreadChatRequest,
  ThreadConversationState,
} from "./types";

/**
 * Resolves the AI SDK language model and reasoning provider options required
 * for the current chat request.
 */
export async function resolveThreadChatModel(
  request: ThreadChatRequest,
  conversation: ThreadConversationState,
): Promise<ResolvedThreadChatModel> {
  const requestedModelId =
    request.modelId ??
    request.message?.metadata?.model?.requestedModelId ??
    request.message?.metadata?.model?.responseModelId ??
    (conversation.targetMessage
      ? normalizeThreadMessageMetadata(
          conversation.targetMessage.metadata as ThreadMessageMetadata | null | undefined,
        ).model?.requestedModelId
      : undefined) ??
    (conversation.targetMessage
      ? normalizeThreadMessageMetadata(
          conversation.targetMessage.metadata as ThreadMessageMetadata | null | undefined,
        ).model?.responseModelId
      : undefined);

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
