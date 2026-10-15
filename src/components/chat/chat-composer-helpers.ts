import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  DRIVER_CATALOG,
  listDefaultInstanceDrivers,
} from "@/lib/ai/chat/engines/catalog";
import type {
  ComposerEngineModel,
  ComposerEngineOption,
} from "@/lib/ai/chat/engines/composer-catalog";
import { isCommittedThreadActionError } from "@/hooks/use-thread-chat";

/** One engine instance in the composer (engines.composerCatalog). */
export type ChatComposerEngineOption = ComposerEngineOption;

/** A model of one engine instance, in the composer shape. */
export type ChatComposerModel = ComposerEngineModel;

const STABILITY_NOTICES = {
  beta: {
    description: "Beta integration; some features may be missing.",
    label: "Beta",
  },
  experimental: {
    description:
      "Experimental integration; behavior may change or fail unexpectedly.",
    label: "Unstable",
  },
} as const;

/**
 * The badge for an engine that is not stable yet (catalog stability).
 */
export function getEngineStabilityNotice(
  option: Pick<ChatComposerEngineOption, "stability"> | null | undefined,
) {
  return option && option.stability !== "stable"
    ? STABILITY_NOTICES[option.stability]
    : null;
}

/**
 * Offered before the first catalog arrives: every implemented driver's
 * default instance, assumed available until its snapshot says otherwise.
 */
export const FALLBACK_CHAT_ENGINE_OPTIONS: ChatComposerEngineOption[] =
  listDefaultInstanceDrivers().map((kind) => {
    const meta = DRIVER_CATALOG[kind];
    return {
      accentColor: null,
      description: meta.description,
      engine: kind,
      error: null,
      instanceId: kind,
      isAvailable: true,
      isDefaultInstance: true,
      label: meta.label,
      permissionModes: meta.capabilities.permissionModes,
      settlesUnattendedApprovals: meta.capabilities.supportsUnattendedTools,
      stability: meta.stability,
      supportsPlanMode: meta.capabilities.supportsPlanMode,
    };
  });

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
      option.instanceId === nextOption.instanceId &&
      option.accentColor === nextOption.accentColor &&
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
      model.instanceId === nextModel.instanceId &&
      model.modelId === nextModel.modelId &&
      model.provider === nextModel.provider &&
      model.rawModelId === nextModel.rawModelId
    );
  });
}

export function resolveStableSelectableModels(
  liveModels: ChatComposerModel[],
  cachedModels: ChatComposerModel[],
  options: { reuseCacheWhenLiveHasOnlyInactiveModels?: boolean } = {},
) {
  const selectableLiveModels = filterSelectableModels(liveModels);
  const shouldReuseCacheWhenInactive =
    options.reuseCacheWhenLiveHasOnlyInactiveModels ?? true;

  if (selectableLiveModels.length > 0) {
    return selectableLiveModels;
  }

  if (liveModels.length > 0 && !shouldReuseCacheWhenInactive) {
    return [];
  }

  return cachedModels;
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
