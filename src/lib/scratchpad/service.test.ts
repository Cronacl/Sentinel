// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

mock.module("@/server/db", () => ({
  db: null,
  vectorDb: null,
}));

const disposeShellSession = mock(async () => {});

mock.module("@/lib/ai/chat", () => ({
  runThreadChat: mock(async () => new Response(null, { status: 200 })),
}));

mock.module("@/lib/ai/chat/tools/shell", () => ({
  disposeShellSession,
}));

const {
  createScratchpadTask,
  deleteScratchpadTask,
  listScratchpad,
  resolveScratchpadTaskThread,
} = await import("./service");
mock.restore();

function createScratchpadTestDb() {
  const sqlite = new SQLiteDatabase(":memory:");
  sqlite.exec(`
    CREATE TABLE "thread" (
      "id" text PRIMARY KEY NOT NULL,
      "workspace_id" text NOT NULL,
      "user_id" text NOT NULL,
      "title" text NOT NULL,
      "summary" text,
      "visibility" text DEFAULT 'visible' NOT NULL,
      "parent_thread_id" text,
      "virtual_key" text,
      "delegation_id" text,
      "source_virtual_thread_id" text,
      "mode" text DEFAULT 'chat' NOT NULL,
      "chat_engine" text DEFAULT 'sentinel' NOT NULL,
      "chat_engine_state" text,
      "chat_model_id" text,
      "chat_reasoning_effort" text,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL,
      "archived_at" integer,
      "pinned_at" integer,
      "active_stream_id" text,
      "context_compaction_summary" text,
      "context_compaction_covered_through_message_id" text,
      "context_compaction_updated_at" integer,
      "status" text DEFAULT 'idle' NOT NULL
    );

    CREATE TABLE "thread_message" (
      "id" text PRIMARY KEY NOT NULL,
      "thread_id" text NOT NULL,
      "message_id" text NOT NULL,
      "role" text NOT NULL,
      "parts" text NOT NULL,
      "metadata" text,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    );

    CREATE TABLE "thread_plan_question" (
      "id" text PRIMARY KEY NOT NULL,
      "thread_id" text NOT NULL,
      "questions" text NOT NULL,
      "response" text,
      "status" text DEFAULT 'pending' NOT NULL,
      "answered_at" integer,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    );

    CREATE TABLE "scratchpad" (
      "id" text PRIMARY KEY NOT NULL,
      "workspace_id" text NOT NULL,
      "user_id" text NOT NULL,
      "hub_thread_id" text,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    );

    CREATE TABLE "scratchpad_task" (
      "id" text PRIMARY KEY NOT NULL,
      "scratchpad_id" text NOT NULL,
      "title" text NOT NULL,
      "progress_text" text,
      "status" text DEFAULT 'pending' NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      "virtual_thread_id" text,
      "visible_thread_id" text,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    );
  `);

  return {
    drizzleDb: drizzle(sqlite, { schema }),
    sqlite,
  };
}

