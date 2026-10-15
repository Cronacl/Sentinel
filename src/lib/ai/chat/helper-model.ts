import type { AIProvider } from "@/server/db/enums";

import {
  getLowestReasoningEffort,
  getReasoningProviderOptions,
  toCompositeModelId,
} from "../providers/models";
import { getLanguageModel } from "../providers/resolver";

import type { ResolvedThreadTitleModel } from "./types";

/**
 * Resolves a fast helper model (thread titles, tool routing) of the given
 * provider and asks it for the least reasoning it supports, so helper calls
 * stay quick on reasoning models.
 */
export async function resolveHelperModel({
  providerId,
  responseModelId,
  userId,
}: {
  providerId: AIProvider;
  responseModelId: string;
  userId: string;
}): Promise<ResolvedThreadTitleModel> {
  const requestedModelId = toCompositeModelId(providerId, responseModelId);
  const providerOptions = getReasoningProviderOptions(
    providerId,
    responseModelId,
    getLowestReasoningEffort(providerId, responseModelId),
  );

  return {
    languageModel: await getLanguageModel(userId, requestedModelId),
    providerId,
    ...(providerOptions ? { providerOptions } : {}),
    requestedModelId,
    responseModelId,
  };
}
