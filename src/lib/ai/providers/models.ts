import type { AIProvider } from "@/server/db/enums";
import type { ProviderOptions } from "@ai-sdk/provider-utils";

export type ModelCapability =
  "vision" | "reasoning" | "tool_use" | "object_generation";

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
  /**
   * Anthropic only: also request adaptive thinking with summarized output.
   * Opus 4.7 and later omit thinking text unless `display: "summarized"` is
   * set, and Opus 4.6 / Sonnet 4.6 only think when adaptive thinking is on.
   */
  anthropicAdaptiveThinking?: boolean;
  defaultEffort: ReasoningEffort;
  forceReasoning?: boolean;
  /**
   * Google only: return thought summaries alongside the thinking level.
   */
  includeThoughts?: boolean;
  providerOptionsMap?: Partial<Record<ReasoningEffort, ProviderOptions>>;
  providerValueMap?: Partial<Record<ReasoningEffort, string>>;
  reasoningSummary?: "auto" | "concise" | "detailed";
  /**
   * - `reasoning-effort`: `{ reasoningEffort }` under the provider key (OpenAI,
   *   xAI, Groq, Mistral and Moonshot all use this option name).
   * - `anthropic-effort`: `{ effort }`, plus adaptive thinking when enabled.
   * - `google-thinking-level`: `{ thinkingConfig: { thinkingLevel } }`.
   * - `thinking-toggle`: `{ thinking: { type } }` (Cohere, Kimi K2.6).
   */
  strategy:
    | "anthropic-effort"
    | "google-thinking-level"
    | "reasoning-effort"
    | "thinking-toggle";
  supportedEfforts: readonly ReasoningEffort[];
};

// REASONING_EFFORTS stops at `xhigh`; the `max` level that GPT-5.6/GPT-6,
// Claude Opus 4.6+, DeepSeek V4 and Kimi K3 accept is not exposed yet
// (widening the effort scale belongs to the engine platform phase). Where a
// model has no `xhigh` but does have `max`, `xhigh` maps to `max`, the same
// mapping the AI SDK applies to its top-level `reasoning: "xhigh"`.

// GPT-5 (Aug 2025): `minimal` is its lowest level; `none` arrived with 5.1.
const OPENAI_LEGACY_GPT_5_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "minimal",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

const OPENAI_GPT_5_1_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "none",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high"],
};

// GPT-5.2 and GPT-5.4 (incl. mini/nano): none (API default) through xhigh.
const OPENAI_FRONTIER_GPT_5_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "none",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high", "xhigh"],
};

// GPT-5.5: none through xhigh, but the API default is `medium`.
const OPENAI_GPT_5_5_REASONING_CONFIG: ReasoningConfig = {
  ...OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
  defaultEffort: "medium",
};

// Codex-tuned GPT-5.x models always reason: low through xhigh.
const OPENAI_CODEX_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
};

// GPT-5.6 Sol/Terra/Luna, GPT-6 Sol and GPT-6 Luna: none through max, with
// `medium` as the API default (OpenAI model pages; `@ai-sdk/openai`
// getOpenAILanguageModelCapabilities agrees for GPT-6).
const OPENAI_GPT_5_6_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high", "xhigh"],
};

// GPT-6 Astra and GPT-6.1 Sol always reason: low through max, no `none`.
const OPENAI_GPT_6_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
};

const OPENAI_GPT_5_PRO_FAMILY_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["medium", "high", "xhigh"],
};

const OPENAI_GPT_5_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["high"],
};

// o-series models accept low, medium and high (`minimal` is GPT-5 only).
const OPENAI_O_SERIES_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  reasoningSummary: "detailed",
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "medium", "high"],
};

// Claude Opus 4.5 takes `effort` but not adaptive thinking.
const ANTHROPIC_EFFORT_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "anthropic-effort",
  supportedEfforts: ["low", "medium", "high"],
};

// Claude Opus 4.6 / Sonnet 4.6: adaptive thinking; their top level is `max`
// (`xhigh` arrived with Opus 4.7).
const ANTHROPIC_ADAPTIVE_CONFIG: ReasoningConfig = {
  anthropicAdaptiveThinking: true,
  defaultEffort: "high",
  providerValueMap: {
    xhigh: "max",
  },
  strategy: "anthropic-effort",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
};

// Claude Opus 4.7+, Opus 5, Sonnet 5/5.5 and Fable 5/5.1: adaptive thinking
// with `xhigh`. The API default effort is `high`.
const ANTHROPIC_ADAPTIVE_XHIGH_CONFIG: ReasoningConfig = {
  anthropicAdaptiveThinking: true,
  defaultEffort: "high",
  strategy: "anthropic-effort",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
};

// Claude Opus 5.5 defaults to `medium` effort (one level below Opus 5).
const ANTHROPIC_OPUS_5_5_CONFIG: ReasoningConfig = {
  ...ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
  defaultEffort: "medium",
};

// Thinking levels and defaults per https://ai.google.dev/gemini-api/docs/thinking.
const GEMINI_3_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  includeThoughts: true,
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "high"],
};

const GEMINI_3_1_PRO_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  includeThoughts: true,
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "medium", "high"],
};

// Gemini 3 Flash (preview): all four levels, `high` by default.
const GEMINI_3_0_FLASH_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  includeThoughts: true,
  strategy: "google-thinking-level",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

