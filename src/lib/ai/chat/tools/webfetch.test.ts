import { afterEach, describe, expect, it, mock } from "bun:test";

import { __internal, executeWebFetch } from "./webfetch";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("executeWebFetch", () => {
  it("upgrades http URLs to https and converts HTML to markdown", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(
          "<html><head><title>Docs</title></head><body><h1>Hello</h1><p>World</p></body></html>",
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
            status: 200,
          },
        ),
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebFetch({
      input: {
        format: "markdown",
        url: "http://example.com/docs",
      },
      settings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://example.com/docs");
    expect(result.isBatch).toBe(false);
    expect(result.successCount).toBe(1);
    expect(result.results[0]).toMatchObject({
      status: "success",
      title: "Docs",
      url: "https://example.com/docs",
    });
    expect(
      result.results[0]?.status === "success" ? result.results[0].content : "",
    ).toContain("# Hello");
  });

  it("retries Cloudflare challenge responses with the fallback user agent", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const userAgent =
          init?.headers && typeof init.headers === "object"
            ? (init.headers as Record<string, string>)["User-Agent"]
            : undefined;

        if (userAgent !== "sentinel-webfetch") {
          return new Response("blocked", {
            headers: {
              "cf-mitigated": "challenge",
            },
            status: 403,
          });
        }

        return new Response("ok", {
          headers: {
            "content-type": "text/plain",
          },
          status: 200,
        });
      },
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebFetch({
      input: {
        format: "text",
        url: "https://example.com/changelog",
      },
      settings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>)[
        "User-Agent"
      ],
    ).toBe("sentinel-webfetch");
    expect(result.results[0]).toMatchObject({
      content: "ok",
      status: "success",
    });
  });

  it("returns base64 data URLs for image responses", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(Buffer.from([1, 2, 3, 4]), {
          headers: {
            "content-type": "image/png",
          },
          status: 200,
        }),
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebFetch({
      input: {
        format: "markdown",
        url: "https://example.com/image.png",
      },
      settings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(result.results[0]).toMatchObject({
      imageDataUrl: "data:image/png;base64,AQIDBA==",
      isImage: true,
      status: "success",
    });
  });

  it("rejects oversized responses before reading the body", async () => {
    const fetchImpl = mock(
      async () =>
        new Response("too large", {
          headers: {
            "content-length": String(__internal.MAX_RESPONSE_SIZE + 1),
            "content-type": "text/plain",
          },
          status: 200,
        }),
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    await expect(
      executeWebFetch({
        input: {
          format: "text",
          url: "https://example.com/big.txt",
        },
        settings: { batchEnabled: true, batchLimit: 10 },
      }),
    ).rejects.toThrow(/5MB limit/i);
  });

  it("truncates oversized text output for chat rendering", async () => {
    const fetchImpl = mock(
      async () =>
        new Response("a".repeat(__internal.MAX_CONTENT_CHARS + 200), {
          headers: {
            "content-type": "text/plain",
          },
          status: 200,
        }),
    );
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebFetch({
      input: {
        format: "text",
        url: "https://example.com/huge.txt",
      },
      settings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(result.results[0]?.status).toBe("success");
    expect(
      result.results[0]?.status === "success" ? result.results[0].content : "",
    ).toContain(__internal.CONTENT_TRUNCATION_NOTICE.trim());
  });

  it("supports batch fetches when enabled and records partial failures", async () => {
    const fetchImpl = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/b")) {
        return new Response("missing", { status: 404 });
      }

      return new Response(`content for ${url}`, {
        headers: {
          "content-type": "text/plain",
        },
        status: 200,
      });
    });
    globalThis.fetch = fetchImpl as typeof fetch;

    const result = await executeWebFetch({
      input: {
        format: "text",
        urls: [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
        ],
      },
      settings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(result.isBatch).toBe(true);
    expect(result.requestedCount).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.results.map((entry) => entry.status)).toEqual([
      "success",
      "error",
      "success",
    ]);
  });

  it("rejects multi-url batches when the setting is disabled", async () => {
    await expect(
      executeWebFetch({
        input: {
          format: "text",
          urls: ["https://example.com/a", "https://example.com/b"],
        },
        settings: { batchEnabled: false, batchLimit: 10 },
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it("enforces the user-configured batch limit", async () => {
    await expect(
      executeWebFetch({
        input: {
          format: "text",
          urls: [
            "https://example.com/a",
            "https://example.com/b",
            "https://example.com/c",
          ],
        },
        settings: { batchEnabled: true, batchLimit: 2 },
      }),
    ).rejects.toThrow(/limit is 2/i);
  });
});
