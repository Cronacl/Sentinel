import { z } from "zod";

import {
  clampRequestedResultCount,
  LIVECRAWL_MODE_VALUES,
  MAX_SEARCH_RESULT_COUNT,
  SEARCH_TYPE_VALUES,
  resolveSearchProviderOptions,
  type LivecrawlMode,
  type SearchSettings,
  type SearchType,
} from "@/lib/search";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import { SEARCH_PROVIDERS, type SearchProviderId } from "@/server/db/enums";

const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";
const SEARXNG_RESULTS_PER_PAGE = 10;
const SEARXNG_MAX_PAGES = 5;
const SUMMARY_MAX_CHARS = 1_200;
const TEXT_MAX_CHARS = 1_800;
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
type WebSearchResultItem = WebSearchOutput["results"][number];

type WebSearchRuntime = {
  providers: SearchProviderRuntimeMap;
  settings: SearchSettings;
};

type ExaResult = {
  author?: unknown;
  highlights?: unknown;
  publishedDate?: unknown;
  score?: unknown;
  summary?: unknown;
  text?: unknown;
  title?: unknown;
  url?: unknown;
};

type SearxngResult = {
  content?: unknown;
  date?: unknown;
  favicon?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
  title?: unknown;
  url?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

function normalizeUrlForDedup(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "");

    const params = new URLSearchParams(parsed.searchParams);
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
      "ref",
    ].forEach((param) => params.delete(param));
    parsed.search = params.toString() ? `?${params.toString()}` : "";

    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

function resolveSearxngResultUrl(url: string, baseURL: string) {
  try {
    return new URL(url, baseURL).toString();
  } catch {
    return url;
  }
}

function buildSnippet(result: ExaResult) {
  const summary = normalizeText(result.summary);
  if (summary) {
    return truncate(summary, SUMMARY_MAX_CHARS);
  }

  const highlights = Array.isArray(result.highlights)
    ? result.highlights
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .join(" ")
    : "";
  if (highlights) {
    return truncate(highlights, SUMMARY_MAX_CHARS);
  }

  const text = normalizeText(result.text);
  if (text) {
    return truncate(text, TEXT_MAX_CHARS);
  }

  return null;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

function normalizeExaResults(results: unknown) {
  if (!Array.isArray(results)) {
    return [] as WebSearchResultItem[];
  }

  const normalizedResults: WebSearchResultItem[] = [];

  for (const result of results) {
    const candidate = result as ExaResult;
    const url = normalizeText(candidate.url);

    if (!url) {
      continue;
    }

    normalizedResults.push({
      author: normalizeText(candidate.author) || null,
      publishedDate: normalizeText(candidate.publishedDate) || null,
      score:
        typeof candidate.score === "number" && Number.isFinite(candidate.score)
          ? candidate.score
          : null,
      summary: buildSnippet(candidate),
      title: normalizeText(candidate.title) || null,
      url,
    });
  }

  return normalizedResults;
}

async function executeExaSearch({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: WebSearchInput;
  runtime: WebSearchRuntime;
}) {
  const provider = requireProvider(runtime, input.provider);
  if (provider.provider !== "exa") {
    throw new Error('Search provider "exa" is not configured correctly.');
  }
  const requestedResultCount = clampRequestedResultCount(
    input.resultCount,
    runtime.settings,
  );
  const { livecrawl, searchType } = resolveSearchProviderOptions({
    defaultLivecrawl: provider.settings.defaultLivecrawl,
    defaultSearchType: provider.settings.defaultSearchType,
    provider: provider.provider,
    requestedLivecrawl: input.livecrawl,
    requestedSearchType: input.searchType,
  });

  const response = await fetch(EXA_SEARCH_ENDPOINT, {
    body: JSON.stringify({
      contents: {
        livecrawl,
        summary: {
          maxCharacters: SUMMARY_MAX_CHARS,
          query: input.query,
        },
        text: {
          maxCharacters: TEXT_MAX_CHARS,
        },
      },
      numResults: requestedResultCount,
      query: input.query,
      type: searchType,
    }),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "sentinel-websearch",
      "x-api-key": provider.config.apiKey,
    },
    method: "POST",
    signal: abortSignal,
  });

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      normalizeText(payload?.error) ||
      normalizeText(payload?.message) ||
      `Exa search failed with status ${response.status}.`;
    throw new Error(message);
  }

  const results = normalizeExaResults(payload?.results);
  const resolvedSearchType =
    typeof payload?.resolvedSearchType === "string" &&
    SEARCH_TYPE_VALUES.includes(payload.resolvedSearchType as SearchType)
      ? (payload.resolvedSearchType as SearchType)
      : searchType;

  return {
    digest: buildDigest({
      query: input.query,
      results,
    }),
    livecrawl,
    provider: provider.provider,
    query: input.query,
    requestedResultCount,
    resolvedSearchType,
    resultCount: results.length,
    results,
    searchType,
  } satisfies WebSearchOutput;
}

