import type { AIProvider } from "@/../generated/prisma";

export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tool_use"
  | "object_generation";

export type ModelMeta = {
  id: string;
  displayName: string;
  description: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
};

export const MODEL_CATALOG: Record<AIProvider, ModelMeta[]> = {
  openai: [
    {
      id: "gpt-5.2-pro",
      displayName: "GPT-5.2 Pro",
      description: "Most capable GPT-5.2 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5.2",
      displayName: "GPT-5.2",
      description: "Latest GPT-5.2 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5.1",
      displayName: "GPT-5.1",
      description: "GPT-5.1 flagship model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5.1-codex",
      displayName: "GPT-5.1 Codex",
      description: "Code-optimized GPT-5.1.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5.1-codex-mini",
      displayName: "GPT-5.1 Codex Mini",
      description: "Compact code-optimized GPT-5.1.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5-pro",
      displayName: "GPT-5 Pro",
      description: "High-performance GPT-5.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5",
      displayName: "GPT-5",
      description: "GPT-5 flagship model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Compact GPT-5 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Fastest GPT-5 for simple tasks.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Code-optimized GPT-5.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-4.1",
      displayName: "GPT-4.1",
      description: "Improved coding and instruction-following.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "gpt-4.1-mini",
      displayName: "GPT-4.1 Mini",
      description: "Compact GPT-4.1 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "gpt-4.1-nano",
      displayName: "GPT-4.1 Nano",
      description: "Fastest GPT-4.1 for simple tasks.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "gpt-4o",
      displayName: "GPT-4o",
      description: "Fast, multimodal model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-4o-mini",
      displayName: "GPT-4o Mini",
      description: "Compact GPT-4o variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "o4-mini",
      displayName: "o4 Mini",
      description: "Fast reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "o3",
      displayName: "o3",
      description: "Advanced reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "o3-mini",
      displayName: "o3 Mini",
      description: "Efficient reasoning model.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
  ],
  anthropic: [
    {
      id: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description: "Most capable Claude model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      description: "Latest balanced Sonnet model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-opus-4-5",
      displayName: "Claude Opus 4.5",
      description: "Previous-gen flagship model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      description: "Fast and compact Claude model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-sonnet-4-5",
      displayName: "Claude Sonnet 4.5",
      description: "Balanced performance and speed.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-opus-4-1",
      displayName: "Claude Opus 4.1",
      description: "Strong general-purpose model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-opus-4-0",
      displayName: "Claude Opus 4",
      description: "First-gen Opus 4 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-sonnet-4-0",
      displayName: "Claude Sonnet 4",
      description: "First-gen Sonnet 4 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
  ],
  google: [
    {
      id: "gemini-3-pro-preview",
      displayName: "Gemini 3 Pro Preview",
      description: "Next-gen Gemini preview model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Most capable Gemini model with reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Fast model with thinking capabilities.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-001",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and efficient Gemini model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
  google_vertex: [
    {
      id: "gemini-3-pro-preview",
      displayName: "Gemini 3 Pro Preview",
      description: "Next-gen Gemini preview model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Most capable Gemini model with reasoning via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Fast model with thinking capabilities via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-001",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and efficient Gemini model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
};

export function getModelsForProvider(provider: AIProvider): ModelMeta[] {
  return MODEL_CATALOG[provider] ?? [];
}

export function findModel(
  provider: AIProvider,
  modelId: string,
): ModelMeta | undefined {
  return MODEL_CATALOG[provider]?.find((m) => m.id === modelId);
}

export function isKnownModel(provider: AIProvider, modelId: string): boolean {
	return !!findModel(provider, modelId);
}

export function toCompositeModelId(
	provider: AIProvider,
	modelId: string,
): string {
	return `${provider}:${modelId}`;
}
