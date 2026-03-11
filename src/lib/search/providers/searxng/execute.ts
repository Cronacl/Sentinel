const SEARXNG_RESULTS_PER_PAGE = 10;
const SEARXNG_MAX_PAGES = 5;
const SEARXNG_TIMEOUT_MS = 15_000;
const SEARXNG_ENGINES =
  "bing,brave,duckduckgo,google,mojeek,presearch,qwant,startpage,wiby,yahoo";
const SUMMARY_MAX_CHARS = 1_200;

type SearxngRawResult = {
  content?: unknown;
  date?: unknown;
  favicon?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
  title?: unknown;
  url?: unknown;
};

type SearxngSearchResultItem = {
  author: string | null;
  publishedDate: string | null;
  score: number | null;
  summary: string | null;
  title: string | null;
  url: string;
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

function resolveSearxngResultUrl(url: string, baseURL: string) {
  try {
    return new URL(url, baseURL).toString();
  } catch {
    return url;
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

function normalizeSearxngResults(results: unknown, baseURL: string) {
  if (!Array.isArray(results)) {
    return [] as SearxngSearchResultItem[];
  }

  const normalizedResults: SearxngSearchResultItem[] = [];

  for (const result of results) {
    const candidate = result as SearxngRawResult;
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
  lenient,
  page,
  query,
}: {
  baseURL: string;
  lenient: boolean;
  page: number;
  query: string;
}) {
  const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const url = new URL("search", normalizedBaseURL);

  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("categories", "general");
  url.searchParams.set("engines", SEARXNG_ENGINES);
  url.searchParams.set("safesearch", "0");
  url.searchParams.set("pageno", String(Math.max(page, 1)));

  if (lenient) {
    url.searchParams.set("language", "all");
    url.searchParams.set("time_range", "year");
  } else {
    url.searchParams.set("time_range", "None");
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
  result: SearxngSearchResultItem;
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
  results: SearxngSearchResultItem[];
}) {
  const dedupedResults: SearxngSearchResultItem[] = [];
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
  lenient,
  query,
  requestedResultCount,
}: {
  abortSignal?: AbortSignal;
  baseURL: string;
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
  const collectedResults: SearxngSearchResultItem[] = [];

  const timeoutSignal = AbortSignal.timeout(SEARXNG_TIMEOUT_MS);
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildSearxngSearchUrl({
      baseURL,
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
      signal: combinedSignal,
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

  return { results: collectedResults };
}

export async function executeSearxngSearch({
  abortSignal,
  baseURL,
  query,
  requestedResultCount,
}: {
  abortSignal?: AbortSignal;
  baseURL: string;
  query: string;
  requestedResultCount: number;
}) {
  const initialSearch = await fetchSearxngResults({
    abortSignal,
    baseURL,
    lenient: false,
    query,
    requestedResultCount,
  });
  let mergedResults = initialSearch.results;

  if (mergedResults.length < Math.max(6, Math.ceil(requestedResultCount / 2))) {
    const lenientSearch = await fetchSearxngResults({
      abortSignal,
      baseURL,
      lenient: true,
      query,
      requestedResultCount,
    });
    mergedResults = [...mergedResults, ...lenientSearch.results];
  }

  const results = filterAndRankSearxngResults({
    query,
    results: mergedResults,
  }).slice(0, requestedResultCount);

  return { results };
}

export const __internal = {
  SEARXNG_ENGINES,
  SEARXNG_MAX_PAGES,
  SEARXNG_RESULTS_PER_PAGE,
  SEARXNG_TIMEOUT_MS,
};
