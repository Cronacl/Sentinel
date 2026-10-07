import { afterEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
// Next 16.4 still exports the matcher helper under its middleware name.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config, proxy } from "./proxy";

const originalAppUrl = process.env.SENTINEL_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.SENTINEL_APP_URL;
  } else {
    process.env.SENTINEL_APP_URL = originalAppUrl;
  }
});

function request(
  pathname: string,
  headers: Record<string, string>,
  method = "POST",
) {
  // Next builds the proxy URL from its own hostname and port; only the Host
  // header carries the name the client used.
  return new NextRequest(`http://localhost:3232${pathname}`, {
    headers,
    method,
  });
}

describe("proxy", () => {
  it("runs on every /api route and nothing else", () => {
    for (const url of [
      "/api",
      "/api/trpc/engines.list",
      "/api/chat",
      "/api/chat/thread-1/stream",
      "/api/mcp/oauth/callback",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    }

    for (const url of ["/", "/settings/engines", "/_next/static/chunk.js"]) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
  });

  it("passes same-origin requests through", () => {
    const response = proxy(
      request("/api/trpc/engines.list", {
        host: "localhost:3232",
        origin: "http://localhost:3232",
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("answers 421 for a rebound Host", async () => {
    const response = proxy(
      request("/api/trpc/engines.list", {
        host: "attacker.example:3232",
        origin: "http://attacker.example:3232",
      }),
    );

    expect(response.status).toBe(421);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(await response.json()).toMatchObject({ error: "host" });
  });

  it("answers 403 for a foreign Origin", async () => {
    const response = proxy(
      request("/api/chat", {
        host: "127.0.0.1:3232",
        origin: "https://attacker.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "origin" });
  });

  it("trusts SENTINEL_APP_URL as an extra origin", () => {
    process.env.SENTINEL_APP_URL = "http://localhost:4000";

    const response = proxy(
      request("/api/chat", {
        host: "localhost:3232",
        origin: "http://localhost:4000",
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets OAuth redirects reach the callback routes", () => {
    const response = proxy(
      request(
        "/api/integrations/oauth/callback?code=abc&state=xyz",
        {
          host: "localhost:3232",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "cross-site",
        },
        "GET",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
