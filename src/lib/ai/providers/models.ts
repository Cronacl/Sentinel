import type { AIProvider } from "@/server/db/enums";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tool_use"
  | "object_generation";

export type ModelAttachmentCapabilities = {
  supportsImages: boolean;
  supportsPdf: boolean;
  supportsTextFiles: boolean;
};

export type ModelMeta = {
  attachmentCapabilities?: ModelAttachmentCapabilities;
  id: string;
  displayName: string;
  description: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  reasoning?: ReasoningConfig;
};

export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

type ReasoningConfig = {
  defaultEffort: ReasoningEffort;
  forceReasoning?: boolean;
  providerOptionsMap?: Partial<
    Record<ReasoningEffort, SharedV3ProviderOptions>
  >;
  providerValueMap?: Partial<Record<ReasoningEffort, string>>;
  reasoningSummary?: "auto" | "concise" | "detailed";
  strategy:
    | "anthropic-effort"
    | "deepseek-thinking"
    | "google-thinking-level"
    | "openai-reasoning-effort";
  supportedEfforts: readonly ReasoningEffort[];
};

const OPENAI_LEGACY_GPT_5_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "minimal",
  providerValueMap: {
    minimal: "none",
  },
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

const OPENAI_GPT_5_1_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "none",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high"],
};

const OPENAI_FRONTIER_GPT_5_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "none",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high", "xhigh"],
};

const OPENAI_GPT_5_2_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["medium", "high", "xhigh"],
};

const OPENAI_GPT_5_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  reasoningSummary: "detailed",
  strategy: "openai-reasoning-effort",
  supportedEfforts: ["high"],
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

const GEMINI_2_5_FLASH_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "minimal",
  providerOptionsMap: {
    minimal: {
      google: { thinkingConfig: { thinkingBudget: 0 } },
    },
    low: {
      google: {
        thinkingConfig: { thinkingBudget: 256, includeThoughts: true },
      },
    },
    medium: {
      google: {
        thinkingConfig: { thinkingBudget: 1024, includeThoughts: true },
      },
    },
    high: {
      google: {
        thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
      },
    },
  },
  strategy: "google-thinking-level",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

const GEMINI_2_5_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  providerOptionsMap: {
    low: {
      google: {
        thinkingConfig: { thinkingBudget: 1024, includeThoughts: true },
      },
    },
    medium: {
      google: {
        thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
      },
    },
    high: {
      google: {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      },
    },
  },
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "medium", "high"],
};

const DEEPSEEK_REASONER_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  providerValueMap: {
    high: "enabled",
    none: "disabled",
  },
  strategy: "deepseek-thinking",
  supportedEfforts: ["none", "high"],
};

