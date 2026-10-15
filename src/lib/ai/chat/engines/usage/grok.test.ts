import { afterAll, describe, expect, it, mock } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// Grok's billing reader against a real local HTTP server (the billing URL is
// redirected to it) and fake files: only the default grok.com login is read.

mock.module("server-only", () => ({}));

const {
  GROK_BILLING_URL,
  grokBillingToLimits,
  readGrokLogin,
  readGrokUsageLimits,
} = await import("./grok");

const LOGIN_KEY = "https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828";

const seen: Array<{ authorization: string | null; url: string }> = [];
let body: unknown = {
  config: {
    creditUsagePercent: 42.5,
    currentPeriod: {
      end: "2026-11-01T00:00:00Z",
      type: "USAGE_PERIOD_TYPE_MONTHLY",
    },
  },
};
let status = 200;
const server = createServer((request, response) => {
  seen.push({
    authorization: request.headers.authorization ?? null,
    url: request.url ?? "",
  });
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
});
await new Promise<void>((resolve) =>
  server.listen(0, "127.0.0.1", () => resolve()),
);
const serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

/** Sends the billing request to the local server instead of xAI. */
const localFetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  return fetch(`${serverUrl}${url.pathname}${url.search}`, init);
}) as typeof fetch;

function files(entries: Record<string, string>) {
  return async (target: string) => {
    if (target in entries) return entries[target]!;
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  };
}

const authFile = (entry: Record<string, unknown>) =>
  JSON.stringify({ [LOGIN_KEY]: entry });

const deps = (entries: Record<string, string>) => ({
  fetch: localFetch,
  homeDirectory: "/home/me",
  now: () => Date.parse("2026-10-15T00:00:00Z"),
  readFile: files(entries),
});

describe("readGrokLogin", () => {
  it("reads the grok.com login from GROK_HOME or ~/.grok", async () => {
    expect(
      await readGrokLogin(
        {},
        deps({
          "/home/me/.grok/auth.json": authFile({
            email: "me@x.ai",
            key: "tok",
          }),
        }),
      ),
    ).toEqual({ email: "me@x.ai", status: "signed-in", token: "tok" });
    expect(
      await readGrokLogin(
        { GROK_HOME: "/work/grok" },
        deps({ "/work/grok/auth.json": authFile({ key: "tok2" }) }),
      ),
    ).toEqual({ email: null, status: "signed-in", token: "tok2" });
    expect(await readGrokLogin({}, deps({}))).toEqual({ status: "signed-out" });
  });

  it("leaves API keys and custom deployments alone", async () => {
    const file = { "/home/me/.grok/auth.json": authFile({ key: "tok" }) };
    expect(await readGrokLogin({ XAI_API_KEY: "k" }, deps(file))).toEqual({
      status: "other",
    });
    expect(
      await readGrokLogin(
        { GROK_CLI_CHAT_PROXY_BASE_URL: "https://x" },
        deps(file),
      ),
    ).toEqual({ status: "other" });
    expect(
      await readGrokLogin(
        {},
        deps({
          ...file,
          "/home/me/.grok/config.toml": "[endpoints]\nchat = 'x'\n",
        }),
      ),
    ).toEqual({ status: "other" });
    expect(
      await readGrokLogin(
        {},
        deps({
          "/home/me/.grok/auth.json": authFile({
            auth_mode: "api_key",
            key: "k",
          }),
        }),
      ),
    ).toEqual({ status: "other" });
  });
});

describe("readGrokUsageLimits", () => {
  const signal = new AbortController().signal;

  it("reads the credit percentage with the login's bearer token", async () => {
    const limits = await readGrokUsageLimits(
      { env: {}, signal },
      deps({ "/home/me/.grok/auth.json": authFile({ key: "tok" }) }),
    );

    expect(seen.at(-1)).toEqual({
      authorization: "Bearer tok",
      url: "/v1/billing?format=credits",
    });
    expect(GROK_BILLING_URL).toBe(
      "https://cli-chat-proxy.grok.com/v1/billing?format=credits",
    );
    expect(limits.windows).toEqual([
      {
        id: "subscription",
        kind: "monthly",
        label: "Monthly",
        resetsAt: "2026-11-01T00:00:00.000Z",
        usedPercent: 42.5,
      },
    ]);
    expect(limits.credentialFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends nothing without a grok.com login", async () => {
    const before = seen.length;
    const limits = await readGrokUsageLimits({ env: {}, signal }, deps({}));
    expect(limits.unavailable?.reason).toBe("unsupported");
    expect(seen.length).toBe(before);
  });

  it("reports a refused read as probeFailed", async () => {
    status = 401;
    try {
      const limits = await readGrokUsageLimits(
        { env: {}, signal },
        deps({ "/home/me/.grok/auth.json": authFile({ key: "tok" }) }),
      );
      expect(limits.unavailable?.reason).toBe("probeFailed");
    } finally {
      status = 200;
    }
  });

  it("treats a missing percentage as nothing used yet", () => {
    body = {};
    expect(
      grokBillingToLimits(
        {},
        { checkedAt: "2026-10-15T00:00:00.000Z", token: "t" },
      ).windows,
    ).toEqual([]);
  });
});
