import type { AIProvider } from "@/server/db/enums";

import { toCompositeModelId } from "../providers/models";
import { getLanguageModel } from "../providers/resolver";

import type { ResolvedThreadTitleModel } from "./types";

const TOOL_SELECTION_MODEL_IDS: Record<AIProvider, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash-lite",
  google_vertex: "gemini-2.5-flash-lite",
  openai: "gpt-4.1-nano",
  vercel: "gpt-4.1-nano",
  xai: "grok-3-mini",
  azure: "gpt-4.1-nano",
  amazon_bedrock: "anthropic.claude-haiku-4-5-v1",
  groq: "llama-3.3-70b-versatile",
  cohere: "command-a-03-2025",
  moonshotai: "moonshot-v1-8k",
  mistral: "mistral-small-latest",
  ollama: "llama3.2",
  openrouter: "openai/gpt-4.1-nano",
};

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
