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
