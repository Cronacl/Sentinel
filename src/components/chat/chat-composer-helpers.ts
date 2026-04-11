import type { AIProvider, ChatEngine } from "@/server/db/enums";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";

export type ChatComposerEngineOption = {
  engine: ChatEngine;
  error: string | null;
  isAvailable: boolean;
  label: string;
};

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

export const FALLBACK_CHAT_ENGINE_OPTIONS: ChatComposerEngineOption[] = [
  {
    engine: "sentinel",
    error: null,
    isAvailable: true,
    label: "Sentinel",
  },
  {
    engine: "codex",
    error: null,
    isAvailable: true,
    label: "Codex",
  },
  {
    engine: "claude",
    error: null,
    isAvailable: true,
    label: "Claude",
  },
  {
    engine: "copilot",
    error: null,
    isAvailable: true,
    label: "Copilot",
  },
];

export function filterSelectableModels(models: ChatComposerModel[]) {
  return models.filter((model) => model.isConnected && model.isEnabled);
}

export function haveSameEngineOptionSet(
  currentOptions: ChatComposerEngineOption[],
  nextOptions: ChatComposerEngineOption[],
) {
  if (currentOptions.length !== nextOptions.length) {
    return false;
  }

  return currentOptions.every((option, index) => {
    const nextOption = nextOptions[index];

    return (
      nextOption != null &&
      option.engine === nextOption.engine &&
      option.error === nextOption.error &&
      option.isAvailable === nextOption.isAvailable &&
      option.label === nextOption.label
    );
  });
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

export function resolveStableEngineOptions(
  liveOptions: ChatComposerEngineOption[],
  cachedOptions: ChatComposerEngineOption[],
) {
  return liveOptions.length > 0 ? liveOptions : cachedOptions;
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

export function shouldClearComposerAfterSendError(error: unknown) {
  return isCommittedThreadActionError(error);
}

export function shouldClearComposerAfterSend(error?: unknown) {
  return error === undefined || shouldClearComposerAfterSendError(error);
}
