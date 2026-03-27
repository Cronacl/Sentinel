// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const runThreadChat = mock(async () => new Response(null, { status: 204 }));
const computeNextRunAt = mock(() => new Date("2026-03-14T09:00:00.000Z"));
const db: Record<string, any> = {};

mock.module("@/server/db", () => ({
  db,
  vectorDb: null,
}));

mock.module("@/lib/ai/chat", () => ({
  runThreadChat,
}));

mock.module("./schedule-utils", () => ({
  computeNextRunAt,
}));

const { executeAutomationRun } = await import("./runner");
mock.restore();

describe("executeAutomationRun", () => {
  let insertedValues: unknown[];
  let updatedValues: unknown[];

  beforeEach(() => {
    insertedValues = [];
    updatedValues = [];

    runThreadChat.mockClear();
    computeNextRunAt.mockClear();

    db.insert = mock(() => ({
      values: (value: unknown) => ({
        run: () => {
          insertedValues.push(value);
        },
      }),
    }));

    db.update = mock(() => ({
      set: (value: unknown) => ({
        where: () => ({
          run: () => {
            updatedValues.push(value);
          },
        }),
      }),
    }));
  });

  it("fails fast and pauses active automations when the workspace is archived", async () => {
    db.query = {
      automations: {
        findFirst: mock(async () => ({
          chatEngine: "sentinel",
          id: "automation-1",
          prompt: "Review the codebase.",
          reasoningEffort: "medium",
          scheduleCron: null,
          scheduleDayOfWeek: null,
          scheduleTime: "09:00",
          scheduleType: "daily",
          status: "active",
          title: "Daily review",
          userId: "user-1",
          workspace: {
            id: "workspace-1",
            isArchived: true,
          },
          workspaceId: "workspace-1",
        })),
      },
    };

    db.transaction = mock(() => {
      throw new Error("transaction should not be reached");
    });

    await executeAutomationRun("automation-1");

    expect(runThreadChat).not.toHaveBeenCalled();
    expect(insertedValues).toEqual([
      expect.objectContaining({
        automationId: "automation-1",
        error: "This automation's workspace is archived or unavailable.",
        status: "failed",
      }),
    ]);
    expect(updatedValues).toEqual([
      expect.objectContaining({
        nextRunAt: null,
        status: "paused",
      }),
    ]);
  });

  it("skips starting a new run when another run is already in progress", async () => {
    db.query = {
      automations: {
        findFirst: mock(async () => ({
          chatEngine: "sentinel",
          id: "automation-1",
          prompt: "Review the codebase.",
          reasoningEffort: "medium",
          scheduleCron: null,
          scheduleDayOfWeek: null,
          scheduleTime: "09:00",
          scheduleType: "daily",
          status: "active",
          title: "Daily review",
          userId: "user-1",
          workspace: {
            id: "workspace-1",
            isArchived: false,
          },
          workspaceId: "workspace-1",
        })),
      },
    };

    db.transaction = mock((callback: (tx: Record<string, any>) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => ({ id: "run-1" }),
            }),
          }),
        }),
      }),
    );

    await executeAutomationRun("automation-1");

    expect(runThreadChat).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
    expect(updatedValues).toHaveLength(0);
  });

  it("pauses active automations after a runtime failure", async () => {
    db.query = {
      automations: {
        findFirst: mock(async () => ({
          chatEngine: "sentinel",
          id: "automation-1",
          prompt: "Review the codebase.",
          reasoningEffort: "medium",
          scheduleCron: null,
          scheduleDayOfWeek: null,
          scheduleTime: "09:00",
          scheduleType: "daily",
          status: "active",
          title: "Daily review",
          userId: "user-1",
          workspace: {
            id: "workspace-1",
            isArchived: false,
          },
          workspaceId: "workspace-1",
        })),
      },
    };

    db.transaction = mock((callback: (tx: Record<string, any>) => unknown) =>
      callback({
        insert: () => ({
          values: () => ({
            run: () => undefined,
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => null,
            }),
          }),
        }),
      }),
    );

    runThreadChat.mockImplementationOnce(async () => {
      throw new Error("Provider request failed");
    });

    await executeAutomationRun("automation-1");

    expect(updatedValues).toEqual([
      expect.objectContaining({
        completedAt: expect.any(Date),
        error: "Provider request failed",
        status: "failed",
      }),
      expect.objectContaining({
        nextRunAt: null,
        status: "paused",
      }),
    ]);
  });

  it("routes codex automations through the codex chat engine", async () => {
    db.query = {
      automations: {
        findFirst: mock(async () => ({
          chatEngine: "codex",
          id: "automation-1",
          modelId: "gpt-5.4",
          prompt: "Review the codebase.",
          reasoningEffort: "medium",
          scheduleCron: null,
          scheduleDayOfWeek: null,
          scheduleTime: "09:00",
          scheduleType: "daily",
          status: "active",
          title: "Daily review",
          userId: "user-1",
          workspace: {
            id: "workspace-1",
            isArchived: false,
          },
          workspaceId: "workspace-1",
        })),
      },
    };

    db.transaction = mock((callback: (tx: Record<string, any>) => unknown) =>
      callback({
        insert: () => ({
          values: () => ({
            run: () => undefined,
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => null,
            }),
          }),
        }),
      }),
    );

    await executeAutomationRun("automation-1");

    expect(runThreadChat).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "codex",
        modelId: "gpt-5.4",
      }),
      "user-1",
    );
  });

  it("routes Claude automations through the Claude chat engine", async () => {
    db.query = {
      automations: {
        findFirst: mock(async () => ({
          chatEngine: "claude",
          id: "automation-1",
          modelId: "claude-sonnet-4-5-20250929",
          prompt: "Review the codebase.",
          reasoningEffort: "high",
          scheduleCron: null,
          scheduleDayOfWeek: null,
          scheduleTime: "09:00",
          scheduleType: "daily",
          status: "active",
          title: "Daily review",
          userId: "user-1",
          workspace: {
            id: "workspace-1",
            isArchived: false,
          },
          workspaceId: "workspace-1",
        })),
      },
    };

    db.transaction = mock((callback: (tx: Record<string, any>) => unknown) =>
      callback({
        insert: () => ({
          values: () => ({
            run: () => undefined,
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              get: () => null,
            }),
          }),
        }),
      }),
    );

    await executeAutomationRun("automation-1");

    expect(runThreadChat).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "claude",
        modelId: "claude-sonnet-4-5-20250929",
      }),
      "user-1",
    );
  });
});