// Gemini 3.5 Flash and 3.6 Flash: all four levels, `medium` by default.
const GEMINI_3_FLASH_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  includeThoughts: true,
  strategy: "google-thinking-level",
  supportedEfforts: ["minimal", "low", "medium", "high"],
};

// Gemini 3.7 Flash and later dropped the `minimal` level.
const GEMINI_3_7_FLASH_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  includeThoughts: true,
  strategy: "google-thinking-level",
  supportedEfforts: ["low", "medium", "high"],
};

const GEMINI_FLASH_LITE_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "minimal",
  includeThoughts: true,
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

// Grok 4.5, 4.6 and 4.7: low through xhigh, `high` by default
// (https://docs.x.ai/developers/models model pages). The grok-4.20 reasoning
// models reject the parameter, so they get no config.
const XAI_GROK_4_5_PLUS_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "medium", "high", "xhigh"],
};

// Grok 4.3: none through xhigh, `low` by default.
const XAI_GROK_4_3_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "low",
  strategy: "reasoning-effort",
  supportedEfforts: ["none", "low", "medium", "high", "xhigh"],
};

// DeepSeek V4: thinking on by default; `reasoningEffort` is low | high | max
// (`high` by default).
const DEEPSEEK_V4_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  providerOptionsMap: {
    none: { deepseek: { thinking: { type: "disabled" } } },
    low: {
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "low" },
    },
    high: {
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "high" },
    },
    xhigh: {
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "max" },
    },
  },
  strategy: "thinking-toggle",
  supportedEfforts: ["none", "low", "high", "xhigh"],
};

// Kimi K3 always reasons; `reasoningEffort` is low | high | max and the API
// default is `max`.
const KIMI_K3_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "xhigh",
  providerValueMap: {
    xhigh: "max",
  },
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "high", "xhigh"],
};

const THINKING_TOGGLE_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  providerValueMap: {
    high: "enabled",
    none: "disabled",
  },
  strategy: "thinking-toggle",
  supportedEfforts: ["none", "high"],
};

// Mistral's adjustable reasoning only accepts `high` and `none`.
const MISTRAL_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "high",
  strategy: "reasoning-effort",
  supportedEfforts: ["none", "high"],
};

const GROQ_GPT_OSS_REASONING_CONFIG: ReasoningConfig = {
  defaultEffort: "medium",
  strategy: "reasoning-effort",
  supportedEfforts: ["low", "medium", "high"],
};

