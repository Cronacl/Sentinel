import { afterEach, describe, expect, it, mock } from "bun:test";

// The usage readers each driver declares, with their engines replaced.
mock.module("server-only", () => ({}));

const readRateLimits = mock(async () => ({
  rateLimits: {
    planType: "plus",
    primary: { usedPercent: 30, windowDurationMins: 300 },
    secondary: { usedPercent: 60, windowDurationMins: 10_080 },
  },
  rateLimitsByLimitId: null,
}));
mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => ({ readRateLimits }),
  resetCodexEngineStatusCache: () => {},
}));
mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  resetCodexCliResolutionCache: () => {},
  resolveCodexCli: async () => null,
}));

const { readCodexUsageLimits } = await import("./codex");
const { cursorDriver } = await import("./cursor");
const { makeFakeInstance, makeFakeSnapshot } =
  await import("../contract/testing");
const { forgetCursorKeychainToken, getCursorKeychainToken } =
  await import("../usage/cursor-keychain");

const signal = new AbortController().signal;
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  readRateLimits.mockClear();
  forgetCursorKeychainToken();
});

describe("Codex usage reader", () => {
  const instance = makeFakeInstance({ driver: "codex", id: "codex" });

  it("reads the instance's rate limits", async () => {
    const limits = await readCodexUsageLimits(instance, {
      now: () => 0,
      signal,
      snapshot: makeFakeSnapshot({ driver: "codex" }),
    });
    expect(
      limits.windows.map((window) => [window.id, window.usedPercent]),
    ).toEqual([
      ["primary", 30],
      ["secondary", 60],
    ]);
  });

  it("skips API-key sign-ins", async () => {
    const limits = await readCodexUsageLimits(instance, {
      signal,
      snapshot: makeFakeSnapshot({
        auth: { ...makeFakeSnapshot().auth, method: "apiKey" },
      }),
    });
    expect(limits.unavailable?.reason).toBe("unsupported");
    expect(readRateLimits).not.toHaveBeenCalled();
  });

  it("reports a failed read", async () => {
    const limits = await readCodexUsageLimits(instance, {
      reader: {
        readRateLimits: async () => {
          throw new Error("rpc");
        },
      },
      signal,
    });
    expect(limits.unavailable?.reason).toBe("probeFailed");
  });
});

describe("Cursor usage reader", () => {
  it("drops a Keychain token Cursor refuses", async () => {
    const instance = makeFakeInstance({
      driver: "cursor",
      env: { HOME: "/nonexistent-home" },
      id: "cursor",
    });
    globalThis.__sentinelCursorKeychainTokens?.set(
      "user-1\u0000cursor",
      "old-token",
    );
    globalThis.__sentinelCursorKeychainTokens?.set(
      "user-2\u0000cursor",
      "other-token",
    );
    const requests: Array<string | null> = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      requests.push(new Headers(init?.headers).get("authorization"));
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;

    const limits = await cursorDriver.usageLimits!.read(instance, {
      signal,
      userId: "user-1",
    });

    expect(limits.unavailable?.reason).toBe("probeFailed");
    // Only this user's login was sent, and only it is dropped.
    expect(requests).toEqual(["Bearer old-token"]);
    expect(getCursorKeychainToken("user-1", "cursor")).toBeNull();
    expect(getCursorKeychainToken("user-2", "cursor")).toBe("other-token");
  });

  it("forgets kept logins on sign-out and when the instance changes", () => {
    const tokens = globalThis.__sentinelCursorKeychainTokens!;
    tokens.set("user-1\u0000cursor", "a");
    tokens.set("user-2\u0000cursor", "b");
    tokens.set("user-1\u0000cursor-work", "c");

    cursorDriver.usageLimits!.forget!("cursor", "user-1");
    expect(getCursorKeychainToken("user-1", "cursor")).toBeNull();
    expect(getCursorKeychainToken("user-2", "cursor")).toBe("b");

    cursorDriver.invalidate!({ driver: "cursor", id: "cursor" });
    expect(getCursorKeychainToken("user-2", "cursor")).toBeNull();
    expect(getCursorKeychainToken("user-1", "cursor-work")).toBe("c");
  });

  it("uses no Keychain login without a user", () => {
    globalThis.__sentinelCursorKeychainTokens?.set("user-1\u0000cursor", "a");
    expect(getCursorKeychainToken(undefined, "cursor")).toBeNull();
  });
});
