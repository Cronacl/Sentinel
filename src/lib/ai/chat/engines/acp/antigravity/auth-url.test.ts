import { spawnSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const authUrl = await import("./auth-url");
const { AUTH_URL_MARKER, ensureAuthBrowserHelper } =
  await import("@/lib/ai/chat/engines/platform/auth/browser-helper");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

/** A loopback HTTP server on a free port. */
async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    port: (server.address() as AddressInfo).port,
  };
}

const REDIRECT = "http://127.0.0.1:45678/";
const GOOGLE = `https://accounts.google.com/o/oauth2/v2/auth?client_id=c&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=openid&state=st-1`;

describe("parseAntigravityAuthorizationUrl", () => {
  it("accepts Google's endpoint with one loopback redirect", () => {
    expect(authUrl.parseAntigravityAuthorizationUrl(GOOGLE)).toEqual({
      authorizationUrl: GOOGLE,
      redirectUri: REDIRECT,
      state: "st-1",
    });
  });

  for (const [label, url] of [
    ["another host", GOOGLE.replace("accounts.google.com", "evil.example")],
    [
      "a second redirect",
      `${GOOGLE}&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    ],
    [
      "a non-loopback redirect",
      GOOGLE.replace(
        encodeURIComponent(REDIRECT),
        encodeURIComponent("http://10.0.0.1:4567/"),
      ),
    ],
    [
      "a privileged port",
      GOOGLE.replace(
        encodeURIComponent(REDIRECT),
        encodeURIComponent("http://127.0.0.1:80/"),
      ),
    ],
    [
      "a port above 65535",
      GOOGLE.replace(
        encodeURIComponent(REDIRECT),
        encodeURIComponent("http://127.0.0.1:99999/"),
      ),
    ],
    ["no state", GOOGLE.replace("&state=st-1", "")],
    [
      "another response type",
      GOOGLE.replace("response_type=code", "response_type=token"),
    ],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(authUrl.parseAntigravityAuthorizationUrl(url)).toBeNull();
    });
  }
});

describe("readAntigravityAuthLine", () => {
  it("reads the stdout prompt and the browser helper's stderr marker", async () => {
    expect(
      authUrl.readAntigravityAuthLine(
        `${authUrl.ANTIGRAVITY_AUTH_STDOUT_PREFIX}${GOOGLE}\r`,
      )?.state,
    ).toBe("st-1");

    if (process.platform === "win32") return;
    const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-helper-"));
    roots.push(dir);
    const helper = await ensureAuthBrowserHelper(dir);
    // What Python's webbrowser does with BROWSER=<helper>.
    const result = spawnSync(helper, [GOOGLE], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    const line = result.stderr.trim();
    expect(authUrl.readAntigravityAuthLine(line)?.authorizationUrl).toBe(
      GOOGLE,
    );
  });

  it("never throws on an out-of-range redirect port in either form", () => {
    const bad = GOOGLE.replace(
      encodeURIComponent(REDIRECT),
      "http://127.0.0.1:99999/",
    );
    expect(
      authUrl.readAntigravityAuthLine(
        `${authUrl.ANTIGRAVITY_AUTH_STDOUT_PREFIX}${bad}`,
      ),
    ).toBeNull();
    expect(
      authUrl.readAntigravityAuthLine(`${AUTH_URL_MARKER}"${bad}"`),
    ).toBeNull();
  });

  it("ignores other output", () => {
    expect(
      authUrl.readAntigravityAuthLine("Loading model catalog…"),
    ).toBeNull();
  });
});

describe("validateAntigravityCallbackUrl", () => {
  const pending = { redirectUri: REDIRECT, state: "st-1" };

  it("accepts the pending redirect with one code (and Google as issuer)", () => {
    const url = authUrl.validateAntigravityCallbackUrl(
      pending,
      `${REDIRECT}?state=st-1&code=abc&iss=${encodeURIComponent("https://accounts.google.com")}`,
    );
    expect(url.searchParams.get("code")).toBe("abc");
  });

  for (const [label, value] of [
    ["another port", "http://127.0.0.1:45679/?state=st-1&code=abc"],
    ["another state", `${REDIRECT}?state=other&code=abc`],
    ["both a code and an error", `${REDIRECT}?state=st-1&code=a&error=b`],
    ["no response", `${REDIRECT}?state=st-1`],
    [
      "another issuer",
      `${REDIRECT}?state=st-1&code=a&iss=https%3A%2F%2Fevil.example`,
    ],
    ["not a URL", "copied text"],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(() =>
        authUrl.validateAntigravityCallbackUrl(pending, value),
      ).toThrow(authUrl.AntigravityCallbackError);
    });
  }
});

describe("forwardAntigravityCallback", () => {
  it("replays the redirect to the loopback listener with one GET", async () => {
    const seen: string[] = [];
    const server = await listen((request, response) => {
      seen.push(`${request.method} ${request.url}`);
      response.end("signed in");
    });
    try {
      await authUrl.forwardAntigravityCallback(
        new URL(`http://127.0.0.1:${server.port}/?state=s&code=c`),
      );
      expect(seen).toEqual(["GET /?state=s&code=c"]);
    } finally {
      await server.close();
    }
  });

  it("fails when the listener refuses or is gone", async () => {
    const server = await listen((_request, response) => {
      response.statusCode = 400;
      response.end("no");
    });
    const url = new URL(`http://127.0.0.1:${server.port}/?state=s&code=c`);
    await expect(authUrl.forwardAntigravityCallback(url)).rejects.toThrow(
      authUrl.AntigravityCallbackError,
    );
    await server.close();
    await expect(
      authUrl.forwardAntigravityCallback(url, { timeoutMs: 1_000 }),
    ).rejects.toThrow(authUrl.AntigravityCallbackError);
  });

  it("bounds the whole exchange, not only socket idle time", async () => {
    // A listener that keeps the response open by trickling bytes.
    const timers: ReturnType<typeof setInterval>[] = [];
    const server = await listen((_request, response) => {
      response.writeHead(200);
      timers.push(setInterval(() => response.write("."), 50));
    });
    try {
      const started = Date.now();
      await expect(
        authUrl.forwardAntigravityCallback(
          new URL(`http://127.0.0.1:${server.port}/?state=s&code=c`),
          { timeoutMs: 400 },
        ),
      ).rejects.toThrow(authUrl.AntigravityCallbackError);
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      for (const timer of timers) clearInterval(timer);
      await server.close();
    }
  });
});