// Catalog order matters: the first entry of each provider is the model new
// threads fall back to, so every list starts with the current flagship
// (Ollama keeps a small local default instead). Context windows are the
// provider's documented limits; for OpenAI models they are the maximum
// prompt size (272K of the 400K window, 922K of the 1.05M window), because
// compaction must trigger before that cap. Retired ids live in
// RETIRED_MODEL_REPLACEMENTS below, not here.
export const MODEL_CATALOG: Partial<Record<AIProvider, ModelMeta[]>> = {
  openai: [
    {
      id: "gpt-6-astra",
      displayName: "GPT-6 Astra",
      description:
        "Most capable OpenAI model for complex reasoning, coding and computer use.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_6_REASONING_CONFIG,
    },
    {
      id: "gpt-6.1-sol",
      displayName: "GPT-6.1 Sol",
      description: "Balances GPT-6 performance with cost for everyday work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_6_REASONING_CONFIG,
    },
    {
      id: "gpt-6-sol",
      displayName: "GPT-6 Sol",
      description: "GPT-6 reasoning model for coding and agentic workflows.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_6_REASONING_CONFIG,
    },
    {
      id: "gpt-6-luna",
      displayName: "GPT-6 Luna",
      description: "Most efficient GPT-6 model for focused, high-volume tasks.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_6_REASONING_CONFIG,
    },
    {
      id: "gpt-5.6-sol",
      displayName: "GPT-5.6 Sol",
      description: "Flagship GPT-5.6 model for long-horizon agentic work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_6_REASONING_CONFIG,
    },
    {
      id: "gpt-5.6-terra",
      displayName: "GPT-5.6 Terra",
      description: "Balanced GPT-5.6 model for everyday work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_6_REASONING_CONFIG,
    },
    {
      id: "gpt-5.6-luna",
      displayName: "GPT-5.6 Luna",
      description: "Lowest-cost GPT-5.6 model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_6_REASONING_CONFIG,
    },
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5",
      description: "Frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_GPT_5_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.4",
      displayName: "GPT-5.4",
      description: "Frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 922_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.4-mini",
      displayName: "GPT-5.4 Mini",
      description: "Smaller frontier agentic coding model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.4-nano",
      displayName: "GPT-5.4 Nano",
      description:
        "Fastest GPT-5.4 model (OpenAI retires it on 2027-04-01; use GPT-6 Luna).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.3-codex",
      displayName: "GPT-5.3 Codex",
      description:
        "Codex-optimized coding model (OpenAI retires it on 2027-04-01).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_CODEX_REASONING_CONFIG,
    },
    {
      id: "gpt-5.2-pro",
      displayName: "GPT-5.2 Pro",
      description: "Most capable GPT-5.2 variant.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_GPT_5_PRO_FAMILY_REASONING_CONFIG,
    },
    {
      id: "gpt-5.2",
      displayName: "GPT-5.2",
      description: "Previous flagship model for professional work.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_FRONTIER_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5.1",
      displayName: "GPT-5.1",
      description: "GPT-5.1 model (OpenAI retires it on 2027-04-01).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_GPT_5_1_REASONING_CONFIG,
    },
    {
      id: "gpt-5-pro",
      displayName: "GPT-5 Pro",
      description: "High-performance GPT-5 (OpenAI retires it on 2026-12-11).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
      reasoning: OPENAI_GPT_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gpt-5",
      displayName: "GPT-5",
      description: "GPT-5 model (OpenAI retires it on 2026-12-11).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-mini",
      displayName: "GPT-5 Mini",
      description: "Compact GPT-5 variant (OpenAI retires it on 2026-12-11).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
    },
    {
      id: "gpt-5-nano",
      displayName: "GPT-5 Nano",
      description: "Fastest GPT-5 (OpenAI retires it on 2026-12-11).",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
      reasoning: OPENAI_LEGACY_GPT_5_REASONING_CONFIG,
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
      id: "o3",
      displayName: "o3",
      description: "Reasoning model (OpenAI retires it on 2026-12-11).",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: OPENAI_O_SERIES_REASONING_CONFIG,
    },
  ],
  anthropic: [
    {
      id: "claude-opus-5-5",
      displayName: "Claude Opus 5.5",
      description:
        "Anthropic's default model for agentic coding and knowledge work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_OPUS_5_5_CONFIG,
    },
    {
      id: "claude-sonnet-5-5",
      displayName: "Claude Sonnet 5.5",
      description: "Fast, capable Sonnet for everyday coding and agent work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-fable-5-1",
      displayName: "Claude Fable 5.1",
      description:
        "Anthropic's most capable model for the hardest long-horizon work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      description: "Fastest and most cost-effective Claude model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-opus-5",
      displayName: "Claude Opus 5",
      description: "Previous Opus for complex agentic coding.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-sonnet-5",
      displayName: "Claude Sonnet 5",
      description: "Previous Sonnet with near-Opus coding quality.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-fable-5",
      displayName: "Claude Fable 5",
      description: "Previous Fable release.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-opus-4-8",
      displayName: "Claude Opus 4.8",
      description: "Most capable Opus 4 model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-opus-4-7",
      displayName: "Claude Opus 4.7",
      description: "Opus 4.7 for long-horizon agentic work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_XHIGH_CONFIG,
    },
    {
      id: "claude-opus-4-6",
      displayName: "Claude Opus 4.6",
      description: "Opus 4.6 with adaptive thinking.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_CONFIG,
    },
    {
      id: "claude-sonnet-4-6",
      displayName: "Claude Sonnet 4.6",
      description: "Sonnet 4.6 with adaptive thinking.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: ANTHROPIC_ADAPTIVE_CONFIG,
    },
    {
      id: "claude-opus-4-5",
      displayName: "Claude Opus 4.5",
      description: "Legacy Opus 4.5 model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
      reasoning: ANTHROPIC_EFFORT_CONFIG,
    },
    {
      id: "claude-sonnet-4-5",
      displayName: "Claude Sonnet 4.5",
      description: "Legacy Sonnet 4.5 model.",
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
      id: "claude-opus-4-0",
      displayName: "Claude Opus 4",
      description: "Deprecated first-gen Opus 4 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "claude-sonnet-4-0",
      displayName: "Claude Sonnet 4",
      description: "Deprecated first-gen Sonnet 4 model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
  ],
  google: [
    {
      id: "gemini-3.8-flash",
      displayName: "Gemini 3.8 Flash",
      description: "Google's most intelligent Flash model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_7_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.1-pro-preview",
      displayName: "Gemini 3.1 Pro Preview",
      description: "Gemini Pro for complex reasoning and agentic work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_1_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-3.7-flash",
      displayName: "Gemini 3.7 Flash",
      description: "Flash model for complex coding and agentic workflows.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_7_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.6-flash",
      displayName: "Gemini 3.6 Flash",
      description: "Flash model balancing speed and multimodal input.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.5-flash",
      displayName: "Gemini 3.5 Flash",
      description: "Previous Gemini 3.5 Flash model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.5-flash-lite",
      displayName: "Gemini 3.5 Flash-Lite",
      description: "Cost-effective, high-throughput Flash-Lite model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_FLASH_LITE_REASONING_CONFIG,
    },
    {
      id: "gemini-3-flash-preview",
      displayName: "Gemini 3 Flash Preview",
      description: "Gemini 3 Flash preview model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_0_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Legacy Gemini 2.5 Pro with thinking budgets.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Legacy Gemini 2.5 Flash with thinking budgets.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash-Lite",
      description: "Legacy Gemini 2.5 Flash-Lite model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
  google_vertex: [
    {
      id: "gemini-3.8-flash",
      displayName: "Gemini 3.8 Flash",
      description: "Google's most intelligent Flash model via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_7_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.1-pro-preview",
      displayName: "Gemini 3.1 Pro Preview",
      description: "Gemini Pro for complex reasoning via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_1_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-3.7-flash",
      displayName: "Gemini 3.7 Flash",
      description: "Flash model for coding and agents via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_7_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.6-flash",
      displayName: "Gemini 3.6 Flash",
      description: "Flash model balancing speed and multimodal input.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.5-flash",
      displayName: "Gemini 3.5 Flash",
      description: "Previous Gemini 3.5 Flash model via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-3.5-flash-lite",
      displayName: "Gemini 3.5 Flash-Lite",
      description: "Cost-effective Flash-Lite model via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_FLASH_LITE_REASONING_CONFIG,
    },
    {
      id: "gemini-3-flash-preview",
      displayName: "Gemini 3 Flash Preview",
      description: "Gemini 3 Flash preview model via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_3_0_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Gemini 2.5 Pro with thinking budgets via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_PRO_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description: "Gemini 2.5 Flash with thinking budgets via Vertex AI.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: GEMINI_2_5_FLASH_REASONING_CONFIG,
    },
    {
      id: "gemini-2.5-flash-lite",
      displayName: "Gemini 2.5 Flash-Lite",
      description: "Cost-effective Gemini 2.5 Flash-Lite via Vertex AI.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
  // AI Gateway ids use dotted versions (`anthropic/claude-opus-5.5`) and
  // `spacexai/` for Grok (https://ai-gateway.vercel.sh/v1/models).
  vercel: [
    {
      id: "anthropic/claude-opus-5.5",
      displayName: "Claude Opus 5.5 (via Gateway)",
      description: "Anthropic Claude Opus 5.5 through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "openai/gpt-6-astra",
      displayName: "GPT-6 Astra (via Gateway)",
      description: "OpenAI GPT-6 Astra through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
    },
    {
      id: "google/gemini-3.8-flash",
      displayName: "Gemini 3.8 Flash (via Gateway)",
      description: "Google Gemini 3.8 Flash through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "anthropic/claude-sonnet-5.5",
      displayName: "Claude Sonnet 5.5 (via Gateway)",
      description: "Anthropic Claude Sonnet 5.5 through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "openai/gpt-6.1-sol",
      displayName: "GPT-6.1 Sol (via Gateway)",
      description: "OpenAI GPT-6.1 Sol through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
    },
    {
      id: "spacexai/grok-4.7",
      displayName: "Grok 4.7 (via Gateway)",
      description: "xAI Grok 4.7 through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 500_000,
    },
    {
      id: "google/gemini-3.5-flash-lite",
      displayName: "Gemini 3.5 Flash-Lite (via Gateway)",
      description: "Fast, low-cost Gemini model through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "anthropic/claude-haiku-4.5",
      displayName: "Claude Haiku 4.5 (via Gateway)",
      description: "Fast Claude model through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "openai/gpt-5.5",
      displayName: "GPT-5.5 (via Gateway)",
      description: "OpenAI GPT-5.5 through Vercel AI Gateway.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
    },
    {
      id: "anthropic/claude-sonnet-4.5",
      displayName: "Claude Sonnet 4.5 (via Gateway)",
      description: "Legacy Claude Sonnet 4.5 through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "openai/gpt-5",
      displayName: "GPT-5 (via Gateway)",
      description: "OpenAI GPT-5 through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
    },
    {
      id: "openai/gpt-5-mini",
      displayName: "GPT-5 Mini (via Gateway)",
      description: "Compact GPT-5 through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
    },
    {
      id: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash (via Gateway)",
      description: "Google Gemini 2.5 Flash through Vercel AI Gateway.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
  ],
  xai: [
    {
      id: "grok-4.7",
      displayName: "Grok 4.7",
      description: "Most capable Grok model for coding and knowledge work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 500_000,
      reasoning: XAI_GROK_4_5_PLUS_REASONING_CONFIG,
    },
    {
      id: "grok-4.6",
      displayName: "Grok 4.6",
      description: "Previous Grok reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 500_000,
      reasoning: XAI_GROK_4_5_PLUS_REASONING_CONFIG,
    },
    {
      id: "grok-4.5",
      displayName: "Grok 4.5",
      description: "Grok 4.5 reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 500_000,
      reasoning: XAI_GROK_4_5_PLUS_REASONING_CONFIG,
    },
    {
      id: "grok-4.3",
      displayName: "Grok 4.3",
      description: "Long-context Grok model with optional reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: XAI_GROK_4_3_REASONING_CONFIG,
    },
    {
      id: "grok-4.20-reasoning",
      displayName: "Grok 4.20 (Reasoning)",
      description: "Grok 4.20 with built-in reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "grok-4.20-non-reasoning",
      displayName: "Grok 4.20",
      description: "Fast Grok 4.20 without reasoning.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
  ],
  // Azure model ids are deployment names; these match the default names.
  azure: [
    {
      id: "gpt-5.5",
      displayName: "GPT-5.5 (Azure)",
      description: "OpenAI GPT-5.5 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 922_000,
    },
    {
      id: "gpt-5.4-mini",
      displayName: "GPT-5.4 Mini (Azure)",
      description: "Compact GPT-5.4 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
    },
    {
      id: "gpt-5",
      displayName: "GPT-5 (Azure)",
      description: "OpenAI GPT-5 via Azure deployment.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 272_000,
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
  // Current Claude models on Bedrock need a cross-region inference profile
  // (`us.` prefix) for on-demand use.
  amazon_bedrock: [
    {
      id: "us.anthropic.claude-opus-5-5",
      displayName: "Claude Opus 5.5 (Bedrock)",
      description: "Anthropic Claude Opus 5.5 via Amazon Bedrock.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "us.anthropic.claude-sonnet-5-5",
      displayName: "Claude Sonnet 5.5 (Bedrock)",
      description: "Anthropic Claude Sonnet 5.5 via Amazon Bedrock.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      displayName: "Claude Haiku 4.5 (Bedrock)",
      description: "Fast Claude via Amazon Bedrock.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "anthropic.claude-sonnet-4-5-20250929-v1:0",
      displayName: "Claude Sonnet 4.5 (Bedrock)",
      description: "Legacy Claude Sonnet 4.5 via Amazon Bedrock.",
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
      id: "openai/gpt-oss-120b",
      displayName: "GPT-OSS 120B",
      description: "OpenAI's open-weight reasoning model on Groq.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 131_072,
      reasoning: GROQ_GPT_OSS_REASONING_CONFIG,
    },
    {
      id: "llama-3.3-70b-versatile",
      displayName: "Llama 3.3 70B",
      description: "Versatile Llama 3.3 on Groq.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 131_072,
    },
    {
      id: "openai/gpt-oss-20b",
      displayName: "GPT-OSS 20B",
      description: "Compact open-weight reasoning model on Groq.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 131_072,
      reasoning: GROQ_GPT_OSS_REASONING_CONFIG,
    },
    {
      id: "llama-3.1-8b-instant",
      displayName: "Llama 3.1 8B Instant",
      description: "Ultra-fast small Llama model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 131_072,
    },
  ],
  cohere: [
    {
      id: "command-a-plus-05-2026",
      displayName: "Command A Plus",
      description: "Cohere's flagship multimodal reasoning model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "command-a-reasoning-08-2025",
      displayName: "Command A Reasoning",
      description: "Command A with step-by-step thinking.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 256_000,
      reasoning: THINKING_TOGGLE_CONFIG,
    },
    {
      id: "command-a-03-2025",
      displayName: "Command A",
      description: "Cohere Command A for agentic enterprise tasks.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 256_000,
    },
    {
      id: "command-a-vision-07-2025",
      displayName: "Command A Vision",
      description: "Command A with image understanding.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "command-r-plus-08-2024",
      displayName: "Command R+",
      description: "Capable Command R+ model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "command-r-08-2024",
      displayName: "Command R",
      description: "Balanced Command R model.",
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
      id: "kimi-k3",
      displayName: "Kimi K3",
      description:
        "Kimi's flagship for long-horizon coding and knowledge work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
      reasoning: KIMI_K3_REASONING_CONFIG,
    },
    {
      id: "kimi-k2.7-code",
      displayName: "Kimi K2.7 Code",
      description: "Kimi coding model with always-on thinking.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
    },
    {
      id: "kimi-k2.7-code-highspeed",
      displayName: "Kimi K2.7 Code Highspeed",
      description: "Faster Kimi K2.7 Code variant.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
    },
    {
      id: "kimi-k2.6",
      displayName: "Kimi K2.6",
      description: "Kimi K2.6 with optional thinking.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
      reasoning: THINKING_TOGGLE_CONFIG,
    },
  ],
  // `-latest` aliases follow Mistral's current release of each tier
  // (Large 4, Medium 3.5, Small 4 as of October 2026).
  mistral: [
    {
      id: "mistral-large-latest",
      displayName: "Mistral Large",
      description: "Mistral's multimodal flagship with adjustable reasoning.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 524_288,
      reasoning: MISTRAL_REASONING_CONFIG,
    },
    {
      id: "mistral-medium-latest",
      displayName: "Mistral Medium",
      description: "Multimodal model for agentic and coding work.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
      reasoning: MISTRAL_REASONING_CONFIG,
    },
    {
      id: "mistral-small-latest",
      displayName: "Mistral Small",
      description: "Efficient hybrid instruct, reasoning and coding model.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
      reasoning: MISTRAL_REASONING_CONFIG,
    },
    {
      id: "codestral-latest",
      displayName: "Codestral",
      description: "Mistral's code generation model.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 256_000,
    },
    {
      id: "ministral-14b-latest",
      displayName: "Ministral 14B",
      description: "Compact vision-capable Mistral model.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 262_144,
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
      id: "gemma4",
      displayName: "Gemma 4",
      description: "Google's multimodal open model with thinking and tools.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "qwen3.5",
      displayName: "Qwen 3.5",
      description: "Alibaba's multimodal model with thinking and tools.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 262_144,
    },
    {
      id: "gpt-oss:20b",
      displayName: "GPT-OSS (20B)",
      description: "OpenAI's open-weight reasoning model for local use.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
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
  // OpenRouter ids use dotted versions (`anthropic/claude-opus-5.5`) and
  // `x-ai/` for Grok (https://openrouter.ai/api/v1/models).
  openrouter: [
    {
      id: "anthropic/claude-opus-5.5",
      displayName: "Anthropic Claude Opus 5.5",
      description: "Anthropic's default model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "openai/gpt-6-astra",
      displayName: "OpenAI GPT-6 Astra",
      description: "OpenAI's most capable model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 922_000,
    },
    {
      id: "google/gemini-3.8-flash",
      displayName: "Google Gemini 3.8 Flash",
      description: "Google's most intelligent Flash model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "anthropic/claude-sonnet-5.5",
      displayName: "Anthropic Claude Sonnet 5.5",
      description: "Anthropic's balanced model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
    },
    {
      id: "x-ai/grok-4.7",
      displayName: "xAI Grok 4.7",
      description: "xAI's most capable Grok model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 500_000,
    },
    {
      id: "deepseek/deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      description: "DeepSeek's flagship reasoning model via OpenRouter.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "moonshotai/kimi-k3",
      displayName: "Kimi K3",
      description: "Moonshot's flagship Kimi model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "google/gemini-3.5-flash-lite",
      displayName: "Google Gemini 3.5 Flash-Lite",
      description: "Fast, low-cost Gemini model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "anthropic/claude-haiku-4.5",
      displayName: "Anthropic Claude Haiku 4.5",
      description: "Fast and affordable Anthropic model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "openai/gpt-5.2",
      displayName: "OpenAI GPT-5.2",
      description: "OpenAI GPT-5.2 via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 272_000,
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
      description: "Anthropic's previous balanced model via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 200_000,
    },
    {
      id: "google/gemini-2.5-pro",
      displayName: "Google Gemini 2.5 Pro",
      description: "Google's Gemini 2.5 Pro via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "google/gemini-2.5-flash",
      displayName: "Google Gemini 2.5 Flash",
      description: "Google's Gemini 2.5 Flash via OpenRouter.",
      capabilities: ["vision", "reasoning", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "meta-llama/llama-4-maverick",
      displayName: "Meta Llama 4 Maverick",
      description: "Meta's open model via OpenRouter.",
      capabilities: ["vision", "tool_use", "object_generation"],
      contextWindow: 1_048_576,
    },
    {
      id: "mistralai/mistral-large",
      displayName: "Mistral Large",
      description: "Mistral's flagship model via OpenRouter.",
      capabilities: ["tool_use", "object_generation"],
      contextWindow: 128_000,
    },
    {
      id: "deepseek/deepseek-r1",
      displayName: "DeepSeek R1",
      description: "DeepSeek's first reasoning model via OpenRouter.",
      capabilities: ["reasoning"],
      contextWindow: 64_000,
    },
    {
      id: "qwen/qwen3-235b-a22b",
      displayName: "Qwen 3 235B",
      description: "Alibaba's large MoE model via OpenRouter.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 131_072,
    },
  ],
  deepseek: [
    {
      id: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      description: "DeepSeek's flagship model with thinking mode.",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: DEEPSEEK_V4_REASONING_CONFIG,
    },
    {
      id: "deepseek-flash",
      displayName: "DeepSeek Flash",
      description: "Fast DeepSeek model (the current V4.x Flash release).",
      capabilities: ["reasoning", "tool_use", "object_generation"],
      contextWindow: 1_000_000,
      reasoning: DEEPSEEK_V4_REASONING_CONFIG,
    },
  ],
};

/**
 * Built-in model ids that providers have retired, renamed or that were never
 * valid, mapped to the model the provider recommends instead (or to the same
 * model under its current id). Threads, defaults and automations that still
 * store one of these ids resolve to the replacement instead of failing at the
 * provider. These ids are deliberately not listed in MODEL_CATALOG, so a user
 * can still add one back as a custom model, for example against an endpoint
 * that keeps serving it; an id the user has available is never replaced.
 */
const RETIRED_MODEL_REPLACEMENTS: Partial<
  Record<AIProvider, Readonly<Record<string, string>>>
> = {
  // https://developers.openai.com/api/docs/deprecations
  openai: {
    // Shut down 2026-07-23 (codex-mini-latest on 2026-02-12).
    "gpt-5-codex": "gpt-5.6-sol",
    "gpt-5.1-codex": "gpt-5.6-sol",
    "gpt-5.1-codex-mini": "gpt-5.6-terra",
    "codex-mini-latest": "gpt-5.6-terra",
    "gpt-5-chat-latest": "gpt-5.6-sol",
    "gpt-5.1-chat-latest": "gpt-5.6-sol",
    // Shut down 2026-10-23.
    "gpt-4.1-nano": "gpt-5.6-luna",
    o1: "gpt-5.6-sol",
    "o3-mini": "gpt-5.6-sol",
    "o4-mini": "gpt-5.6-terra",
    // Never an API model.
    o4: "gpt-5.6-sol",
  },
  // https://platform.claude.com/docs/en/about-claude/model-deprecations
  anthropic: {
    // Retired 2026-08-05.
    "claude-opus-4-1": "claude-opus-5-5",
    // Retired 2026-02-19 (Claude 3.5 Sonnet on 2025-10-28).
    "claude-3-7-sonnet-latest": "claude-sonnet-5-5",
    "claude-3-7-sonnet-20250219": "claude-sonnet-5-5",
    "claude-3-5-sonnet-20241022": "claude-sonnet-5-5",
    "claude-3-5-haiku-latest": "claude-haiku-4-5",
    "claude-3-5-haiku-20241022": "claude-haiku-4-5",
    // Malformed id (the dated Sonnet 4 id is claude-sonnet-4-20250514).
    "claude-4-sonnet-20250514": "claude-sonnet-4-0",
  },
  // https://ai.google.dev/gemini-api/docs/deprecations
  google: {
    "gemini-3-pro-preview": "gemini-3.1-pro-preview",
    "gemini-2.0-flash": "gemini-3.6-flash",
    "gemini-2.0-flash-001": "gemini-3.6-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-1.5-pro": "gemini-3.1-pro-preview",
    "gemini-1.5-flash": "gemini-3.6-flash",
  },
  google_vertex: {
    "gemini-3-pro-preview": "gemini-3.1-pro-preview",
    "gemini-2.0-flash": "gemini-3.6-flash",
    "gemini-2.0-flash-001": "gemini-3.6-flash",
    "gemini-2.0-flash-exp": "gemini-3.6-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-1.5-pro": "gemini-3.1-pro-preview",
    "gemini-1.5-flash": "gemini-3.6-flash",
  },
  vercel: {
    // Same models under the Gateway's canonical dotted ids.
    "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  },
  // https://docs.x.ai/docs/models
  xai: {
    "grok-4": "grok-4.7",
    "grok-4-fast-reasoning": "grok-4.20-reasoning",
    "grok-4-fast-non-reasoning": "grok-4.20-non-reasoning",
    "grok-3": "grok-4.3",
    "grok-3-mini": "grok-4.3",
  },
  amazon_bedrock: {
    "anthropic.claude-3-5-sonnet-20241022-v2:0":
      "us.anthropic.claude-sonnet-5-5",
    "anthropic.claude-3-haiku-20240307-v1:0":
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  },
  // https://console.groq.com/docs/deprecations
  groq: {
    "gemma2-9b-it": "llama-3.1-8b-instant",
    "mixtral-8x7b-32768": "llama-3.3-70b-versatile",
    "qwen-qwq-32b": "openai/gpt-oss-120b",
  },
  cohere: {
    // Deprecated 2025-09-15 together with the unversioned aliases.
    "command-r-plus": "command-r-plus-08-2024",
    "command-r": "command-r-08-2024",
  },
  // https://platform.kimi.ai/docs/models (discontinued models).
  moonshotai: {
    "kimi-k2.5": "kimi-k3",
    "kimi-k2": "kimi-k3",
    "kimi-k2-thinking": "kimi-k3",
    "moonshot-v1-128k": "kimi-k3",
    "moonshot-v1-8k": "kimi-k3",
  },
  // https://docs.mistral.ai/getting-started/models/models_overview/
  mistral: {
    // Pixtral Large retired 2026-05-31, Magistral 2026-07-31.
    "pixtral-large-latest": "mistral-large-latest",
    "magistral-medium-2507": "mistral-medium-latest",
    "magistral-small-2507": "mistral-small-latest",
  },
  openrouter: {
    // Malformed id; Claude 3.5 Haiku itself is retired.
    "anthropic/claude-haiku-3.5": "anthropic/claude-haiku-4.5",
  },
  // https://api-docs.deepseek.com/updates
  deepseek: {
    // DeepSeek discontinued both aliases on 2026-07-24.
    "deepseek-chat": "deepseek-flash",
    "deepseek-reasoner": "deepseek-flash",
  },
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

/**
 * Returns the replacement of a retired built-in model id, or null when the id
 * is not a retired built-in model.
 */
export function getRetiredModelReplacement(
  provider: AIProvider,
  modelId: string,
): string | null {
  const replacements = RETIRED_MODEL_REPLACEMENTS[provider];
  return replacements && Object.hasOwn(replacements, modelId)
    ? replacements[modelId]!
    : null;
}

/**
 * Same as getRetiredModelReplacement for a composite `provider:model` id.
 * Ids of other engines (no known provider prefix) return null.
 */
export function getRetiredCompositeModelReplacement(
  compositeId: string,
): string | null {
  const separatorIndex = compositeId.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const provider = compositeId.slice(0, separatorIndex);
  if (!Object.hasOwn(RETIRED_MODEL_REPLACEMENTS, provider)) {
    return null;
  }

  const replacement = getRetiredModelReplacement(
    provider as AIProvider,
    compositeId.slice(separatorIndex + 1),
  );
  return replacement
    ? toCompositeModelId(provider as AIProvider, replacement)
    : null;
}

/**
 * Keeps a stored composite model id when it is still available, otherwise
 * upgrades a retired built-in id to its replacement. Ids that are neither
 * available nor retired are returned unchanged so callers keep their own
 * fallback behavior.
 */
export function resolveStoredCompositeModelId(
  compositeId: string,
  availableCompositeIds: ReadonlySet<string>,
): string {
  if (availableCompositeIds.has(compositeId)) {
    return compositeId;
  }

  return getRetiredCompositeModelReplacement(compositeId) ?? compositeId;
}

export function toCompositeModelId(
  provider: AIProvider,
  modelId: string,
): string {
  return `${provider}:${modelId}`;
}

function isOpenAIReasoningModel(modelId: string) {
  return (
    /^gpt-(?:[5-9]|\d{2,})(?:[.-]|$)/.test(modelId) || /^o\d/.test(modelId)
  );
}

function getCustomOpenAIReasoningConfig(
  modelId: string,
): ReasoningConfig | null {
  const config = getOpenAIReasoningConfigForId(modelId);
  return config ? { ...config, forceReasoning: true } : null;
}

function getOpenAIReasoningConfigForId(
  modelId: string,
): ReasoningConfig | null {
  const gptMajor = /^gpt-(\d+)/.exec(modelId);
  const major = gptMajor ? Number(gptMajor[1]) : null;

  // GPT-6 Sol and Luna (and their dated snapshots) can turn reasoning off.
  if (/^gpt-6-(?:sol|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(modelId)) {
    return OPENAI_GPT_5_6_REASONING_CONFIG;
  }

  if (major !== null && major >= 6) {
    return OPENAI_GPT_6_REASONING_CONFIG;
  }

  if (/^gpt-5(?:\.\d+)?-pro(?:-|$)/.test(modelId)) {
    return modelId.startsWith("gpt-5-pro")
      ? OPENAI_GPT_5_PRO_REASONING_CONFIG
      : OPENAI_GPT_5_PRO_FAMILY_REASONING_CONFIG;
  }

  if (/^gpt-5(?:\.\d+)?-codex/.test(modelId)) {
    return OPENAI_CODEX_REASONING_CONFIG;
  }

  if (modelId.startsWith("gpt-5.6")) {
    return OPENAI_GPT_5_6_REASONING_CONFIG;
  }

  if (modelId.startsWith("gpt-5.5")) {
    return OPENAI_GPT_5_5_REASONING_CONFIG;
  }

  if (
    modelId.startsWith("gpt-5.4") ||
    modelId.startsWith("gpt-5.3") ||
    modelId.startsWith("gpt-5.2")
  ) {
    return OPENAI_FRONTIER_GPT_5_REASONING_CONFIG;
  }

  if (modelId.startsWith("gpt-5.1")) {
    return OPENAI_GPT_5_1_REASONING_CONFIG;
  }

  if (modelId.startsWith("gpt-5")) {
    return OPENAI_LEGACY_GPT_5_REASONING_CONFIG;
  }

  if (/^o\d/.test(modelId)) {
    return OPENAI_O_SERIES_REASONING_CONFIG;
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
      return "openrouter";
    case "deepseek":
      return "deepseek";
  }
}

/**
 * Thinking levels for custom Gemini ids, by family and version
 * (https://ai.google.dev/gemini-api/docs/thinking).
 */
function getCustomGoogleReasoningConfig(
  modelId: string,
): ReasoningConfig | null {
  const match = /^gemini-(\d+)(?:\.(\d+))?-(pro|flash)(-lite)?(?:-|$)/i.exec(
    modelId,
  );
  if (!match) {
    return null;
  }

  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  const family = match[3]!.toLowerCase();
  const isLite = Boolean(match[4]);

  if (major < 3) {
    return null;
  }

  if (family === "pro") {
    return major === 3 && minor === 0
      ? GEMINI_3_PRO_REASONING_CONFIG
      : GEMINI_3_1_PRO_REASONING_CONFIG;
  }

  if (isLite) {
    return GEMINI_FLASH_LITE_REASONING_CONFIG;
  }

  if (major === 3 && minor === 0) {
    return GEMINI_3_0_FLASH_REASONING_CONFIG;
  }

  return major > 3 || minor >= 7
    ? GEMINI_3_7_FLASH_REASONING_CONFIG
    : GEMINI_3_FLASH_REASONING_CONFIG;
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

/**
 * The least reasoning a model accepts (`none` where it can switch reasoning
 * off), for quick helper calls such as titles and tool routing.
 */
export function getLowestReasoningEffort(
  provider: AIProvider,
  modelId: string,
): ReasoningEffort | null {
  const supportedEfforts = getSupportedReasoningEfforts(provider, modelId);
  return (
    REASONING_EFFORTS.find((effort) => supportedEfforts.includes(effort)) ??
    null
  );
}

export function getReasoningProviderOptions(
  provider: AIProvider,
  modelId: string,
  reasoningEffort?: ReasoningEffort | null,
): ProviderOptions | undefined {
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

  if (config.strategy === "reasoning-effort") {
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
        effort: providerValue,
        ...(config.anthropicAdaptiveThinking
          ? { thinking: { type: "adaptive", display: "summarized" } }
          : {}),
      },
    };
  }

  if (config.strategy === "google-thinking-level") {
    return {
      [providerOptionsKey]: {
        thinkingConfig: {
          thinkingLevel: providerValue,
          ...(config.includeThoughts ? { includeThoughts: true } : {}),
        },
      },
    };
  }

  if (config.strategy === "thinking-toggle") {
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

// Providers whose AI SDK adapters accept images, PDFs and text files as
// native message parts. Any vision-capable built-in model of these providers
// gets native attachments; everything else (including custom ids) falls back
// to Sentinel's extracted-text attachments.
const NATIVE_ATTACHMENT_PROVIDERS = new Set<AIProvider>([
  "anthropic",
  "google",
  "google_vertex",
  "openai",
]);

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

export function getModelAttachmentCapabilities(
  provider: AIProvider,
  modelId: string,
): ModelAttachmentCapabilities {
  const model = findModel(provider, modelId);
  if (model?.attachmentCapabilities) {
    return model.attachmentCapabilities;
  }

  return model &&
    NATIVE_ATTACHMENT_PROVIDERS.has(provider) &&
    model.capabilities.includes("vision")
    ? FULL_NATIVE_ATTACHMENT_SUPPORT
    : NO_NATIVE_ATTACHMENT_SUPPORT;
}
