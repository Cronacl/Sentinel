import { describe, expect, it } from "bun:test";

import { buildThreadQueryOptions } from "./thread-query-options";

describe("thread query options", () => {
  it("uses cached thread data as initial data while disabling previous-query placeholders", () => {
    const cachedThread = {
      messages: [],
      queuedFollowUps: [],
      thread: {
        activeRunId: null,
        archivedAt: null,
        chatEngine: "sentinel",
        chatModelId: null,
        chatReasoningEffort: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        id: "thread-1",
        mode: "chat",
        pinnedAt: null,
        status: "idle",
        summary: null,
        title: "Thread title",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      workspace: {
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        description: null,
        id: "workspace-1",
        name: "Workspace",
        permissionModeOverride: null,
        rootPath: null,
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    };

    const options = buildThreadQueryOptions(cachedThread as any);

    expect(options.initialData).toBe(cachedThread);
    expect(options.placeholderData()).toBeUndefined();
  });

  it("omits initialData when the target thread is not cached", () => {
    const options = buildThreadQueryOptions();

    expect("initialData" in options).toBe(false);
    expect(options.placeholderData()).toBeUndefined();
  });
});
