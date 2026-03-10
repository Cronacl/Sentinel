import type { AIProvider } from "@/server/db/enums";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tool_use"
  | "object_generation";

export type ModelAttachmentCapabilities = {
  supportsCodeTextFiles: boolean;
  supportsDocuments: boolean;
  supportsImages: boolean;
};

export type ModelMeta = {
  id: string;
  displayName: string;
  description: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  reasoning?: ReasoningConfig;
};

export const REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

type ReasoningConfig = {
  defaultEffort: ReasoningEffort;
  forceReasoning?: boolean;
  providerValueMap?: Partial<Record<ReasoningEffort, string>>;
  reasoningSummary?: "auto" | "concise" | "detailed";
  strategy:
    | "anthropic-effort"
    | "google-thinking-level"
    | "openai-reasoning-effort";
  supportedEfforts: readonly ReasoningEffort[];
};

const OPENAI_GPT_5_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "minimal",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

const OPENAI_GPT_5_1_REASONING_CONFIG: ReasoningConfig = {
  ...OPENAI_GPT_5_REASONING_CONFIG,
  providerValueMap: {
    minimal: "none",
  },
};

const OPENAI_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

const ANTHROPIC_EFFORT_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "anthropic-effort",
  supportedEfforts: ["low", "medium", "high"],
};

const GEMINI_3_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "high"],
};

const GEMINI_3_1_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "medium", "high"],
};

const GEMINI_3_FLASH_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  strategy: "google-thinking-level",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