export const MODEL_CATALOG: Partial<Record<AIProvider, ModelMeta[]>> = {
  openai: [
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5",
      description: "Latest frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      description: "Frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.4-mini",
      displayName: "GPT-5.4 Mini",
      description: "Smaller frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.3-codex",
      displayName: "GPT-5.3 Codex",
      description: "Frontier Codex-optimized agentic coding model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.2-pro",
      displayName: "GPT-5.2 Pro",
      description: "Most capable GPT-5.2 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_2_PRO_REASONING_CONFIG,
    },
    {
      id: "gpt-5.2",
      displayName: "GPT-5.2",
      description: "Latest GPT-5.2 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
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
      reasoning: OPENAI_GPT_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gpt-5",
      displayName: "GPT-5",
      description: "GPT-5 flagship model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Compact GPT-5 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Fastest GPT-5 for simple tasks.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "Code-optimized GPT-5.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
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
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Most capable Gemini model with reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Fast model with thinking capabilities.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_FLASH_REASONING_CONFIG,
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
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Most capable Gemini model with reasoning via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Fast model with thinking capabilities via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_FLASH_REASONING_CONFIG,
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
  vercel: [
    {
      id: "openai/gpt-5",
      displayName: "GPT-5 (via Gateway)",
      description: "OpenAI GPT-5 through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "openai/gpt-5-mini",
      displayName: "GPT-5 Mini (via Gateway)",
      description: "Compact GPT-5 through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "anthropic/claude-sonnet-4-5",
      displayName: "Claude Sonnet 4.5 (via Gateway)",
      description: "Anthropic Claude Sonnet through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "anthropic/claude-haiku-4-5",
      displayName: "Claude Haiku 4.5 (via Gateway)",
      description: "Fast Claude model through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash (via Gateway)",
      description: "Google Gemini through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
  xai: [
    {
      id: "grok-4",
      displayName: "Grok 4",
      description: "Most capable Grok model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "grok-4-fast-reasoning",
      displayName: "Grok 4 Fast (Reasoning)",
      description: "Fast Grok 4 with reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "grok-4-fast-non-reasoning",
      displayName: "Grok 4 Fast",
      description: "Fast Grok 4 without reasoning.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "grok-3",
      displayName: "Grok 3",
      description: "Advanced Grok model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "grok-3-mini",
      displayName: "Grok 3 Mini",
      description: "Compact Grok model with reasoning.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  azure: [
    {
      id: "gpt-5",
      displayName: "GPT-5 (Azure)",
      description: "OpenAI GPT-5 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gpt-4.1",
      displayName: "GPT-4.1 (Azure)",
      description: "GPT-4.1 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "gpt-4.1-mini",
      displayName: "GPT-4.1 Mini (Azure)",
      description: "Compact GPT-4.1 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "gpt-4o",
      displayName: "GPT-4o (Azure)",
      description: "Fast multimodal model via Azure.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  amazon_bedrock: [
    {
      id: "anthropic.claude-sonnet-4-5-20250929-v1:0",
      displayName: "Claude Sonnet 4.5 (Bedrock)",
      description: "Anthropic Claude via Amazon Bedrock.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      displayName: "Claude 3.5 Sonnet v2 (Bedrock)",
      description: "Claude 3.5 Sonnet via Bedrock.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "anthropic.claude-3-haiku-20240307-v1:0",
      displayName: "Claude 3 Haiku (Bedrock)",
      description: "Fast Claude via Bedrock.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "us.amazon.nova-pro-v1:0",
      displayName: "Amazon Nova Pro",
      description: "Amazon's capable Nova model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 300_000,
    },
    {
      id: "us.amazon.nova-lite-v1:0",
      displayName: "Amazon Nova Lite",
      description: "Fast and cost-effective Nova model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 300_000,
    },
    {
      id: "meta.llama3-70b-instruct-v1:0",
      displayName: "Llama 3 70B (Bedrock)",
      description: "Meta Llama 3 via Bedrock.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 8_192,
    },
  ],
  groq: [
    {
      id: "llama-3.3-70b-versatile",
      displayName: "Llama 3.3 70B",
      description: "Versatile Llama 3.3 on Groq.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "llama-3.1-8b-instant",
      displayName: "Llama 3.1 8B Instant",
      description: "Ultra-fast small Llama model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "gemma2-9b-it",
      displayName: "Gemma 2 9B",
      description: "Google Gemma 2 on Groq.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 8_192,
    },
    {
      id: "mixtral-8x7b-32768",
      displayName: "Mixtral 8x7B",
      description: "Mistral's mixture-of-experts model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 32_768,
    },
    {
      id: "qwen-qwq-32b",
      displayName: "Qwen QWQ 32B",
      description: "Reasoning model from Alibaba.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  cohere: [
    {
      id: "command-a-03-2025",
      displayName: "Command A",
      description: "Latest Cohere flagship model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 256_000,
    },
    {
      id: "command-r-plus",
      displayName: "Command R+",
      description: "Capable Cohere model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "command-r",
      displayName: "Command R",
      description: "Balanced Cohere model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "command-r7b-12-2024",
      displayName: "Command R 7B",
      description: "Compact Cohere model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  moonshotai: [
    {
      id: "kimi-k2.5",
      displayName: "Kimi K2.5",
      description: "Latest Kimi model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "kimi-k2",
      displayName: "Kimi K2",
      description: "Capable Kimi model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "kimi-k2-thinking",
      displayName: "Kimi K2 Thinking",
      description: "Kimi reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "moonshot-v1-128k",
      displayName: "Moonshot V1 128K",
      description: "Long-context Moonshot model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "moonshot-v1-8k",
      displayName: "Moonshot V1 8K",
      description: "Fast Moonshot model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 8_192,
    },
  ],
  mistral: [
    {
      id: "mistral-large-latest",
      displayName: "Mistral Large",
      description: "Flagship model for complex reasoning and generation.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "mistral-medium-latest",
      displayName: "Mistral Medium",
      description: "Balanced model for general-purpose tasks.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "mistral-small-latest",
      displayName: "Mistral Small",
      description: "Cost-efficient model for lightweight tasks.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "pixtral-large-latest",
      displayName: "Pixtral Large",
      description: "Multimodal model with strong vision capabilities.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "magistral-medium-2507",
      displayName: "Magistral Medium",
      description: "Reasoning model with step-by-step thinking.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: {
        strategy: "openai-reasoning-effort",
        supportedEfforts: ["high"],
        defaultEffort: "high",
      },
    },
    {
      id: "magistral-small-2507",
      displayName: "Magistral Small",
      description:
        "Smaller reasoning model for efficient step-by-step thinking.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: {
        strategy: "openai-reasoning-effort",
        supportedEfforts: ["high"],
        defaultEffort: "high",
      },
    },
  ],
  ollama: [
    {
      id: "llama3.2",
      displayName: "Llama 3.2 (3B)",
      description: "Meta's compact model for fast local inference.",
      capabilities: ["tool_use"],
      contextWindow: 128_000,
    },
    {
      id: "llama3.2:1b",
      displayName: "Llama 3.2 (1B)",
      description: "Ultra-light model for resource-constrained environments.",
      capabilities: [],
      contextWindow: 128_000,
    },
    {
      id: "llama3.3",
      displayName: "Llama 3.3 (70B)",
      description: "Meta's large multilingual model with strong reasoning.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "qwen3:8b",
      displayName: "Qwen 3 (8B)",
      description: "Alibaba's hybrid reasoning model with thinking toggles.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "qwen3:4b",
      displayName: "Qwen 3 (4B)",
      description: "Compact Qwen 3 variant for efficient local use.",
      capabilities: ["reasoning", "tool_use"],
      contextWindow: 128_000,
    },
    {
      id: "gemma3",
      displayName: "Gemma 3 (4B)",
      description: "Google's lightweight open model.",
      capabilities: ["vision"],
      contextWindow: 128_000,
    },
    {
      id: "gemma3:12b",
      displayName: "Gemma 3 (12B)",
      description: "Google's mid-size multimodal open model.",
      capabilities: ["vision", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "mistral",
      displayName: "Mistral (7B)",
      description: "Mistral AI's efficient open-weight model.",
      capabilities: ["tool_use"],
      contextWindow: 32_768,
    },
    {
      id: "deepseek-r1:8b",
      displayName: "DeepSeek R1 (8B)",
      description: "DeepSeek reasoning model distilled for local use.",
      capabilities: ["reasoning"],
      contextWindow: 128_000,
    },
    {
      id: "phi4",
      displayName: "Phi-4 (14B)",
      description: "Microsoft's compact reasoning model.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 16_384,
    },
    {
      id: "codellama",
      displayName: "Code Llama (7B)",
      description: "Meta's code-specialized Llama variant.",
      capabilities: [],
      contextWindow: 16_384,
    },
  ],
  openrouter: [
    {
      id: "openai/gpt-5.2",
      displayName: "OpenAI GPT-5.2",
      description: "OpenAI flagship model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 256_000,
    },
    {
      id: "openai/gpt-4.1",
      displayName: "OpenAI GPT-4.1",
      description: "Fast and capable OpenAI model via OpenRouter.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_047_576,
    },
    {
      id: "anthropic/claude-sonnet-4",
      displayName: "Anthropic Claude Sonnet 4",
      description: "Anthropic's balanced model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "anthropic/claude-haiku-3.5",
      displayName: "Anthropic Claude 3.5 Haiku",
      description: "Fast and affordable Anthropic model via OpenRouter.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "google/gemini-2.5-pro",
      displayName: "Google Gemini 2.5 Pro",
      description: "Google's flagship reasoning model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "google/gemini-2.5-flash",
      displayName: "Google Gemini 2.5 Flash",
      description: "Google's fast model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "meta-llama/llama-4-maverick",
      displayName: "Meta Llama 4 Maverick",
      description: "Meta's latest open model via OpenRouter.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "mistralai/mistral-large",
      displayName: "Mistral Large",
      description: "Mistral's flagship model via OpenRouter.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "deepseek/deepseek-r1",
      displayName: "DeepSeek R1",
      description: "DeepSeek's reasoning model via OpenRouter.",
      capabilities: ["reasoning"],
      contextWindow: 163_840,
    },
    {
      id: "qwen/qwen3-235b-a22b",
      displayName: "Qwen 3 235B",
      description: "Alibaba's large MoE model via OpenRouter.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
  ],
  deepseek: [
    {
      id: "deepseek-chat",
      displayName: "DeepSeek Chat",
      description: "DeepSeek general-purpose chat model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 64_000,
    },
    {
      id: "deepseek-reasoner",
      displayName: "DeepSeek Reasoner",
      description: "DeepSeek reasoning model with thinking support.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 64_000,
      reasoning: DEEPSEEK_REASONER_CONFIG,
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

  if (modelId.startsWith("gpt-5.2-pro")) {
    return {
      ...OPENAI_GPT_5_2_PRO_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  if (modelId.startsWith("gpt-5-pro")) {
    return {
      ...OPENAI_GPT_5_PRO_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  if (
    modelId.startsWith("gpt-5.5") ||
    modelId.startsWith("gpt-5.4") ||
    modelId.startsWith("gpt-5.3") ||
    modelId.startsWith("gpt-5.2")
  ) {
    return {
      ...OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
      forceReasoning: true,
    };
  }

  if (modelId.startsWith("gpt-5")) {
    return {
      ...OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
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
      return "google";
    case "vercel":
      return "gateway";
    case "xai":
      return "xai";
    case "black_forest_labs":
      return "blackForestLabs";
    case "klingai":
      return "klingai";
    case "bytedance":
      return "bytedance";
    case "fal":
      return "fal";
    case "replicate":
      return "replicate";
    case "azure":
      return "openai";
    case "amazon_bedrock":
      return "bedrock";
    case "groq":
      return "groq";
    case "cohere":
      return "cohere";
    case "moonshotai":
      return "moonshotai";
    case "mistral":
      return "mistral";
    case "ollama":
      return "openai";
    case "openrouter":
      return "openai";
    case "deepseek":
      return "deepseek";
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
  const mappedProviderOptions = config.providerOptionsMap?.[reasoningEffort];

  if (mappedProviderOptions) {
    return mappedProviderOptions;
  }

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

  if (config.strategy === "deepseek-thinking") {
    return {
      [providerOptionsKey]: {
        thinking: {
          type: providerValue,
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
  const explicit = findModel(provider, modelId)?.attachmentCapabilities;
  if (explicit) {
    return explicit;
  }

  const FULL_NATIVE_ATTACHMENT_SUPPORT: ModelAttachmentCapabilities = {
    supportsImages: true,
    supportsPdf: true,
    supportsTextFiles: true,
  };
  const NO_NATIVE_ATTACHMENT_SUPPORT: ModelAttachmentCapabilities = {
    supportsImages: false,
    supportsPdf: false,
    supportsTextFiles: false,
  };

  const builtInNativeInputs: Partial<Record<AIProvider, Set<string>>> = {
    anthropic: new Set([
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-opus-4-5",
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-opus-4-1",
      "claude-opus-4-0",
      "claude-sonnet-4-0",
      "claude-4-sonnet-20250514",
      "claude-3-7-sonnet-latest",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
    ]),
    google: new Set([
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ]),
    google_vertex: new Set([
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ]),
    openai: new Set([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2-pro",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5.1-codex",
      "gpt-5.1-codex-mini",
      "gpt-5-pro",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-5-codex",
      "gpt-5-chat-latest",
      "gpt-5.1-chat-latest",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4o",
      "gpt-4o-mini",
      "o4",
      "o4-mini",
      "o3",
      "o1",
    ]),
  };

  const supportedModels = builtInNativeInputs[provider];
  return supportedModels?.has(modelId)
    ? FULL_NATIVE_ATTACHMENT_SUPPORT
    : NO_NATIVE_ATTACHMENT_SUPPORT;
}
