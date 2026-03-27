import type { AIProvider } from "@/server/db/enums";

import { toCompositeModelId } from "../../providers/models";
import { getLanguageModel } from "../../providers/resolver";

import type { ResolvedThreadTitleModel } from "../types";

const THREAD_TITLE_MODEL_IDS = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash-lite",
  google_vertex: "gemini-2.5-flash-lite",
  openai: "gpt-4.1-nano",
  vercel: "openai/gpt-4.1-nano",
  xai: "grok-3-mini",
  azure: "gpt-4.1-mini",
  amazon_bedrock: "anthropic.claude-3-haiku-20240307-v1:0",
  groq: "llama-3.1-8b-instant",
  cohere: "command-r",
  moonshotai: "moonshot-v1-8k",
  mistral: "mistral-small-latest",
  ollama: "llama3",
  openrouter: "openai/gpt-4.1-nano",
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
