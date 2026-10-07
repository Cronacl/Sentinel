import { afterEach, describe, expect, it, mock } from "bun:test";

const shutdownAgentProcesses = mock(async () => ({ forced: 1, signalled: 3 }));

const disposeAllInstanceResources = mock(async () => {});

mock.module("@/lib/runtime/process/shutdown", () => ({
  shutdownAgentProcesses,
}));
mock.module("@/lib/ai/chat/engines/platform/instance-resources", () => ({
  disposeAllInstanceResources,
}));

const { POST } = await import("./route");

const TOKEN = "f".repeat(64);
const originalToken = process.env.SENTINEL_INTERNAL_TOKEN;

afterEach(() => {
  shutdownAgentProcesses.mockClear();
  disposeAllInstanceResources.mockClear();
  if (originalToken === undefined) {
    delete process.env.SENTINEL_INTERNAL_TOKEN;
  } else {
    process.env.SENTINEL_INTERNAL_TOKEN = originalToken;
  }
});

function request(token?: string) {
  return new Request("http://127.0.0.1:3232/api/internal/shutdown-agents", {
    headers: token ? { "x-sentinel-internal-token": token } : {},
    method: "POST",
  });
}

describe("POST /api/internal/shutdown-agents", () => {
  it("ends the server's agents for Electron main", async () => {
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    const response = await POST(request(TOKEN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      forced: 1,
      ok: true,
      signalled: 3,
    });
    expect(shutdownAgentProcesses).toHaveBeenCalledTimes(1);
    expect(disposeAllInstanceResources).toHaveBeenCalledTimes(1);
  });

  it("still ends registered agents when a runtime does not stop in time", async () => {
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;
    disposeAllInstanceResources.mockImplementationOnce(
      () => new Promise<void>(() => {}),
    );

    const response = await POST(request(TOKEN));

    expect(response.status).toBe(200);
    expect(shutdownAgentProcesses).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing or wrong token", async () => {
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    expect((await POST(request())).status).toBe(403);
    expect((await POST(request("e".repeat(64)))).status).toBe(403);
    expect(shutdownAgentProcesses).not.toHaveBeenCalled();
    expect(disposeAllInstanceResources).not.toHaveBeenCalled();
  });

  it("does not exist without a configured token", async () => {
    delete process.env.SENTINEL_INTERNAL_TOKEN;

    expect((await POST(request(TOKEN))).status).toBe(404);
    expect(shutdownAgentProcesses).not.toHaveBeenCalled();
  });
});
