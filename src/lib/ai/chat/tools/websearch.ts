import { z } from "zod";

import { getErrorMessage } from "@/lib/errors";
import {
  clampRequestedResultCount,
  LIVECRAWL_MODE_VALUES,
  MAX_SEARCH_RESULT_COUNT,
  SEARCH_TYPE_VALUES,
  resolveSearchProviderOptions,
  type SearchSettings,
} from "@/lib/search";
import {
  executeExaSearch,
  __internal as exaInternal,
} from "@/lib/search/providers/exa/execute";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import {
  executeSearxngSearch,
  __internal as searxngInternal,
} from "@/lib/search/providers/searxng/execute";
import { SEARCH_PROVIDERS, type SearchProviderId } from "@/server/db/enums";

const DIGEST_MAX_ITEMS = 5;
const DIGEST_SNIPPET_MAX_CHARS = 280;

export const webSearchInputSchema = z.object({
  livecrawl: z.enum(LIVECRAWL_MODE_VALUES).optional(),
  provider: z.enum(SEARCH_PROVIDERS).optional(),
  query: z.string().min(1).describe("Search query to run on the web."),
  resultCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_RESULT_COUNT)
    .optional()
    .describe("Maximum number of search results to return."),
  searchType: z
    .enum(SEARCH_TYPE_VALUES)
    .optional()
    .describe("Search depth and speed mode."),
});

const webSearchResultSchema = z.object({
  author: z.string().nullable(),
  publishedDate: z.string().nullable(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  title: z.string().nullable(),
  url: z.string(),
});

export const webSearchOutputSchema = z.object({
  digest: z.string(),
  livecrawl: z.enum(LIVECRAWL_MODE_VALUES),
  provider: z.enum(SEARCH_PROVIDERS),
  query: z.string(),
  requestedResultCount: z.number().int().min(1),
  resolvedSearchType: z.enum(SEARCH_TYPE_VALUES),
  resultCount: z.number().int().min(0),
  results: z.array(webSearchResultSchema),
  searchType: z.enum(SEARCH_TYPE_VALUES),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

type WebSearchRuntime = {
  providers: SearchProviderRuntimeMap;
  settings: SearchSettings;
};

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function buildDigest({
  query,
  results,
}: {
  query: string;
  results: WebSearchOutput["results"];
}) {
  if (results.length === 0) {
    return `No search results were found for "${query}".`;
  }

  return results
    .slice(0, DIGEST_MAX_ITEMS)
    .map((result, index) => {
      const title = result.title?.trim() || getHostname(result.url);
      const summary = result.summary
        ? truncate(result.summary, DIGEST_SNIPPET_MAX_CHARS)
        : "No summary available.";

      return `${index + 1}. ${title} (${getHostname(result.url)})\n${summary}\n${result.url}`;
    })
    .join("\n\n");
}

function requireProvider(
  runtime: WebSearchRuntime,
  requestedProvider?: SearchProviderId,
) {
  const provider = requestedProvider ?? runtime.settings.defaultProvider;
  const runtimeEntry = runtime.providers[provider];

  if (!runtimeEntry) {
    throw new Error(
      `Search provider "${provider}" is not configured. Configure it in Settings > Search.`,
    );
  }

  if (!runtimeEntry.isEnabled) {
    throw new Error(
      `Search provider "${provider}" is disabled. Enable it in Settings > Search.`,
    );
  }

  return runtimeEntry;
}

export async function executeWebSearch({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: WebSearchInput;
  runtime: WebSearchRuntime;
}): Promise<WebSearchOutput> {
  const provider = input.provider ?? runtime.settings.defaultProvider;

  try {
    const query = input.query.trim();
    const runtimeEntry = requireProvider(runtime, provider);
    const requestedResultCount = clampRequestedResultCount(
      input.resultCount,
      runtime.settings,
    );
    const { livecrawl, searchType } = resolveSearchProviderOptions({
      defaultLivecrawl: runtimeEntry.settings.defaultLivecrawl,
      defaultSearchType: runtimeEntry.settings.defaultSearchType,
      provider: runtimeEntry.provider,
      requestedLivecrawl: input.livecrawl,
      requestedSearchType: input.searchType,
    });

    if (runtimeEntry.provider === "searxng") {
      const { results } = await executeSearxngSearch({
        abortSignal,
        baseURL: runtimeEntry.config.baseURL,
        query,
        requestedResultCount,
      });

      return {
        digest: buildDigest({ query, results }),
        livecrawl,
        provider: runtimeEntry.provider,
        query,
        requestedResultCount,
        resolvedSearchType: searchType,
        resultCount: results.length,
        results,
        searchType,
      };
    }

    const { resolvedSearchType, results } = await executeExaSearch({
      abortSignal,
      apiKey: (runtimeEntry.config as { apiKey: string }).apiKey,
      livecrawl,
      query,
      requestedResultCount,
      searchType,
    });

    return {
      digest: buildDigest({ query, results }),
      livecrawl,
      provider: runtimeEntry.provider,
      query,
      requestedResultCount,
      resolvedSearchType,
      resultCount: results.length,
      results,
      searchType,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export const __internal = {
  DIGEST_MAX_ITEMS,
  DIGEST_SNIPPET_MAX_CHARS,
  EXA_SEARCH_ENDPOINT: exaInternal.EXA_SEARCH_ENDPOINT,
  SEARXNG_ENGINES: searxngInternal.SEARXNG_ENGINES,
  SEARXNG_MAX_PAGES: searxngInternal.SEARXNG_MAX_PAGES,
  SEARXNG_RESULTS_PER_PAGE: searxngInternal.SEARXNG_RESULTS_PER_PAGE,
  SEARXNG_TIMEOUT_MS: searxngInternal.SEARXNG_TIMEOUT_MS,
  SUMMARY_MAX_CHARS: exaInternal.SUMMARY_MAX_CHARS,
  TEXT_MAX_CHARS: exaInternal.TEXT_MAX_CHARS,
};