describe("scratchpad service", () => {
  it("creates tasks, schedules runs, and reuses the workspace hub thread", async () => {
    const { drizzleDb } = createScratchpadTestDb();
    const scheduleTaskRun = mock(() => {});

    const first = await createScratchpadTask({
      database: drizzleDb,
      scheduleTaskRun,
      title: "Search for latest AI coding app updates",
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    const second = await createScratchpadTask({
      database: drizzleDb,
      scheduleTaskRun,
      title: "Check release notes",
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    const scratchpad = await drizzleDb.query.scratchpads.findFirst({
      where: (table, { eq }) => eq(table.workspaceId, "workspace-1"),
    });
    const taskRows = await drizzleDb.query.scratchpadTasks.findMany({
      where: (table, { eq }) => eq(table.scratchpadId, scratchpad.id),
    });
    const hubThreads = await drizzleDb.query.threads.findMany({
      where: (table, { eq }) =>
        eq(table.parentThreadId, scratchpad.hubThreadId),
    });
    const visibleChildThreads = hubThreads.filter(
      (thread) => thread.visibility === "visible",
    );
    const virtualThreads = hubThreads.filter(
      (thread) => thread.visibility === "virtual",
    );

    expect(scratchpad?.hubThreadId).toBeTruthy();
    expect(taskRows).toHaveLength(2);
    expect(hubThreads).toHaveLength(4);
    expect(visibleChildThreads).toHaveLength(2);
    expect(virtualThreads).toHaveLength(2);
    expect(
      visibleChildThreads.every((thread) => thread.title === "New thread"),
    ).toBe(true);
    expect(taskRows.every((task) => task.visibleThreadId)).toBe(true);
    expect(first.virtualThreadId).toBeTruthy();
    expect(first.visibleThreadId).toBeTruthy();
    expect(second.virtualThreadId).toBeTruthy();
    expect(second.visibleThreadId).toBeTruthy();
    expect(scheduleTaskRun).toHaveBeenCalledTimes(2);
    expect(scheduleTaskRun.mock.calls[0]?.[0]?.workspaceId).toBe("workspace-1");
  });

  it("derives completed state and summary text from the backing thread", async () => {
    const { drizzleDb } = createScratchpadTestDb();
    const now = new Date("2026-04-14T00:00:00.000Z");

    drizzleDb
      .insert(schema.scratchpads)
      .values({
        createdAt: now,
        hubThreadId: "hub-thread-1",
        id: "scratchpad-1",
        updatedAt: now,
        userId: "user-1",
        workspaceId: "workspace-1",
      })
      .run();

    drizzleDb
      .insert(schema.threads)
      .values({
        createdAt: now,
        id: "virtual-thread-1",
        mode: "chat",
        parentThreadId: "hub-thread-1",
        status: "idle",
        title: "Scratchpad: task",
        updatedAt: now,
        userId: "user-1",
        visibility: "virtual",
        workspaceId: "workspace-1",
      })
      .run();

    drizzleDb
      .insert(schema.scratchpadTasks)
      .values({
        createdAt: now,
        id: "task-1",
        progressText: "Thinking",
        scratchpadId: "scratchpad-1",
        sortOrder: 0,
        status: "running",
        title: "Check release notes",
        updatedAt: now,
        virtualThreadId: "virtual-thread-1",
      })
      .run();

    drizzleDb
      .insert(schema.threadMessages)
      .values({
        createdAt: now,
        id: "message-row-1",
        messageId: "message-1",
        metadata: { status: "completed" },
        parts: [
          {
            text: "Release notes are live and include the desktop refresh.",
            type: "text",
          },
        ],
        role: "assistant",
        threadId: "virtual-thread-1",
        updatedAt: now,
      })
      .run();

    const result = await listScratchpad({
      database: drizzleDb,
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: "task-1",
      status: "completed",
    });
    expect(result.tasks[0]?.progressText).toContain("desktop refresh");
  });

  it("uses the visible thread title when the task thread gets renamed", async () => {
    const { drizzleDb } = createScratchpadTestDb();
    const now = new Date("2026-04-14T00:00:00.000Z");

    drizzleDb
      .insert(schema.scratchpads)
      .values({
        createdAt: now,
        hubThreadId: "hub-thread-1",
        id: "scratchpad-1",
        updatedAt: now,
        userId: "user-1",
        workspaceId: "workspace-1",
      })
      .run();

    drizzleDb
      .insert(schema.threads)
      .values([
        {
          createdAt: now,
          id: "virtual-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          status: "idle",
          title: "Scratchpad: Search for Chetas Lua on X",
          updatedAt: now,
          userId: "user-1",
          visibility: "virtual",
          workspaceId: "workspace-1",
        },
        {
          createdAt: now,
          id: "visible-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          sourceVirtualThreadId: "virtual-thread-1",
          status: "idle",
          title: "Chetas Lua updates on X",
          updatedAt: new Date("2026-04-14T00:01:00.000Z"),
          userId: "user-1",
          visibility: "visible",
          workspaceId: "workspace-1",
        },
      ])
      .run();

    drizzleDb
      .insert(schema.scratchpadTasks)
      .values({
        createdAt: now,
        id: "task-1",
        progressText: "Thinking",
        scratchpadId: "scratchpad-1",
        sortOrder: 0,
        status: "running",
        title: "Search for Chetas Lua on X",
        updatedAt: now,
        virtualThreadId: "virtual-thread-1",
        visibleThreadId: "visible-thread-1",
      })
      .run();

    const result = await listScratchpad({
      database: drizzleDb,
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    expect(result.tasks[0]?.title).toBe("Chetas Lua updates on X");
    expect(result.tasks[0]?.visibleThreadId).toBe("visible-thread-1");
  });

  it("prefers a visible child thread and persists that linkage", async () => {
    const { drizzleDb } = createScratchpadTestDb();
    const now = new Date("2026-04-14T00:00:00.000Z");

    drizzleDb
      .insert(schema.scratchpads)
      .values({
        createdAt: now,
        hubThreadId: "hub-thread-1",
        id: "scratchpad-1",
        updatedAt: now,
        userId: "user-1",
        workspaceId: "workspace-1",
      })
      .run();

    drizzleDb
      .insert(schema.threads)
      .values([
        {
          createdAt: now,
          id: "virtual-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          status: "idle",
          title: "Scratchpad: task",
          updatedAt: now,
          userId: "user-1",
          visibility: "virtual",
          workspaceId: "workspace-1",
        },
        {
          createdAt: now,
          id: "visible-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          sourceVirtualThreadId: "virtual-thread-1",
          status: "awaiting_approval",
          title: "Scratchpad approval",
          updatedAt: new Date("2026-04-14T00:01:00.000Z"),
          userId: "user-1",
          visibility: "visible",
          workspaceId: "workspace-1",
        },
      ])
      .run();

    drizzleDb
      .insert(schema.scratchpadTasks)
      .values({
        createdAt: now,
        id: "task-1",
        scratchpadId: "scratchpad-1",
        sortOrder: 0,
        status: "blocked",
        title: "Check release notes",
        updatedAt: now,
        virtualThreadId: "virtual-thread-1",
      })
      .run();

    const resolved = await resolveScratchpadTaskThread({
      database: drizzleDb,
      taskId: "task-1",
      userId: "user-1",
    });

    const stored = await drizzleDb.query.scratchpadTasks.findFirst({
      where: (table, { eq }) => eq(table.id, "task-1"),
    });

    expect(resolved).toEqual({
      threadId: "visible-thread-1",
      visibility: "visible",
    });
    expect(stored?.visibleThreadId).toBe("visible-thread-1");
  });

  it("archives the backing threads when deleting a task", async () => {
    const { drizzleDb } = createScratchpadTestDb();
    const now = new Date("2026-04-14T00:00:00.000Z");

    disposeShellSession.mockReset();

    drizzleDb
      .insert(schema.scratchpads)
      .values({
        createdAt: now,
        hubThreadId: "hub-thread-1",
        id: "scratchpad-1",
        updatedAt: now,
        userId: "user-1",
        workspaceId: "workspace-1",
      })
      .run();

    drizzleDb
      .insert(schema.threads)
      .values([
        {
          createdAt: now,
          id: "virtual-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          status: "idle",
          title: "Scratchpad: task",
          updatedAt: now,
          userId: "user-1",
          visibility: "virtual",
          workspaceId: "workspace-1",
        },
        {
          createdAt: now,
          id: "visible-thread-1",
          mode: "chat",
          parentThreadId: "hub-thread-1",
          sourceVirtualThreadId: "virtual-thread-1",
          status: "idle",
          title: "Generated title",
          updatedAt: now,
          userId: "user-1",
          visibility: "visible",
          workspaceId: "workspace-1",
        },
      ])
      .run();

    drizzleDb
      .insert(schema.scratchpadTasks)
      .values({
        createdAt: now,
        id: "task-1",
        scratchpadId: "scratchpad-1",
        sortOrder: 0,
        status: "running",
        title: "Check release notes",
        updatedAt: now,
        virtualThreadId: "virtual-thread-1",
        visibleThreadId: "visible-thread-1",
      })
      .run();

    const result = await deleteScratchpadTask({
      database: drizzleDb,
      taskId: "task-1",
      userId: "user-1",
    });

    const deletedTask = await drizzleDb.query.scratchpadTasks.findFirst({
      where: (table, { eq }) => eq(table.id, "task-1"),
    });
    const archivedThreads = await drizzleDb.query.threads.findMany({
      where: (table, { inArray }) =>
        inArray(table.id, ["virtual-thread-1", "visible-thread-1"]),
    });

    expect(deletedTask).toBeUndefined();
    expect(result.archivedThreadIds.sort()).toEqual(
      ["virtual-thread-1", "visible-thread-1"].sort(),
    );
    expect(archivedThreads.every((thread) => thread.archivedAt)).toBe(true);
    expect(disposeShellSession).toHaveBeenCalledTimes(2);
  });
});
