import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  EXTERNAL_REDIRECT_API_ROUTES,
  evaluateLoopbackRequest,
  isExternalRedirectApiRoute,
  isLoopbackHostname,
  parseHostHeader,
} from "./loopback-guard";

function evaluate(
  headers: Record<string, string>,
  options: {
    method?: string;
    pathname?: string;
    trustedOrigins?: string[];
  } = {},
) {
  return evaluateLoopbackRequest({
    headers: new Headers(headers),
    method: options.method ?? "POST",
    pathname: options.pathname ?? "/api/trpc/engines.list",
    trustedOrigins: options.trustedOrigins,
  });
}

describe("isLoopbackHostname", () => {
  it("accepts loopback names and addresses", () => {
    for (const hostname of [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "app.localhost",
      "127.0.0.1",
      "127.1.2.3",
      "[::1]",
      "::1",
      "[::ffff:7f00:1]",
    ]) {
      expect(isLoopbackHostname(hostname)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const hostname of [
      "",
      "0.0.0.0",
      "10.0.0.2",
      "192.168.1.10",
      "128.0.0.1",
      "127.0.0.256",
      "localhost.attacker.example",
      "attacker.example",
      "notlocalhost",
      "[::2]",
      "[::ffff:a00:1]",
    ]) {
      expect(isLoopbackHostname(hostname)).toBe(false);
    }
  });
});

describe("parseHostHeader", () => {
  it("normalises numeric and IPv6 spellings", () => {
    expect(parseHostHeader("127.1:3232")).toEqual({
      host: "127.0.0.1:3232",
      hostname: "127.0.0.1",
      port: "3232",
    });
    expect(parseHostHeader("[0:0:0:0:0:0:0:1]:3232")?.hostname).toBe("[::1]");
    expect(parseHostHeader("0x7f.0.0.1:3232")?.hostname).toBe("127.0.0.1");
    expect(parseHostHeader("LocalHost")?.host).toBe("localhost");
  });

  it("rejects values that are not a bare host", () => {
    for (const value of [
      null,
      undefined,
      "",
      "  ",
      "localhost/evil",
      "user@localhost",
      "localhost:3232?x",
      "local host",
      "localhost:99999",
    ]) {
      expect(parseHostHeader(value)).toBeNull();
    }
  });
});

describe("evaluateLoopbackRequest", () => {
  it("allows same-origin requests from the desktop window", () => {
    expect(
      evaluate({
        host: "localhost:3232",
        origin: "http://localhost:3232",
        "sec-fetch-site": "same-origin",
      }),
    ).toEqual({ allowed: true });
  });

  it("allows non-browser loopback clients without Origin", () => {
    expect(
      evaluate(
        { host: "localhost:3232" },
        { method: "GET", pathname: "/api/health" },
      ),
    ).toEqual({ allowed: true });
    expect(evaluate({ host: "127.0.0.1:3232" })).toEqual({ allowed: true });
  });

  it("allows the app reached through another loopback alias of its port", () => {
    expect(
      evaluate({ host: "127.0.0.1:3232", origin: "http://localhost:3232" }),
    ).toEqual({ allowed: true });
  });

  it("rejects DNS-rebinding requests whose Host is not loopback", () => {
    const decision = evaluate({
      host: "attacker.example:3232",
      origin: "http://attacker.example:3232",
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "localhost:3232",
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "host",
      status: 421,
    });
  });

  it("rejects a missing or malformed Host", () => {
    expect(evaluate({})).toMatchObject({ allowed: false, reason: "host" });
    expect(evaluate({ host: "localhost/x" })).toMatchObject({
      allowed: false,
      reason: "host",
    });
    expect(evaluate({ host: "0.0.0.0:3232" })).toMatchObject({
      allowed: false,
      reason: "host",
    });
  });

  it("rejects cross-origin browser requests", () => {
    for (const origin of [
      "https://attacker.example",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "null",
      "file://",
      "chrome-extension://abcdef",
      "http://localhost:3232/path",
      "not a url",
    ]) {
      expect(evaluate({ host: "localhost:3232", origin })).toMatchObject({
        allowed: false,
        reason: "origin",
        status: 403,
      });
    }
  });

  it("rejects cross-origin GETs too (queries can spawn engine probes)", () => {
    expect(
      evaluate(
        { host: "localhost:3232", origin: "https://attacker.example" },
        { method: "GET" },
      ),
    ).toMatchObject({ allowed: false, reason: "origin" });
  });

  it("rejects cross-site and same-site fetch metadata without Origin", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(
        evaluate(
          { host: "localhost:3232", "sec-fetch-site": site },
          { method: "GET" },
        ),
      ).toMatchObject({ allowed: false, reason: "fetch-site", status: 403 });
    }
  });

  it("allows user-initiated navigations (Sec-Fetch-Site: none)", () => {
    expect(
      evaluate(
        { host: "localhost:3232", "sec-fetch-site": "none" },
        { method: "GET", pathname: "/api/generated-media/a.png" },
      ),
    ).toEqual({ allowed: true });
  });

  it("accepts explicitly trusted origins", () => {
    expect(
      evaluate(
        { host: "localhost:3232", origin: "http://localhost:4000" },
        { trustedOrigins: ["http://localhost:4000/"] },
      ),
    ).toEqual({ allowed: true });
  });

  it("lets OAuth providers redirect back to the callback routes", () => {
    for (const pathname of EXTERNAL_REDIRECT_API_ROUTES) {
      expect(
        evaluate(
          {
            host: "localhost:3232",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "cross-site",
          },
          { method: "GET", pathname },
        ),
      ).toEqual({ allowed: true });
    }
  });

  it("still requires a loopback Host and GET on the callback routes", () => {
    const [pathname] = EXTERNAL_REDIRECT_API_ROUTES;

    expect(
      evaluate({ host: "attacker.example" }, { method: "GET", pathname }),
    ).toMatchObject({ allowed: false, reason: "host" });
    expect(
      evaluate(
        { host: "localhost:3232", origin: "https://attacker.example" },
        { method: "POST", pathname },
      ),
    ).toMatchObject({ allowed: false, reason: "origin" });
  });
});

describe("EXTERNAL_REDIRECT_API_ROUTES", () => {
  it("names only route handlers that exist", () => {
    const apiRoot = path.join(process.cwd(), "src", "app");

    for (const route of EXTERNAL_REDIRECT_API_ROUTES) {
      const file = path.join(apiRoot, ...route.split("/"), "route.ts");
      expect(statSync(file).isFile()).toBe(true);
    }
  });

  it("covers every OAuth callback under src/app/api", () => {
    const callbacks: string[] = [];
    const walk = (directory: string, segments: string[]) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(directory, entry.name), [...segments, entry.name]);
        } else if (entry.name === "route.ts" && segments.includes("callback")) {
          callbacks.push(`/${segments.join("/")}`);
        }
      }
    };
    walk(path.join(process.cwd(), "src", "app", "api"), ["api"]);

    expect(callbacks.sort()).toEqual([...EXTERNAL_REDIRECT_API_ROUTES].sort());
  });

  it("matches with or without a trailing slash", () => {
    expect(isExternalRedirectApiRoute("/api/mcp/oauth/callback/")).toBe(true);
    expect(isExternalRedirectApiRoute("/api/mcp/oauth/callback/x")).toBe(false);
    expect(isExternalRedirectApiRoute("/api/trpc")).toBe(false);
  });
});
