import { describe, expect, it, mock } from "bun:test";

import {
  createInternalToken,
  INTERNAL_TOKEN_HEADER,
  requestAgentShutdown,
} from "./agent-shutdown.mjs";

describe("requestAgentShutdown", () => {
  it("asks the server to end its agents with the launch token", async () => {
    const fetchImpl = mock(
      async (_url: URL, _init: RequestInit) => new Response("{}"),
    );

    expect(
      await requestAgentShutdown(
        { internalToken: "t".repeat(64), url: "http://localhost:3232" },
        { fetchImpl },
      ),
    ).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "http://localhost:3232/api/internal/shutdown-agents",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ [INTERNAL_TOKEN_HEADER]: "t".repeat(64) });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws and skips servers it did not start", async () => {
    const failing = mock(async () => {
      throw new Error("ECONNREFUSED");
    });

    expect(
      await requestAgentShutdown(
        { internalToken: "t".repeat(64), url: "http://localhost:3232" },
        { fetchImpl: failing },
      ),
    ).toBe(false);
    expect(
      await requestAgentShutdown(
        { url: "http://localhost:3000" },
        { fetchImpl: failing },
      ),
    ).toBe(false);
    expect(await requestAgentShutdown(null)).toBe(false);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout", async () => {
    const hanging = mock(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );

    expect(
      await requestAgentShutdown(
        { internalToken: "t".repeat(64), url: "http://localhost:3232" },
        { fetchImpl: hanging, timeoutMs: 10 },
      ),
    ).toBe(false);
  });

  it("creates a 64-character hex token per launch", () => {
    const token = createInternalToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(createInternalToken()).not.toBe(token);
  });
});
