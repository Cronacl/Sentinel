import { afterEach, describe, expect, it, mock } from "bun:test";

import { __internal, executeWebSearch } from "./websearch";

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;

const runtime = {
  providers: {
    exa: {
      config: {
        apiKey: "exa_key",
      },
      isEnabled: true,
      provider: "exa" as const,
      settings: {
        defaultLivecrawl: "preferred" as const,
        defaultSearchType: "auto" as const,
      },
    },
    searxng: {
      config: {
        baseURL: "https://search.example.com",
      },
      isEnabled: true,
      provider: "searxng" as const,
      settings: {
        defaultLivecrawl: "preferred" as const,
        defaultSearchType: "auto" as const,
      },
    },
  },
  settings: {
    defaultProvider: "exa" as const,
    defaultResultCount: 5,
    maxResultCount: 10,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  mock.restore();
});

describe("executeWebSearch", () => {
  it("calls Exa with the resolved search options and normalizes results", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        expect(body).toMatchObject({
          contents: {
            livecrawl: "always",
          },
          numResults: 4,
          query: "sentinel web search",
          type: "deep",
        });

        return new Response(
          JSON.stringify({
            resolvedSearchType: "deep",
            results: [
              {
                author: "Sentinel",
                publishedDate: "2026-03-10",
                summary: "Primary result summary",
                title: "Sentinel docs",
                url: "https://example.com/docs",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      },
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebSearch({
      input: {
        livecrawl: "always",
        query: "sentinel web search",
        resultCount: 4,
        searchType: "deep",
      },
      runtime,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(__internal.EXA_SEARCH_ENDPOINT);
    expect(
      (fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>)[
        "x-api-key"
      ],
    ).toBe("exa_key");
    expect(result).toMatchObject({
      livecrawl: "always",
      provider: "exa",
      query: "sentinel web search",
      requestedResultCount: 4,
      resolvedSearchType: "deep",
      resultCount: 1,
      searchType: "deep",
    });
    expect(result.results[0]).toMatchObject({
      author: "Sentinel",
      summary: "Primary result summary",
      title: "Sentinel docs",
      url: "https://example.com/docs",
    });
    expect(result.digest).toContain("Sentinel docs");
  });

  it("caps the requested result count to the user max", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));

        expect(body.numResults).toBe(10);

        return new Response(
          JSON.stringify({
            results: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      },
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebSearch({
      input: {
        query: "too many results",
        resultCount: 50,
      },
      runtime,
    });

    expect(result.requestedResultCount).toBe(10);
  });

  it("rejects disabled providers before making a request", async () => {
    await expect(
      executeWebSearch({
        input: {
          provider: "exa",
          query: "disabled provider",
        },
        runtime: {
          ...runtime,
          providers: {
            exa: {
              ...runtime.providers.exa,
              isEnabled: false,
            },
          },
        },
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it("rejects unconfigured providers before making a request", async () => {
    await expect(
      executeWebSearch({
        input: {
          provider: "exa",
          query: "missing provider",
        },
        runtime: {
          ...runtime,
          providers: {},
        },
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it("supports SearXNG with pagination, normalization, and deduped ranking", async () => {
    Date.now = () => new Date("2026-03-20T12:00:00.000Z").valueOf();

    const fetchImpl = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      expect(url.origin + url.pathname).toBe(
        "https://search.example.com/search",
      );
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("categories")).toBe("general");
      expect(url.searchParams.get("engines")).toBe(__internal.SEARXNG_ENGINES);
      expect(url.searchParams.get("safesearch")).toBe("0");
      expect(url.searchParams.get("q")).toBe("privacy search");

      const page = url.searchParams.get("pageno");

      if (page === "1") {
        return new Response(
          JSON.stringify({
            results: [
              {
                content: "Privacy focused result summary",
                published_date: "2026-03-11",
                title: "Privacy Search Docs",
                url: "https://www.example.com/privacy?utm_source=test",
              },
              {
                content: "Secondary result",
                title: "Search Guide",
                url: "https://docs.example.dev/guide",
              },
              {
                content: "Privacy search handbook",
                title: "Privacy Search Handbook",
                url: "https://handbook.example.com/privacy-search",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      if (page === "2") {
        return new Response(
          JSON.stringify({
            results: [
              {
                content: "Duplicate primary result",
                date: "2026-03-10",
                title: "Privacy Search Docs Mirror",
                url: "https://example.com/privacy",
              },
              {
                content: "Recent privacy article",
                publishedDate: "2026-03-01",
                title: "Recent Privacy Search News",
                url: "https://news.example.com/privacy-search",
              },
              {
                content: "Reference material",
                title: "Reference",
                url: "https://reference.example.org/search/privacy",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          results: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebSearch({
      input: {
        provider: "searxng",
        query: "privacy search",
        resultCount: 12,
      },
      runtime: {
        ...runtime,
        settings: {
          ...runtime.settings,
          maxResultCount: 25,
        },
      },
    });

    expect(fetchImpl.mock.calls).toHaveLength(3);
    expect(result).toMatchObject({
      livecrawl: "preferred",
      provider: "searxng",
      requestedResultCount: 12,
      resolvedSearchType: "auto",
      resultCount: 5,
      searchType: "auto",
    });
    expect(result.results[0]).toMatchObject({
      publishedDate: "2026-03-11",
      summary: "Privacy focused result summary",
      title: "Privacy Search Docs",
      url: "https://example.com/privacy",
    });
    expect(result.results.map((item) => item.url)).toEqual([
      "https://example.com/privacy",
      "https://news.example.com/privacy-search",
      "https://handbook.example.com/privacy-search",
      "https://docs.example.dev/guide",
      "https://reference.example.org/search/privacy",
    ]);
    expect(result.results[0]?.score).not.toBeNull();
  });

  it("retries SearXNG in lenient mode when the initial pass is sparse", async () => {
    const fetchImpl = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const isLenient = url.searchParams.get("language") === "all";

      if (!isLenient) {
        return new Response(
          JSON.stringify({
            results: [
              {
                content: "Only one result in strict mode",
                title: "Strict mode result",
                url: "https://strict.example.com/result",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          results: [
            {
              content: "Lenient result one",
              title: "Lenient one",
              url: "https://lenient.example.com/one",
            },
            {
              content: "Lenient result two",
              title: "Lenient two",
              url: "https://lenient.example.com/two",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebSearch({
      input: {
        provider: "searxng",
        query: "fallback search",
      },
      runtime,
    });

    expect(fetchImpl.mock.calls).toHaveLength(2);
    expect(
      new URL(String(fetchImpl.mock.calls[0]?.[0])).searchParams.get(
        "language",
      ),
    ).toBeNull();
    expect(
      new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get(
        "language",
      ),
    ).toBe("all");
    expect(
      new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get(
        "time_range",
      ),
    ).toBe("year");
    expect(result.results.map((item) => item.url)).toEqual([
      "https://strict.example.com/result",
      "https://lenient.example.com/one",
      "https://lenient.example.com/two",
    ]);
  });

  it("normalizes unsupported SearXNG overrides to the provider defaults", async () => {
    const fetchImpl = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("language")).toBeNull();
      expect(url.searchParams.get("time_range")).toBe("None");

      return new Response(
        JSON.stringify({
          results: [
            {
              content: "Privacy focused result summary",
              title: "SearXNG result",
              url: "https://example.com/privacy",
            },
            {
              content: "Second result",
              title: "Second result",
              url: "https://example.com/second",
            },
            {
              content: "Third result",
              title: "Third result",
              url: "https://example.com/third",
            },
            {
              content: "Fourth result",
              title: "Fourth result",
              url: "https://example.com/fourth",
            },
            {
              content: "Fifth result",
              title: "Fifth result",
              url: "https://example.com/fifth",
            },
            {
              content: "Sixth result",
              title: "Sixth result",
              url: "https://example.com/sixth",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebSearch({
      input: {
        livecrawl: "always",
        provider: "searxng",
        query: "unsupported override",
        searchType: "deep",
      },
      runtime,
    });

    expect(result).toMatchObject({
      livecrawl: "preferred",
      provider: "searxng",
      resolvedSearchType: "auto",
      searchType: "auto",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
