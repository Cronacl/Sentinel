import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  DEFAULT_CURSOR_API_ENDPOINT,
  cursorUsageResponseToLimits,
  getCursorAuthFilePaths,
  readCursorUsageLimits,
} = await import("./cursor");

const NOW = Date.parse("2026-10-08T10:00:00.000Z");
const signal = new AbortController().signal;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function createFetch(response: Response | (() => Promise<Response>)) {
  return mock(async (_url: string | URL | Request, _init?: RequestInit) =>
    typeof response === "function" ? await response() : response,
  );
}

const noFile = mock(async () => {
  throw Object.assign(new Error("missing"), { code: "ENOENT" });
});

describe("Cursor usage", () => {
  it("shows the two pools instead of Overall when both are reported", () => {
    const limits = cursorUsageResponseToLimits(
      {
        billingCycleEnd: "1792000000000",
        planUsage: {
          apiPercentUsed: 61,
          autoPercentUsed: 12,
          totalPercentUsed: 40,
        },
      },
      "2026-10-08T10:00:00.000Z",
    );
    expect(limits.windows.map((window) => window.id)).toEqual([
      "apiPercentUsed",
      "autoPercentUsed",
    ]);
    expect(limits.windows[0]).toEqual(
      expect.objectContaining({
        kind: "monthly",
        resetsAt: new Date(1_792_000_000_000).toISOString(),
      }),
    );
    expect(
      cursorUsageResponseToLimits({}, "2026-10-08T10:00:00.000Z").unavailable
        ?.reason,
    ).toBe("unsupported");
  });

  it("reads usage with CURSOR_AUTH_TOKEN", async () => {
    const fetchMock = createFetch(
      jsonResponse({ planUsage: { totalPercentUsed: 25 } }),
    );
    const result = await readCursorUsageLimits(
      { env: { CURSOR_AUTH_TOKEN: " token-1 " }, keychainToken: null, signal },
      { fetch: fetchMock as never, now: () => NOW, readFile: noFile },
    );

    expect(result.source).toBe("env");
    expect(result.limits.windows).toEqual([
      {
        id: "totalPercentUsed",
        kind: "monthly",
        label: "Overall",
        usedPercent: 25,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `${DEFAULT_CURSOR_API_ENDPOINT}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`,
    );
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer token-1",
    );
    expect(noFile).not.toHaveBeenCalled();
  });

  it("never reads usage for API-key sign-ins", async () => {
    const fetchMock = createFetch(jsonResponse({}));
    const result = await readCursorUsageLimits(
      { env: { CURSOR_API_KEY: "key" }, keychainToken: "kc", signal },
      { fetch: fetchMock as never, now: () => NOW, readFile: noFile },
    );
    expect(result.limits.unavailable?.reason).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the CLI auth file", async () => {
    const readFile = mock(async (target: string) => {
      if (target === "/home/me/.cursor/auth.json") {
        return JSON.stringify({ accessToken: "file-token" });
      }
      throw new Error("missing");
    });
    const fetchMock = createFetch(
      jsonResponse({ planUsage: { totalPercentUsed: 5 } }),
    );
    const result = await readCursorUsageLimits(
      { env: { HOME: "/home/me" }, keychainToken: null, signal },
      {
        fetch: fetchMock as never,
        now: () => NOW,
        platform: "darwin",
        readFile,
      },
    );
    expect(result.source).toBe("file");
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)
        .authorization,
    ).toBe("Bearer file-token");
  });

  it("asks for the Keychain on macOS instead of reading it", async () => {
    const fetchMock = createFetch(jsonResponse({}));
    const result = await readCursorUsageLimits(
      { env: { HOME: "/home/me" }, keychainToken: null, signal },
      {
        fetch: fetchMock as never,
        now: () => NOW,
        platform: "darwin",
        readFile: noFile,
      },
    );
    expect(result.limits.unavailable).toEqual(
      expect.objectContaining({
        action: "read-keychain",
        reason: "unsupported",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const linux = await readCursorUsageLimits(
      { env: { HOME: "/home/me" }, keychainToken: null, signal },
      { fetch: fetchMock as never, platform: "linux", readFile: noFile },
    );
    expect(linux.limits.unavailable?.action).toBeUndefined();
  });

  it("uses a Keychain token only with Cursor's own endpoint", async () => {
    const fetchMock = createFetch(
      jsonResponse({ planUsage: { totalPercentUsed: 5 } }),
    );
    const viaKeychain = await readCursorUsageLimits(
      { env: { HOME: "/home/me" }, keychainToken: "kc-token", signal },
      { fetch: fetchMock as never, platform: "darwin", readFile: noFile },
    );
    expect(viaKeychain.source).toBe("keychain");

    fetchMock.mockClear();
    const custom = await readCursorUsageLimits(
      {
        env: { CURSOR_API_ENDPOINT: "https://proxy.example", HOME: "/x" },
        keychainToken: "kc-token",
        signal,
      },
      { fetch: fetchMock as never, platform: "darwin", readFile: noFile },
    );
    expect(custom.limits.unavailable?.reason).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused token and failed reads", async () => {
    const refused = await readCursorUsageLimits(
      { env: {}, keychainToken: "kc-token", signal },
      {
        fetch: createFetch(jsonResponse({}, 401)) as never,
        platform: "darwin",
        readFile: noFile,
      },
    );
    expect(refused).toEqual(
      expect.objectContaining({ rejected: true, source: "keychain" }),
    );
    expect(refused.limits.unavailable?.reason).toBe("probeFailed");

    const offline = await readCursorUsageLimits(
      { env: { CURSOR_AUTH_TOKEN: "t" }, keychainToken: null, signal },
      {
        fetch: createFetch(() => Promise.reject(new Error("offline"))) as never,
        readFile: noFile,
      },
    );
    expect(offline.limits.unavailable?.reason).toBe("probeFailed");
    expect(offline.rejected).toBeFalse();
  });

  it("knows each platform's auth file", () => {
    expect(
      getCursorAuthFilePaths(
        { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
        { homeDirectory: "C:\\Users\\me", platform: "win32" },
      )[0],
    ).toContain("Cursor");
    expect(
      getCursorAuthFilePaths(
        { XDG_CONFIG_HOME: "/xdg" },
        { homeDirectory: "/home/me", platform: "linux" },
      ),
    ).toEqual(["/xdg/cursor/auth.json", "/home/me/.cursor/auth.json"]);
  });
});
