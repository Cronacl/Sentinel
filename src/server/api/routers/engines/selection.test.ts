import { describe, expect, it, mock } from "bun:test";

const instances: Record<string, { driver: string; id: string }> = {
  "codex-work": { driver: "codex", id: "codex-work" },
};
const get = mock(async (_userId: string, instanceId: string) =>
  instances[instanceId]
    ? { instance: instances[instanceId], status: "available" }
    : null,
);
mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => ({ get }),
}));

const { assertEngineInstanceSelection } = await import("./selection");

describe("assertEngineInstanceSelection", () => {
  it("accepts no instance and the engine's default without a lookup", async () => {
    await assertEngineInstanceSelection("user-1", "codex", undefined);
    await assertEngineInstanceSelection("user-1", "codex", null);
    await assertEngineInstanceSelection("user-1", "codex", "codex");
    expect(get).not.toHaveBeenCalled();
  });

  it("accepts an existing instance of the engine", async () => {
    await expect(
      assertEngineInstanceSelection("user-1", "codex", "codex-work"),
    ).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledWith("user-1", "codex-work");
  });

  it("refuses another driver's instance or a missing one", async () => {
    await expect(
      assertEngineInstanceSelection("user-1", "claude", "codex-work"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      assertEngineInstanceSelection("user-1", "codex", "codex-gone"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
