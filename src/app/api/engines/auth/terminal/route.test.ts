import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const SPEC = {
  args: ["auth", "login"],
  command: "/opt/bin/claude",
  cwd: "/Users/me",
  env: { PATH: "/usr/bin" },
  title: "Claude sign-in",
};
const TICKET = "b".repeat(64);
const redeemTerminalTicket = mock((ticket: string) =>
  ticket === TICKET ? SPEC : null,
);
mock.module("@/lib/ai/chat/engines/platform/auth/flow-store", () => ({
  getEngineAuthFlowStore: () => ({ redeemTerminalTicket }),
}));

const { POST } = await import("./route");

const TOKEN = "f".repeat(64);
const originalToken = process.env.SENTINEL_INTERNAL_TOKEN;

afterEach(() => {
  redeemTerminalTicket.mockClear();
  if (originalToken === undefined) {
    delete process.env.SENTINEL_INTERNAL_TOKEN;
  } else {
    process.env.SENTINEL_INTERNAL_TOKEN = originalToken;
  }
});

function request(body: unknown, token?: string) {
  return new Request("http://127.0.0.1:3232/api/engines/auth/terminal", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-sentinel-internal-token": token } : {}),
    },
    method: "POST",
  });
}

describe("POST /api/engines/auth/terminal", () => {
  it("answers the command a ticket stands for", async () => {
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    const response = await POST(request({ ticket: TICKET }, TOKEN));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(SPEC);
    expect(redeemTerminalTicket).toHaveBeenCalledWith(TICKET);
  });

  it("requires Electron's token when the server has one", async () => {
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    expect((await POST(request({ ticket: TICKET }))).status).toBe(403);
    expect(
      (await POST(request({ ticket: TICKET }, "e".repeat(64)))).status,
    ).toBe(403);
    expect(redeemTerminalTicket).not.toHaveBeenCalled();
  });

  it("accepts the ticket alone on a server without a token (dev)", async () => {
    delete process.env.SENTINEL_INTERNAL_TOKEN;

    expect((await POST(request({ ticket: TICKET }))).status).toBe(200);
  });

  it("answers 404 for unknown or malformed tickets", async () => {
    delete process.env.SENTINEL_INTERNAL_TOKEN;

    expect((await POST(request({ ticket: "c".repeat(64) }))).status).toBe(404);
    expect((await POST(request({ ticket: "../etc" }))).status).toBe(404);
    expect((await POST(request("not json"))).status).toBe(404);
    expect(redeemTerminalTicket).toHaveBeenCalledTimes(1);
  });
});
