import type { AIProvider } from "@/server/db/enums";

import { getRetiredCompositeModelReplacement } from "./models";

type ModelSelectionCandidate = {
  modelId: string;
  provider: AIProvider;
};

export function getCompositeModelId(provider: AIProvider, modelId: string) {
  return `${provider}:${modelId}`;
}

export function normalizeSelectedModelId(
  selectedModelId: string | null | undefined,
  availableModels: readonly ModelSelectionCandidate[],
) {
  if (!selectedModelId) {
    return null;
  }

  const trimmed = selectedModelId.trim();
  if (!trimmed) {
    return null;
  }

  const exactMatch = availableModels.find(
    (model) => getCompositeModelId(model.provider, model.modelId) === trimmed,
  );
  if (exactMatch) {
    return getCompositeModelId(exactMatch.provider, exactMatch.modelId);
  }

  if (trimmed.includes(":")) {
    // A stored built-in model that its provider has since retired selects
    // its successor when that model is available.
    const replacement = getRetiredCompositeModelReplacement(trimmed);
    const replacementMatch = replacement
      ? availableModels.find(
          (model) =>
            getCompositeModelId(model.provider, model.modelId) === replacement,
        )
      : undefined;

    return replacementMatch
      ? getCompositeModelId(replacementMatch.provider, replacementMatch.modelId)
      : null;
  }

  const byModelId = availableModels.filter(
    (model) => model.modelId === trimmed,
  );
  if (byModelId.length === 1) {
    const match = byModelId[0]!;
    return getCompositeModelId(match.provider, match.modelId);
  }

  return null;
}
