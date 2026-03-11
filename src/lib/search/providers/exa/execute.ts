import {
  SEARCH_TYPE_VALUES,
  type LivecrawlMode,
  type SearchType,
} from "@/lib/search";

export const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";
const SUMMARY_MAX_CHARS = 1_200;
const TEXT_MAX_CHARS = 1_800;

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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
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

function normalizeExaResults(results: unknown) {
  if (!Array.isArray(results)) {
    return [];
  }

  const normalized: {
    author: string | null;
    publishedDate: string | null;
    score: number | null;
    summary: string | null;
    title: string | null;
    url: string;
  }[] = [];

  for (const result of results) {
    const candidate = result as ExaResult;
    const url = normalizeText(candidate.url);

    if (!url) {
      continue;
    }

    normalized.push({
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

  return normalized;
}

export async function executeExaSearch({
  abortSignal,
  apiKey,
  livecrawl,
  query,
  requestedResultCount,
  searchType,
}: {
  abortSignal?: AbortSignal;
  apiKey: string;
  livecrawl: LivecrawlMode;
  query: string;
  requestedResultCount: number;
  searchType: SearchType;
}) {
  const response = await fetch(EXA_SEARCH_ENDPOINT, {
    body: JSON.stringify({
      contents: {
        livecrawl,
        summary: {
          maxCharacters: SUMMARY_MAX_CHARS,
          query,
        },
        text: {
          maxCharacters: TEXT_MAX_CHARS,
        },
      },
      numResults: requestedResultCount,
      query,
      type: searchType,
    }),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "sentinel-websearch",
      "x-api-key": apiKey,
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

  return { resolvedSearchType, results };
}

export const __internal = {
  EXA_SEARCH_ENDPOINT,
  SUMMARY_MAX_CHARS,
  TEXT_MAX_CHARS,
};
