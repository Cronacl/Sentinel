export const SENTINEL_COMPOSER_TOOL_TAGS = ["browser", "computer"] as const;

export type SentinelComposerToolTag =
  (typeof SENTINEL_COMPOSER_TOOL_TAGS)[number];

const SENTINEL_COMPOSER_TOOL_TAG_SET = new Set<string>(
  SENTINEL_COMPOSER_TOOL_TAGS,
);

export function normalizeSentinelComposerToolTags(
  value: unknown,
): SentinelComposerToolTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: SentinelComposerToolTag[] = [];
  for (const entry of value) {
    if (
      typeof entry === "string" &&
      SENTINEL_COMPOSER_TOOL_TAG_SET.has(entry) &&
      !tags.includes(entry as SentinelComposerToolTag)
    ) {
      tags.push(entry as SentinelComposerToolTag);
    }
  }

  return tags;
}
