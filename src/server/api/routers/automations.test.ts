// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const computeNextRunAt = mock(() => new Date("2026-03-14T09:00:00.000Z"));
const scheduleAutomation = mock(() => undefined);
const unscheduleAutomation = mock(() => undefined);
const pauseAutomation = mock(() => undefined);
const executeAutomationRun = mock(() => Promise.resolve());
const getOwnedWorkspaceOrThrow = mock(async (_ctx, workspaceId) => ({
  id: workspaceId,
  isArchived: false,
  userId: "user-1",
}));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    query: (handler: any) => handler,
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    mutation: (handler: any) => handler,
  },
}));

mock.module("@/lib/automations/schedule-utils", () => ({
  computeNextRunAt,
}));

mock.module("@/lib/automations/scheduler", () => ({
  pauseAutomation,
  scheduleAutomation,
  unscheduleAutomation,
}));

mock.module("@/lib/automations/runner", () => ({
  executeAutomationRun,
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedWorkspaceOrThrow,
}));

const { automationsRouter } = await import("./automations");

beforeEach(() => {
  computeNextRunAt.mockClear();
  scheduleAutomation.mockClear();
  unscheduleAutomation.mockClear();
  pauseAutomation.mockClear();
  executeAutomationRun.mockClear();
  getOwnedWorkspaceOrThrow.mockClear();
});

describe("automationsRouter", () => {
  it("resolves the selected workspace when create uses the current workspace option", async () => {
    const returning = mock(async () => [
      { id: "automation-1", workspaceId: "workspace-1" },
    ]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));

    const result = await automationsRouter.create({
      ctx: {
        db: { insert },
        user: { id: "user-1", selectedWorkspaceId: "workspace-1" },
        workspace: { id: "workspace-1" },
      },
      input: {
        chatEngine: "codex",
        modelId: "openai:gpt-5.2",
        prompt: "Review the codebase.",
        reasoningEffort: "medium",
        scheduleTime: "09:00",
        scheduleType: "daily",
        title: "Daily review",
        workspaceId: null,
      },
    });

    expect(getOwnedWorkspaceOrThrow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace-1",
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        chatEngine: "codex",
        workspaceId: "workspace-1",
      }),
    );
    expect(result).toEqual({ id: "automation-1", workspaceId: "workspace-1" });
  });

  it("allows manual runs for paused automations", async () => {
    const findFirst = mock(async () => ({ id: "automation-1" }));

    const result = await automationsRouter.runNow({
      ctx: {
        db: {
          query: {
            automations: {
              findFirst,
            },
          },
        },
        user: { id: "user-1" },
      },
      input: {
        id: "automation-1",
      },
    });

    expect(executeAutomationRun).toHaveBeenCalledWith("automation-1", {
      allowPaused: true,
    });
    expect(result).toEqual({ triggered: true });
  });
});