function normalizeSearxngResults(results: unknown, baseURL: string) {
  if (!Array.isArray(results)) {
    return [] as WebSearchResultItem[];
  }

  const normalizedResults: WebSearchResultItem[] = [];

  for (const result of results) {
    const candidate = result as SearxngResult;
    const url = normalizeText(candidate.url);

    if (!url) {
      continue;
    }

    const content = normalizeText(candidate.content);
    const publishedDate =
      normalizeText(candidate.publishedDate) ||
      normalizeText(candidate.published_date) ||
      normalizeText(candidate.date) ||
      null;

    normalizedResults.push({
      author: null,
      publishedDate,
      score: null,
      summary: content ? truncate(content, SUMMARY_MAX_CHARS) : null,
      title: normalizeText(candidate.title) || null,
      url: resolveSearxngResultUrl(url, baseURL),
    });
  }

  return normalizedResults;
}

function buildSearxngSearchUrl({
  baseURL,
  endpoint,
  lenient,
  page,
  query,
}: {
  baseURL: string;
  endpoint: "root" | "search";
  lenient: boolean;
  page: number;
  query: string;
}) {
  const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const url =
    endpoint === "root"
      ? new URL(normalizedBaseURL)
      : new URL("search", normalizedBaseURL);

  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("pageno", String(Math.max(page, 1)));

  if (lenient) {
    url.searchParams.set("language", "all");
    url.searchParams.set("time_range", "year");
  }

  return url;
}

function computeSearxngScore({
  index,
  query,
  result,
  total,
}: {
  index: number;
  query: string;
  result: WebSearchResultItem;
  total: number;
}) {
  const base = 75 - (index / Math.max(total, 1)) * 25;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);

  const title = String(result.title || "").toLowerCase();
  const summary = String(result.summary || "").toLowerCase();
  const termBoost = terms.reduce((score, term) => {
    let nextScore = score;
    if (title.includes(term)) {
      nextScore += 8;
    }
    if (summary.includes(term)) {
      nextScore += 3;
    }
    return nextScore;
  }, 0);

  let domainBoost = 0;
  try {
    const hostname = new URL(result.url).hostname.replace(/^www\./, "");
    const preferredDomains: Record<string, number> = {
      "arxiv.org": 10,
      "developer.mozilla.org": 12,
      "docs.anthropic.com": 12,
      "docs.github.com": 12,
      "docs.python.org": 12,
      "github.com": 10,
      "learn.microsoft.com": 12,
      "nextjs.org": 10,
      "openai.com": 12,
      "stackoverflow.com": 12,
      "vercel.com": 10,
      "wikipedia.org": 10,
    };

    for (const [domain, boost] of Object.entries(preferredDomains)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        domainBoost = Math.max(domainBoost, boost);
      }
    }
  } catch {
    domainBoost = 0;
  }

  let recencyBoost = 0;
  if (result.publishedDate) {
    const date = new Date(result.publishedDate);
    if (!Number.isNaN(date.valueOf())) {
      const days = (Date.now() - date.valueOf()) / (1000 * 60 * 60 * 24);
      if (days < 30) {
        recencyBoost = 10;
      } else if (days < 365) {
        recencyBoost = 5;
      }
    }
  }

  return Math.max(0, Math.round(base + termBoost + domainBoost + recencyBoost));
}

