import type { AIProvider } from "@/server/db/enums";

import { toCompositeModelId } from "../providers/models";
import { getLanguageModel } from "../providers/resolver";

import type { ResolvedThreadTitleModel } from "./types";

const TOOL_SELECTION_MODEL_IDS = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash-lite",
  google_vertex: "gemini-2.5-flash-lite",
  openai: "gpt-4.1-nano",
} as const satisfies Record<AIProvider, string>;

export type ResolvedToolSelectionModel = ResolvedThreadTitleModel;

export function getToolSelectionModelId(providerId: AIProvider): string {
  return TOOL_SELECTION_MODEL_IDS[providerId];
}

export async function resolveToolSelectionModel({
  providerId,
  userId,
}: {
  providerId: AIProvider;
  userId: string;
}): Promise<ResolvedToolSelectionModel> {
  const responseModelId = getToolSelectionModelId(providerId);
  const requestedModelId = toCompositeModelId(providerId, responseModelId);

  return {
    languageModel: await getLanguageModel(userId, requestedModelId),
    providerId,
    requestedModelId,
    responseModelId,
  };
}
