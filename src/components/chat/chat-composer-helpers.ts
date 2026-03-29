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

export function filterSelectableModels(models: ChatComposerModel[]) {
  return models.filter((model) => model.isConnected && model.isEnabled);
}

export function haveSameSelectableModelSet(
  currentModels: ChatComposerModel[],
  nextModels: ChatComposerModel[],
) {
  if (currentModels.length !== nextModels.length) {
    return false;
  }

  return currentModels.every((model, index) => {
    const nextModel = nextModels[index];

    return (
      nextModel != null &&
      model.engine === nextModel.engine &&
      model.modelId === nextModel.modelId &&
      model.provider === nextModel.provider &&
      model.rawModelId === nextModel.rawModelId
    );
  });
}

export function resolveStableSelectableModels(
  liveModels: ChatComposerModel[],
  cachedModels: ChatComposerModel[],
) {
  const selectableLiveModels = filterSelectableModels(liveModels);

  return selectableLiveModels.length > 0 ? selectableLiveModels : cachedModels;
}

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
