import type { AIProvider } from "@/server/db/enums";

import { toCompositeModelId } from "../models";
import { getLanguageModel } from "../resolver";

import type { ResolvedThreadTitleModel } from "./types";

const THREAD_TITLE_MODEL_IDS = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash-lite",
  google_vertex: "gemini-2.5-flash-lite",
  openai: "gpt-4.1-nano",
} as const satisfies Record<AIProvider, string>;

export function getThreadTitleModelId(providerId: AIProvider): string {
  return THREAD_TITLE_MODEL_IDS[providerId];
}

export async function resolveThreadTitleModel({
  providerId,
  userId,
}: {
  providerId: AIProvider;
  userId: string;
}): Promise<ResolvedThreadTitleModel> {
  const responseModelId = getThreadTitleModelId(providerId);
  const requestedModelId = toCompositeModelId(providerId, responseModelId);

  return {
    languageModel: await getLanguageModel(userId, requestedModelId),
    providerId,
    requestedModelId,
    responseModelId,
  };
}
