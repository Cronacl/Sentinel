import type { ReasoningEffort } from "@/lib/ai/providers/models";

/**
 * Codex model used when neither the request, the thread nor a live
 * `model/list` (its `isDefault` entry) names one. GPT-6 Astra is the Codex
 * flagship as of October 2026 (also t3code's DEFAULT_MODEL).
 */
export const CODEX_DEFAULT_MODEL_ID = "gpt-6-astra";

type CodexFallbackModel = {
  defaultReasoningEffort: ReasoningEffort;
  description: string;
  displayName: string;
  id: string;
  inputModalities: string[];
  isDefault: boolean;
  model: string;
  supportedReasoningEfforts: Array<{
    description: string;
    effort: ReasoningEffort;
    label: string;
  }>;
  supportsPersonality: boolean;
};

// GPT-6.1 Sol takes low/medium/high/xhigh plus `max` (absent from Sentinel's
// effort scale) and retired `none`/`minimal`; the fallback assumes the same
// for the family until a live `model/list` reports the real options.
const CODEX_FALLBACK_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

function buildFallbackModel(input: {
  description: string;
  displayName: string;
  id: string;
}): CodexFallbackModel {
  return {
    defaultReasoningEffort: "medium",
    description: input.description,
    displayName: input.displayName,
    id: input.id,
    inputModalities: ["text", "image"],
    isDefault: input.id === CODEX_DEFAULT_MODEL_ID,
    model: input.id,
    supportedReasoningEfforts: CODEX_FALLBACK_EFFORTS.map((effort) => ({
      description: `${input.displayName} supports ${effort} reasoning effort.`,
      effort,
      label: effort[0]!.toUpperCase() + effort.slice(1),
    })),
    supportsPersonality: false,
  };
}

/**
 * Models offered while the Codex runtime is detected but has not answered
 * `model/list` yet. The live list replaces these as soon as a probe succeeds.
 */
export const CODEX_FALLBACK_MODELS: readonly CodexFallbackModel[] =
  Object.freeze([
    buildFallbackModel({
      description: "Most capable Codex model for complex agentic coding.",
      displayName: "GPT-6 Astra",
      id: "gpt-6-astra",
    }),
    buildFallbackModel({
      description: "Near-Astra coding quality at a lower cost.",
      displayName: "GPT-6.1 Sol",
      id: "gpt-6.1-sol",
    }),
    buildFallbackModel({
      description: "Fast, low-cost model for lighter coding tasks.",
      displayName: "GPT-6 Luna",
      id: "gpt-6-luna",
    }),
  ]);
