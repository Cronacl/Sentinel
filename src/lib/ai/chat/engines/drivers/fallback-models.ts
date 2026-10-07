import { CODEX_FALLBACK_MODELS } from "@/lib/ai/chat/engines/codex-app-server/models";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

// Models offered while a runtime is installed but has not reported its own
// list yet (the probe timed out with nothing cached). The model manifest
// (P11) replaces these with versioned catalog entries.

type FallbackEffort = {
  description: string;
  effort: ReasoningEffort;
  label: string;
};

function effortOptions(
  modelName: string,
  efforts: readonly ReasoningEffort[],
): FallbackEffort[] {
  return efforts.map((effort) => ({
    description: `${modelName} supports ${effort} reasoning effort.`,
    effort,
    label: effort[0]!.toUpperCase() + effort.slice(1),
  }));
}

export function buildFallbackCodexModels() {
  return CODEX_FALLBACK_MODELS.map((model) => ({
    ...model,
    inputModalities: [...model.inputModalities],
    supportedReasoningEfforts: model.supportedReasoningEfforts.map(
      (option) => ({ ...option }),
    ),
  }));
}

export function buildFallbackCopilotModels() {
  return [
    {
      contextWindow: undefined,
      defaultReasoningEffort: "medium" as const,
      description: "Default GitHub Copilot coding model.",
      displayName: "GPT-4.1",
      id: "gpt-4.1-preview",
      inputModalities: ["text"] as string[],
      isDefault: true,
      model: "gpt-4.1-preview",
      supportedReasoningEfforts: effortOptions("GPT-4.1", [
        "low",
        "medium",
        "high",
      ]),
    },
  ];
}

export function buildFallbackCursorModels() {
  return [
    {
      contextWindow: undefined,
      defaultReasoningEffort: "medium" as const,
      description: "Default Cursor Agent model.",
      displayName: "Auto",
      id: "default",
      inputModalities: ["text"] as string[],
      isDefault: true,
      model: "default",
      supportedReasoningEfforts: effortOptions("Cursor Auto", [
        "low",
        "medium",
        "high",
      ]),
    },
  ];
}

export function buildFallbackOpenCodeModels() {
  return [
    {
      contextWindow: undefined,
      defaultReasoningEffort: null,
      description: "Default OpenCode model selection.",
      displayName: "OpenCode Auto",
      id: "opencode/default",
      inputModalities: ["text"] as string[],
      isDefault: true,
      model: "opencode/default",
      openCode: {
        agentOptions: [],
        variantOptions: [],
      },
      supportedReasoningEfforts: [] as [],
    },
  ];
}
