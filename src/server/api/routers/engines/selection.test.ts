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

const {
  assertEngineInstanceSelection,
  assertThreadEngineKept,
  isThreadEngineRebind,
} = await import("./selection");

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

describe("the thread engine lock", () => {
  const onSecondCodex = {
    chatEngine: "codex",
    chatEngineInstanceId: "codex-work",
  };
  const onDefaultCodex = { chatEngine: "codex", chatEngineInstanceId: null };

  it("treats the same instance, however it is written, as no rebind", () => {
    expect(isThreadEngineRebind(onSecondCodex, "codex", "codex-work")).toBe(
      false,
    );
    // Without an instance the write keeps the stored one.
    expect(isThreadEngineRebind(onSecondCodex, "codex", undefined)).toBe(false);
    // The default instance is stored as NULL and named by its driver.
    expect(isThreadEngineRebind(onDefaultCodex, "codex", "codex")).toBe(false);
    expect(isThreadEngineRebind(onDefaultCodex, "codex", null)).toBe(false);
  });

  it("detects another instance or another engine", () => {
    expect(isThreadEngineRebind(onSecondCodex, "codex", "codex")).toBe(true);
    expect(isThreadEngineRebind(onSecondCodex, "codex", null)).toBe(true);
    expect(isThreadEngineRebind(onDefaultCodex, "codex", "codex-work")).toBe(
      true,
    );
    expect(isThreadEngineRebind(onDefaultCodex, "claude", undefined)).toBe(
      true,
    );
  });

  it("refuses a rebind once the thread has messages", () => {
    expect(() =>
      assertThreadEngineKept({
        engine: "codex",
        hasMessages: true,
        instanceId: "codex",
        thread: onSecondCodex,
      }),
    ).toThrow(expect.objectContaining({ code: "CONFLICT" }));

    // An empty thread can still be moved, and a model change never counts.
    expect(() =>
      assertThreadEngineKept({
        engine: "codex",
        hasMessages: false,
        instanceId: "codex",
        thread: onSecondCodex,
      }),
    ).not.toThrow();
    expect(() =>
      assertThreadEngineKept({
        engine: "codex",
        hasMessages: true,
        instanceId: "codex-work",
        thread: onSecondCodex,
      }),
    ).not.toThrow();
  });
});
