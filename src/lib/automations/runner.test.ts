// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const runThreadChat = mock(async () => new Response(null, { status: 204 }));
const computeNextRunAt = mock(() => new Date("2026-03-14T09:00:00.000Z"));
const db: Record<string, any> = {};

mock.module("@/server/db", () => ({
  db,
}));

mock.module("@/lib/ai/chat", () => ({
  runThreadChat,
}));

mock.module("./schedule-utils", () => ({
  computeNextRunAt,
}));

const { executeAutomationRun } = await import("./runner");

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
});