export const MODEL_CATALOG: Record<AIProvider, ModelMeta[]> = {
  openai: [
    {
      id: "gpt-5.2-pro",
      displayName: "GPT-5.2 Pro",
      description: "Most capable GPT-5.2 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.2",
      displayName: "GPT-5.2",
      description: "Latest GPT-5.2 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.1",
      displayName: "GPT-5.1",
      description: "GPT-5.1 flagship model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_1_REASONING_CONFIG,
    },
    {
      id: "gpt-5.1-codex",
      displayName: "GPT-5.1 Codex",
      description: "Code-optimized GPT-5.1.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_1_REASONING_CONFIG,
    },
    {
      id: "gpt-5.1-codex-mini",
      displayName: "GPT-5.1 Codex Mini",
      description: "Compact code-optimized GPT-5.1.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_1_REASONING_CONFIG,
    },
    {
      id: "gpt-5-pro",
      displayName: "GPT-5 Pro",
      description: "High-performance GPT-5.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "gpt-5",
      displayName: "GPT-5",
      description: "GPT-5 flagship model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Compact GPT-5 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Fastest GPT-5 for simple tasks.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Code-optimized GPT-5.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "gpt-5-chat-latest",
      displayName: "GPT-5 Chat Latest",
      description: "Chat-optimized GPT-5 model.",
      capabilities: ["vision"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-5.1-chat-latest",
      displayName: "GPT-5.1 Chat Latest",
      description: "Chat-optimized GPT-5.1 model.",
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
      id: "o4",
      displayName: "o4",
      description: "High-intelligence reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "o4-mini",
      displayName: "o4 Mini",
      description: "Fast reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "o3",
      displayName: "o3",
      description: "Advanced reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "o3-mini",
      displayName: "o3 Mini",
      description: "Efficient reasoning model.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "o1",
      displayName: "o1",
      description: "First-generation reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_REASONING_CONFIG,
    },
    {
      id: "codex-mini-latest",
      displayName: "Codex Mini Latest",
      description: "Latest compact Codex model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  anthropic: [
    {
      id: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description: "Most capable Claude model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: ANTHROPIC_EFFORT_CONFIG,
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
      reasoning: ANTHROPIC_EFFORT_CONFIG,
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
      id: "claude-sonnet-4-5-20250929",
      displayName: "Claude Sonnet 4.5 (2025-09-29)",
      description: "Versioned Claude Sonnet 4.5 release.",
      capabilities: ["vision", "tool_use", "object_generation", "reasoning"],
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
    {
      id: "claude-4-sonnet-20250514",
      displayName: "Claude 4 Sonnet (2025-05-14)",
      description: "Versioned Claude 4 Sonnet release.",
      capabilities: ["vision", "tool_use", "object_generation", "reasoning"],
      contextWindow: 200_000,
    },
    {
      id: "claude-3-7-sonnet-latest",
      displayName: "Claude 3.7 Sonnet Latest",
      description: "Latest Claude 3.7 Sonnet model.",
      capabilities: ["vision", "tool_use", "object_generation", "reasoning"],
      contextWindow: 200_000,
    },
    {
      id: "claude-3-7-sonnet-20250219",
      displayName: "Claude 3.7 Sonnet",
      description: "Versioned Claude 3.7 Sonnet release.",
      capabilities: ["vision", "tool_use", "object_generation", "reasoning"],
      contextWindow: 200_000,
    },
    {
      id: "claude-3-5-sonnet-20241022",
      displayName: "Claude 3.5 Sonnet",
      description: "Versioned Claude 3.5 Sonnet model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-3-5-haiku-latest",
      displayName: "Claude 3.5 Haiku Latest",
      description: "Latest Claude 3.5 Haiku model.",
      capabilities: ["tool_use", "object_generation", "reasoning"],
      contextWindow: 200_000,
    },
    {
      id: "claude-3-5-haiku-20241022",
      displayName: "Claude 3.5 Haiku",
      description: "Versioned Claude 3.5 Haiku model.",
      capabilities: ["tool_use", "object_generation"],
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
      reasoning: GEMINI_3_PRO_REASONING_CONFIG,
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
      id: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash Lite",
      description: "Cost-effective Gemini 2.5 Flash Lite model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and versatile Gemini model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-001",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and efficient Gemini model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-lite",
      displayName: "Gemini 2.0 Flash Lite",
      description: "Lightweight Gemini 2.0 Flash variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-1.5-pro",
      displayName: "Gemini 1.5 Pro",
      description: "High-intelligence model with long context.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 2_000_000,
    },
    {
      id: "gemini-1.5-flash",
      displayName: "Gemini 1.5 Flash",
      description: "Fast Gemini 1.5 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
  ],
  google_vertex: [
    {
      id: "gemini-3-pro-preview",
      displayName: "Gemini 3 Pro Preview",
      description: "Next-gen Gemini preview model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_PRO_REASONING_CONFIG,
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
      id: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash Lite",
      description: "Cost-effective Gemini 2.5 Flash Lite via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and versatile Gemini model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-001",
      displayName: "Gemini 2.0 Flash",
      description: "Fast and efficient Gemini model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-exp",
      displayName: "Gemini 2.0 Flash Exp",
      description: "Experimental Gemini 2.0 Flash model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-2.0-flash-lite",
      displayName: "Gemini 2.0 Flash Lite",
      description: "Lightweight Gemini 2.0 Flash via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "gemini-1.5-pro",
      displayName: "Gemini 1.5 Pro",
      description: "High-intelligence model with long context via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 2_000_000,
    },
    {
      id: "gemini-1.5-flash",
      displayName: "Gemini 1.5 Flash",
      description: "Fast Gemini 1.5 model via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
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

function isOpenAIReasoningModel(modelId: string) {
  return modelId.startsWith("gpt-5") || /^o\d/.test(modelId);
}

function getCustomOpenAIReasoningConfig(
  modelId: string,
): ReasoningConfig | null {
  if (modelId.startsWith("gpt-5.1")) {
    return {
      ...OPENAI_GPT_5_1_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  if (modelId.startsWith("gpt-5")) {
    return {
      ...OPENAI_GPT_5_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  if (/^o\d/.test(modelId)) {
    return {
      ...OPENAI_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  return null;
}

function getProviderOptionsKey(provider: AIProvider) {
  switch (provider) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "google":
      return "google";
    case "google_vertex":
      return "vertex";
  }
}

function getCustomGoogleReasoningConfig(
  modelId: string,
): ReasoningConfig | null {
  if (/^gemini-3(?:\.1)?-flash/i.test(modelId)) {
    return GEMINI_3_FLASH_REASONING_CONFIG;
  }

  if (/^gemini-3\.1-pro/i.test(modelId)) {
    return GEMINI_3_1_PRO_REASONING_CONFIG;
  }

  if (/^gemini-3-pro/i.test(modelId)) {
    return GEMINI_3_PRO_REASONING_CONFIG;
  }

  return null;
}

function getReasoningConfig(
  provider: AIProvider,
  modelId: string,
): ReasoningConfig | null {
  const knownConfig = findModel(provider, modelId)?.reasoning;
  if (knownConfig) {
    return knownConfig;
  }

  if (provider === "openai" && isOpenAIReasoningModel(modelId)) {
    return getCustomOpenAIReasoningConfig(modelId);
  }

  if (provider === "google" || provider === "google_vertex") {
    return getCustomGoogleReasoningConfig(modelId);
  }

  return null;
}

export function getSupportedReasoningEfforts(
  provider: AIProvider,
  modelId: string,
): ReasoningEffort[] {
  return [...(getReasoningConfig(provider, modelId)?.supportedEfforts ?? [])];
}

export function supportsReasoningEffort(
  provider: AIProvider,
  modelId: string,
): boolean {
  return getSupportedReasoningEfforts(provider, modelId).length > 0;
}

export function getDefaultReasoningEffort(
  provider: AIProvider,
  modelId: string,
): ReasoningEffort | null {
  return getReasoningConfig(provider, modelId)?.defaultEffort ?? null;
}

export function getReasoningProviderOptions(
  provider: AIProvider,
  modelId: string,
  reasoningEffort?: ReasoningEffort | null,
): SharedV3ProviderOptions | undefined {
  const config = getReasoningConfig(provider, modelId);

  if (!reasoningEffort || !config) {
    return undefined;
  }

  if (!config.supportedEfforts.includes(reasoningEffort)) {
    return undefined;
  }

  const providerOptionsKey = getProviderOptionsKey(provider);
  const providerValue =
    config.providerValueMap?.[reasoningEffort] ?? reasoningEffort;

  if (config.strategy === "openai-reasoning-effort") {
    return {
      [providerOptionsKey]: {
        ...(config.forceReasoning ? { forceReasoning: true } : {}),
        reasoningEffort: providerValue,
        ...(config.reasoningSummary
          ? { reasoningSummary: config.reasoningSummary }
          : {}),
      },
    };
  }

  if (config.strategy === "anthropic-effort") {
    return {
      [providerOptionsKey]: {
        effort: reasoningEffort,
      },
    };
  }

  if (config.strategy === "google-thinking-level") {
    return {
      [providerOptionsKey]: {
        thinkingConfig: {
          thinkingLevel: reasoningEffort,
        },
      },
    };
  }

  return undefined;
}

export function getModelAttachmentCapabilities(
  provider: AIProvider,
  modelId: string,
): ModelAttachmentCapabilities {
  const capabilities = findModel(provider, modelId)?.capabilities ?? [];
  const supportsImages = capabilities.includes("vision");

  if (!supportsImages) {
    return {
      supportsCodeTextFiles: false,
      supportsDocuments: false,
      supportsImages: false,
    };
  }

  return {
    supportsCodeTextFiles: true,
    supportsDocuments: true,
    supportsImages: true,
  };
}
