import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const resolve = mock(async (_userId: string, target: unknown) => ({
  id: "resolved",
  target,
}));
mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => ({ resolve }),
}));

const { getFollowUpModelRequestOptions, resolveThreadEngineInstance } =
  await import("./engine-instance");

describe("resolveThreadEngineInstance", () => {
  it("resolves the thread's own instance, NULL meaning the default", async () => {
    await resolveThreadEngineInstance("user-1", {
      chatEngine: "cursor",
      chatEngineInstanceId: "cursor-work",
    });
    await resolveThreadEngineInstance("user-1", {
      chatEngine: "cursor",
      chatEngineInstanceId: null,
    });

    expect(resolve.mock.calls).toEqual([
      ["user-1", { driver: "cursor", instanceId: "cursor-work" }],
      ["user-1", { driver: "cursor", instanceId: null }],
    ]);
  });
});

describe("getFollowUpModelRequestOptions", () => {
  it("restores the queued selections and the legacy fields they imply", () => {
    expect(
      getFollowUpModelRequestOptions({
        modelOptions: [
          { id: "agent", value: "plan" },
          { id: "variant", value: "high" },
        ],
        reasoningEffort: null,
      }),
    ).toEqual({
      modelOptions: [
        { id: "agent", value: "plan" },
        { id: "variant", value: "high" },
      ],
      openCode: { agent: "plan", variant: "high" },
    });
  });

  it("keeps follow-ups queued before model options existed unchanged", () => {
    expect(
      getFollowUpModelRequestOptions({
        modelOptions: null,
        reasoningEffort: "high",
      }),
    ).toEqual({ reasoningEffort: "high" });
    expect(getFollowUpModelRequestOptions({ reasoningEffort: null })).toEqual(
      {},
    );
  });
});
