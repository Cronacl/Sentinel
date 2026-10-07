import { getRetiredCompositeModelReplacement } from "@/lib/ai/providers/models";

/**
 * Finds the stored model selection in a model list. A built-in model that its
 * provider has retired selects its successor instead, so the composer does
 * not fall back to an unrelated first model.
 */
export function findPreferredModel<TModel extends { modelId: string }>(
  models: readonly TModel[],
  preferredModelId: string | null,
): TModel | undefined {
  if (!preferredModelId) {
    return undefined;
  }

  const exactMatch = models.find((model) => model.modelId === preferredModelId);
  if (exactMatch) {
    return exactMatch;
  }

  const replacement = getRetiredCompositeModelReplacement(preferredModelId);
  return replacement
    ? models.find((model) => model.modelId === replacement)
    : undefined;
}

export function getDefaultOpenCodeTraitValue(
  options: Array<{ isDefault?: boolean; value: string }> | undefined,
) {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    options.find((option) => option.isDefault)?.value ??
    options[0]?.value ??
    null
  );
}

export function resolveOpenCodeTraitSelectionValue(
  options: Array<{ isDefault?: boolean; value: string }> | undefined,
  currentValue: string | null,
  preferredValue: string | null,
) {
  if (!options || options.length === 0) {
    return null;
  }

  if (currentValue && options.some((option) => option.value === currentValue)) {
    return currentValue;
  }

  if (
    preferredValue &&
    options.some((option) => option.value === preferredValue)
  ) {
    return preferredValue;
  }

  return getDefaultOpenCodeTraitValue(options);
}
