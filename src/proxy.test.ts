import { afterEach, describe, expect, it } from "bun:test";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { getCloneableBody } from "next/dist/server/body-streams";
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

  it("accepts a non-loopback SENTINEL_APP_URL as Host and Origin", () => {
    process.env.SENTINEL_APP_URL = "https://sentinel.devbox.example";

    const response = proxy(
      request("/api/chat", {
        host: "sentinel.devbox.example",
        origin: "https://sentinel.devbox.example",
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

// Next clones the body of every request the proxy handles and gives the
// route handler only the first `proxyClientMaxBodySize` bytes (10 MB unless
// configured). Chat requests inline attachments, so next.config.js lifts the
// cap; this runs Next's own cloning with the configured value.
describe("proxied request bodies", () => {
  async function bodyAfterProxy(body: Buffer, sizeLimit?: number) {
    const chunkSize = 1024 * 1024;
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < body.length; offset += chunkSize) {
      chunks.push(body.subarray(offset, offset + chunkSize));
    }
    const incoming = Readable.from(chunks) as unknown as IncomingMessage;

    const cloneable = getCloneableBody(incoming, sizeLimit);
    cloneable.cloneBodyStream().resume();
    await cloneable.finalize();

    const received: Buffer[] = [];
    for await (const chunk of incoming as unknown as Readable) {
      received.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(received);
  }

  it("hands route handlers bodies larger than Next's default cap intact", async () => {
    process.env.SKIP_ENV_VALIDATION = "1";
    const { default: nextConfig } = await import("../next.config.js");
    const sizeLimit = nextConfig.experimental?.proxyClientMaxBodySize;

    expect(typeof sizeLimit).toBe("number");
    expect(sizeLimit as number).toBeGreaterThanOrEqual(2 ** 32);

    const body = Buffer.alloc(12 * 1024 * 1024, 7);
    body[body.length - 1] = 1;
    const received = await bodyAfterProxy(body, sizeLimit as number);
    expect(received.length).toBe(body.length);
    expect(received.equals(body)).toBe(true);
  });

  it("documents the default: Next cuts the body off at 10 MB", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const received = await bodyAfterProxy(Buffer.alloc(12 * 1024 * 1024, 7));
      expect(received.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    } finally {
      console.warn = originalWarn;
    }
  });
});
