import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { readClaudeUsageLimits } = await import("./usage");
const { getClaudeScopedLimitNames } = await import("../usage/claude");
const { makeFakeInstance } = await import("../contract/testing");

const instance = makeFakeInstance({ driver: "claude", id: "claude-work" });
const resolveRuntime = mock(async () => ({
  binaryDetected: true,
  binaryVersion: "2.1.300",
  env: {},
  executablePath: "/usr/local/bin/claude",
  source: "managed-path" as const,
}));

function fakeQuery(usage?: (options?: unknown) => Promise<unknown>) {
  const close = mock(() => {});
  const query = {
    close,
    initializationResult: async () => ({ models: [] }),
    ...(usage
      ? { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: usage }
      : {}),
  };
  return { close, query: mock(() => query as never) };
}

describe("readClaudeUsageLimits", () => {
  it("reads plan windows on an idle query and closes it", async () => {
    const usage = mock(async () => ({
      rate_limits: {
        five_hour: { resets_at: null, utilization: 20 },
        model_scoped: [
          { display_name: "Fable", resets_at: null, utilization: 5 },
        ],
      },
      rate_limits_available: true,
    }));
    const { close, query } = fakeQuery(usage);

    const limits = await readClaudeUsageLimits(
      instance,
      { signal: new AbortController().signal },
      { now: () => 0, query, resolveRuntime: resolveRuntime as never },
    );

    expect(usage).toHaveBeenCalledWith({ skipBehaviors: true });
    expect(limits.windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day_fable",
    ]);
    expect(getClaudeScopedLimitNames("claude-work")).toEqual({
      overageIncluded: "Fable",
    });
    expect(close).toHaveBeenCalledTimes(1);
    // The probe options: no turn, no MCP servers, no hooks.
    expect(query.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          maxTurns: 1,
          mcpServers: {},
          persistSession: false,
        }),
      }),
    );
  });

  it("reports an SDK without the usage request as unsupported", async () => {
    const { close, query } = fakeQuery();
    const limits = await readClaudeUsageLimits(
      instance,
      { signal: new AbortController().signal },
      { query, resolveRuntime: resolveRuntime as never },
    );
    expect(limits.unavailable?.reason).toBe("unsupported");
    expect(close).toHaveBeenCalled();
  });

  it("reports failures without throwing", async () => {
    const { query } = fakeQuery(async () => {
      throw new Error("not signed in");
    });
    const failed = await readClaudeUsageLimits(
      instance,
      { signal: new AbortController().signal },
      { query, resolveRuntime: resolveRuntime as never },
    );
    expect(failed.unavailable?.reason).toBe("probeFailed");

    const missing = await readClaudeUsageLimits(
      instance,
      { signal: new AbortController().signal },
      {
        query,
        resolveRuntime: (async () => ({
          ...(await resolveRuntime()),
          executablePath: null,
        })) as never,
      },
    );
    expect(missing.unavailable?.reason).toBe("probeFailed");
  });

  it("stops waiting when the read is aborted", async () => {
    const { close, query } = fakeQuery(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = readClaudeUsageLimits(
      instance,
      { signal: controller.signal },
      { query, resolveRuntime: resolveRuntime as never },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();

    expect((await pending).unavailable?.reason).toBe("probeFailed");
    expect(close).toHaveBeenCalled();
  });
});
