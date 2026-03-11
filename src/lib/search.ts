import type { SearchProviderId } from "@/server/db/enums";

export const SEARCH_TYPE_VALUES = ["auto", "fast", "deep"] as const;
export type SearchType = (typeof SEARCH_TYPE_VALUES)[number];

export const LIVECRAWL_MODE_VALUES = ["never", "preferred", "always"] as const;
export type LivecrawlMode = (typeof LIVECRAWL_MODE_VALUES)[number];

export const DEFAULT_SEARCH_PROVIDER: SearchProviderId = "exa";
export const DEFAULT_SEARCH_RESULT_COUNT = 5;
export const DEFAULT_SEARCH_MAX_RESULT_COUNT = 10;
export const MAX_SEARCH_RESULT_COUNT = 25;
export const MIN_SEARCH_RESULT_COUNT = 1;
export const DEFAULT_EXA_SEARCH_TYPE: SearchType = "auto";
export const DEFAULT_EXA_LIVECRAWL_MODE: LivecrawlMode = "preferred";

export type SearchSettings = {
  defaultProvider: SearchProviderId;
  defaultResultCount: number;
  maxResultCount: number;
};

export function resolveSearchProviderOptions({
  defaultLivecrawl,
  defaultSearchType,
  provider,
  requestedLivecrawl,
  requestedSearchType,
}: {
  defaultLivecrawl: LivecrawlMode;
  defaultSearchType: SearchType;
  provider: SearchProviderId;
  requestedLivecrawl?: LivecrawlMode | null;
  requestedSearchType?: SearchType | null;
}) {
  if (provider === "searxng") {
    return {
      livecrawl: "preferred" as const,
      searchType: "auto" as const,
    };
  }

  return {
    livecrawl: requestedLivecrawl ?? defaultLivecrawl,
    searchType: requestedSearchType ?? defaultSearchType,
  };
}

export function normalizeSearchResultCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_RESULT_COUNT;
  }

  return Math.min(
    MAX_SEARCH_RESULT_COUNT,
    Math.max(MIN_SEARCH_RESULT_COUNT, Math.floor(value)),
  );
}

export function normalizeSearchMaxResultCount(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_MAX_RESULT_COUNT;
  }

  return Math.min(
    MAX_SEARCH_RESULT_COUNT,
    Math.max(MIN_SEARCH_RESULT_COUNT, Math.floor(value)),
  );
}

export function normalizeSearchSettings(
  value:
    | Partial<SearchSettings>
    | {
        defaultProvider?: SearchProviderId | null;
        defaultResultCount?: number | null;
        maxResultCount?: number | null;
      }
    | null
    | undefined,
): SearchSettings {
  const candidate = (value ?? {}) as {
    defaultProvider?: SearchProviderId | null;
    defaultResultCount?: number | null;
    maxResultCount?: number | null;
  };

  const maxResultCount = normalizeSearchMaxResultCount(
    candidate.maxResultCount,
  );
  const defaultResultCount = Math.min(
    maxResultCount,
    normalizeSearchResultCount(candidate.defaultResultCount),
  );

  return {
    defaultProvider: candidate.defaultProvider ?? DEFAULT_SEARCH_PROVIDER,
    defaultResultCount,
    maxResultCount,
  };
}

export function clampRequestedResultCount(
  requestedResultCount: number | null | undefined,
  settings: SearchSettings,
) {
  const normalized =
    typeof requestedResultCount === "number" &&
    Number.isFinite(requestedResultCount)
      ? Math.floor(requestedResultCount)
      : settings.defaultResultCount;

  return Math.min(
    settings.maxResultCount,
    Math.max(MIN_SEARCH_RESULT_COUNT, normalized),
  );
}
