import type { AIProvider, ChatEngine } from "@/server/db/enums";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";

export type ChatComposerOpenCodeTraits = {
  agentOptions: Array<{
    isDefault?: boolean;
    label: string;
    value: string;
  }>;
  variantOptions: Array<{
    isDefault?: boolean;
    label: string;
    value: string;
  }>;
};

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
  openCode?: ChatComposerOpenCodeTraits;
  provider: AIProvider | null;
  rawModelId: string;
  supportedReasoningEfforts: ReasoningEffort[];
};

export const UNSTABLE_CHAT_ENGINE_LABEL = "Unstable";
export const UNSTABLE_CHAT_ENGINE_DESCRIPTION =
  "Experimental integration; behavior may change or fail unexpectedly.";

export function isUnstableChatEngine(_engine: ChatEngine | null | undefined) {
  return false;
}

function normalizeOpenCodeTraitToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchesOpenCodePlanTrait(option: { label: string; value: string }) {
  const normalizedLabel = normalizeOpenCodeTraitToken(option.label);
  const normalizedValue = normalizeOpenCodeTraitToken(option.value);

  return (
    normalizedLabel.includes("plan") ||
    normalizedValue.includes("plan") ||
    normalizedLabel.includes("max") ||
    normalizedValue.includes("max")
  );
}

function matchesOpenCodeBuildTrait(option: { label: string; value: string }) {
  const normalizedLabel = normalizeOpenCodeTraitToken(option.label);
  const normalizedValue = normalizeOpenCodeTraitToken(option.value);

  return (
    normalizedLabel.includes("build") ||
    normalizedValue.includes("build") ||
    normalizedLabel.includes("chat") ||
    normalizedValue.includes("chat") ||
    normalizedLabel.includes("default") ||
    normalizedValue.includes("default") ||
    normalizedLabel.includes("medium") ||
    normalizedValue.includes("medium") ||
    normalizedLabel.includes("high") ||
    normalizedValue.includes("high") ||
    normalizedLabel.includes("implement") ||
    normalizedValue.includes("implement")
  );
}

export function shouldHideOpenCodeTraitSelector(
  options:
    | Array<{ isDefault?: boolean; label: string; value: string }>
    | undefined,
) {
  if (!options || options.length < 2) {
    return false;
  }

  const hasPlanOption = options.some(matchesOpenCodePlanTrait);
  const hasBuildOption = options.some(matchesOpenCodeBuildTrait);
  const onlyContainsModeMappings = options.every(
    (option) =>
      matchesOpenCodePlanTrait(option) || matchesOpenCodeBuildTrait(option),
  );

  return hasPlanOption && hasBuildOption && onlyContainsModeMappings;
}

export function shouldHideOpenCodeAgentSelector(
  options:
    | Array<{ isDefault?: boolean; label: string; value: string }>
    | undefined,
) {
  return shouldHideOpenCodeTraitSelector(options);
}

export function resolveOpenCodeTraitValueForThreadMode(
  options:
    | Array<{ isDefault?: boolean; label: string; value: string }>
    | undefined,
  currentValue: string | null | undefined,
  threadMode: "chat" | "plan",
) {
  if (!options || options.length === 0) {
    return null;
  }

  const currentOption =
    (currentValue
      ? (options.find((option) => option.value === currentValue) ?? null)
      : null) ?? null;
  const fallbackOption =
    options.find((option) => option.isDefault) ?? options[0] ?? null;

  if (threadMode === "plan") {
    return (
      options.find(matchesOpenCodePlanTrait)?.value ??
      currentOption?.value ??
      fallbackOption?.value ??
      null
    );
  }

  if (currentOption && !matchesOpenCodePlanTrait(currentOption)) {
    return currentOption.value;
  }

  return (
    options.find(matchesOpenCodeBuildTrait)?.value ??
    fallbackOption?.value ??
    null
  );
}

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
  {
    engine: "cursor",
    error: null,
    isAvailable: true,
    label: "Cursor",
  },
  {
    engine: "opencode",
    error: null,
    isAvailable: true,
    label: "OpenCode",
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
  switch (effort) {
    case "none":
      return "None";
    case "minimal":
      return "Minimal";
    case "xhigh":
      return "Extra high";
    default:
      return effort.charAt(0).toUpperCase() + effort.slice(1);
  }
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
