import { createHash } from "node:crypto";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  OPENCODE_GO_USAGE_URL,
  getOpenCodeAuthFilePath,
  readOpenCodeGoUsageLimits,
} = await import("./opencode-go");

const NOW = Date.parse("2026-10-08T10:00:00.000Z");
const signal = new AbortController().signal;

const GO_AUTH = JSON.stringify({
  anthropic: { key: "other", type: "api" },
  "opencode-go": { key: "go-key", type: "api" },
});

function goResponse(status = 200) {
  return new Response(
    JSON.stringify({
      usage: {
        monthly: { percent: 70, resetsAt: "2026-11-01T00:00:00Z" },
        rolling: { percent: 10, resetsAt: "2026-10-08T15:00:00Z" },
        weekly: { percent: 30, resetsAt: "2026-10-12T00:00:00Z" },
      },
    }),
    { status },
  );
}

describe("OpenCode Go usage", () => {
  it("does nothing when Go is not configured", async () => {
    const fetchMock = mock(async () => goResponse());
    const missing = await readOpenCodeGoUsageLimits(
      { env: { HOME: "/home/me" }, signal },
      {
        fetch: fetchMock as never,
        now: () => NOW,
        readFile: async () => {
          throw new Error("missing");
        },
      },
    );
    const otherKeys = await readOpenCodeGoUsageLimits(
      { env: { HOME: "/home/me" }, signal },
      {
        fetch: fetchMock as never,
        readFile: async () =>
          JSON.stringify({ anthropic: { key: "k", type: "api" } }),
      },
    );

    expect(missing.unavailable?.reason).toBe("unsupported");
    expect(otherKeys.unavailable?.reason).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads Go windows with the configured key", async () => {
    const readFile = mock(async () => GO_AUTH);
    const fetchMock = mock(
      async (_url: string | URL | Request, _init?: RequestInit) => goResponse(),
    );
    const limits = await readOpenCodeGoUsageLimits(
      { env: { XDG_DATA_HOME: "/data" }, signal },
      { fetch: fetchMock as never, now: () => NOW, readFile },
    );

    expect(readFile).toHaveBeenCalledWith("/data/opencode/auth.json", "utf8");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(OPENCODE_GO_USAGE_URL);
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)
        .authorization,
    ).toBe("Bearer go-key");
    expect(
      limits.windows.map((window) => [window.id, window.usedPercent]),
    ).toEqual([
      ["go_rolling", 10],
      ["go_weekly", 30],
      ["go_monthly", 70],
    ]);
    expect(limits.credentialFingerprint).toBe(
      createHash("sha256").update("opencode-go\0go-key").digest("hex"),
    );
  });

  it("treats a key without a Go subscription as unsupported", async () => {
    const limits = await readOpenCodeGoUsageLimits(
      { env: { OPENCODE_AUTH_CONTENT: GO_AUTH }, signal },
      { fetch: (async () => goResponse(403)) as never },
    );
    expect(limits.unavailable?.reason).toBe("unsupported");
  });

  it("reports failed reads", async () => {
    const limits = await readOpenCodeGoUsageLimits(
      { env: { OPENCODE_AUTH_CONTENT: GO_AUTH }, signal },
      {
        fetch: (async () => {
          throw new Error("offline");
        }) as never,
      },
    );
    expect(limits.unavailable?.reason).toBe("probeFailed");
  });

  it("finds OpenCode's auth file under the data home", () => {
    expect(getOpenCodeAuthFilePath({ HOME: "/home/me" }, "/fallback")).toBe(
      "/home/me/.local/share/opencode/auth.json",
    );
  });
});
