import type { AIProvider } from "@/server/db/enums";

import { resolveHelperModel } from "../../helper-model";

import type { ResolvedThreadTitleModel } from "../../types";

// Small, fast models per provider. Every id must be a built-in catalog entry
// (title/model.test.ts checks this); Azure ids are deployment names.
const TOOL_SELECTION_MODEL_IDS: Partial<Record<AIProvider, string>> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.5-flash-lite",
  google_vertex: "gemini-3.5-flash-lite",
  openai: "gpt-6-luna",
  vercel: "google/gemini-3.5-flash-lite",
  xai: "grok-4.20-non-reasoning",
  azure: "gpt-4.1-nano",
  amazon_bedrock: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  groq: "llama-3.3-70b-versatile",
  cohere: "command-a-03-2025",
  moonshotai: "kimi-k2.6",
  mistral: "mistral-small-latest",
  ollama: "llama3.2",
  openrouter: "google/gemini-3.5-flash-lite",
  deepseek: "deepseek-flash",
};

export type ResolvedToolSelectionModel = ResolvedThreadTitleModel;

export function getToolSelectionModelId(providerId: AIProvider): string {
  return (
    TOOL_SELECTION_MODEL_IDS[providerId] ?? TOOL_SELECTION_MODEL_IDS.openai!
  );
}

export async function resolveToolSelectionModel({
  providerId,
  userId,
}: {
  providerId: AIProvider;
  userId: string;
}): Promise<ResolvedToolSelectionModel> {
  return await resolveHelperModel({
    providerId,
    responseModelId: getToolSelectionModelId(providerId),
    userId,
  });
}
