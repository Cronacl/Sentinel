import type { AIProvider, ChatEngine } from "@/server/db/enums";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

export type ChatComposerModel = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort | null;
  description: string;
  displayName: string;
  modelId: string;
  engine: ChatEngine;
  inputModalities: string[];
  isConnected: boolean;
  isEnabled: boolean;
  provider: AIProvider | null;
  rawModelId: string;
  supportedReasoningEfforts: ReasoningEffort[];
};

export function getReasoningEffortLabel(effort: ReasoningEffort) {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function resolveReasoningEffort(
  model: ChatComposerModel,
  preferredEffort?: ReasoningEffort | null,
) {
  const supportedEfforts = model.supportedReasoningEfforts;
  if (supportedEfforts.length === 0) {
    return null;
  }

  if (preferredEffort && supportedEfforts.includes(preferredEffort)) {
    return preferredEffort;
  }

  return model.defaultReasoningEffort;
}