function filterAndRankSearxngResults({
  query,
  results,
}: {
  query: string;
  results: WebSearchResultItem[];
}) {
  const dedupedResults: WebSearchResultItem[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const normalizedUrl = normalizeUrlForDedup(result.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    dedupedResults.push({
      ...result,
      score: null,
      url: normalizedUrl,
    });
  }

  return dedupedResults
    .map((result, index, allResults) => ({
      ...result,
      score: computeSearxngScore({
        index,
        query,
        result,
        total: allResults.length,
      }),
    }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
}

async function fetchSearxngResults({
  abortSignal,
  baseURL,
  endpoint,
  lenient,
  query,
  requestedResultCount,
}: {
  abortSignal?: AbortSignal;
  baseURL: string;
  endpoint: "root" | "search";
  lenient: boolean;
  query: string;
  requestedResultCount: number;
}) {
  const maxPages = Math.min(
    SEARXNG_MAX_PAGES,
    Math.max(
      1,
      Math.ceil((requestedResultCount * 2) / SEARXNG_RESULTS_PER_PAGE),
    ),
  );
  const collectedResults: WebSearchResultItem[] = [];
  let lastPayload: Record<string, unknown> | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildSearxngSearchUrl({
      baseURL,
      endpoint,
      lenient,
      page,
      query,
    });
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "sentinel-websearch",
      },
      method: "GET",
      signal: abortSignal,
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    lastPayload = payload;

    if (!response.ok) {
      const message =
        normalizeText(payload?.error) ||
        normalizeText(payload?.message) ||
        `SearXNG search failed with status ${response.status}.`;
      throw new Error(message);
    }

    const pageResults = normalizeSearxngResults(payload?.results, baseURL);
    if (pageResults.length === 0) {
      break;
    }

    collectedResults.push(...pageResults);

    if (collectedResults.length >= requestedResultCount * 2) {
      break;
    }
  }

  return {
    payload: lastPayload,
    results: collectedResults,
  };
}

async function executeSearxngSearch({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: WebSearchInput;
  runtime: WebSearchRuntime;
}) {
  const provider = requireProvider(runtime, input.provider);
  if (provider.provider !== "searxng") {
    throw new Error('Search provider "searxng" is not configured correctly.');
  }
  const requestedResultCount = clampRequestedResultCount(
    input.resultCount,
    runtime.settings,
  );
  const { livecrawl, searchType } = resolveSearchProviderOptions({
    defaultLivecrawl: provider.settings.defaultLivecrawl,
    defaultSearchType: provider.settings.defaultSearchType,
    provider: provider.provider,
    requestedLivecrawl: input.livecrawl,
    requestedSearchType: input.searchType,
  });
  const initialSearch = await fetchSearxngResults({
    abortSignal,
    baseURL: provider.config.baseURL,
    endpoint: "search",
    lenient: false,
    query: input.query,
    requestedResultCount,
  });
  let mergedResults = initialSearch.results;

  if (mergedResults.length === 0) {
    const rootSearch = await fetchSearxngResults({
      abortSignal,
      baseURL: provider.config.baseURL,
      endpoint: "root",
      lenient: false,
      query: input.query,
      requestedResultCount,
    });
    mergedResults = rootSearch.results;
  }

  if (mergedResults.length < Math.max(6, Math.ceil(requestedResultCount / 2))) {
    const lenientSearch = await fetchSearxngResults({
      abortSignal,
      baseURL: provider.config.baseURL,
      endpoint: mergedResults.length === 0 ? "root" : "search",
      lenient: true,
      query: input.query,
      requestedResultCount,
    });
    mergedResults = [...mergedResults, ...lenientSearch.results];
  }

  const results = filterAndRankSearxngResults({
    query: input.query,
    results: mergedResults,
  }).slice(0, requestedResultCount);

  return {
    digest: buildDigest({
      query: input.query,
      results,
    }),
    livecrawl,
    provider: provider.provider,
    query: input.query,
    requestedResultCount,
    resolvedSearchType: searchType,
    resultCount: results.length,
    results,
    searchType,
  } satisfies WebSearchOutput;
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
    const normalizedInput = {
      ...input,
      provider,
      query: input.query.trim(),
    };

    if (provider === "searxng") {
      return await executeSearxngSearch({
        abortSignal,
        input: normalizedInput,
        runtime,
      });
    }

    return await executeExaSearch({
      abortSignal,
      input: normalizedInput,
      runtime,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export const __internal = {
  DIGEST_MAX_ITEMS,
  DIGEST_SNIPPET_MAX_CHARS,
  EXA_SEARCH_ENDPOINT,
  SEARXNG_MAX_PAGES,
  SEARXNG_RESULTS_PER_PAGE,
  SUMMARY_MAX_CHARS,
  TEXT_MAX_CHARS,
};
