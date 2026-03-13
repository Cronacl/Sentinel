// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

mock.module("@/server/db", () => ({
  db: null,
}));

const { getThreadPlanState, upsertThreadPlan } = await import("./service");

function createPlanTestDb() {
  const sqlite = new SQLiteDatabase(":memory:");
  sqlite.exec(`
    CREATE TABLE "thread" (
      "id" text PRIMARY KEY NOT NULL,
      "workspace_id" text NOT NULL,
      "user_id" text NOT NULL,
      "title" text NOT NULL,
      "summary" text,
      "mode" text DEFAULT 'chat' NOT NULL,
      "chat_model_id" text,
      "chat_reasoning_effort" text,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL,
      "archived_at" integer,
      "pinned_at" integer,
      "active_stream_id" text
    );

    CREATE TABLE "thread_plan" (
      "id" text PRIMARY KEY NOT NULL,
      "thread_id" text NOT NULL,
      "title" text NOT NULL,
      "goal" text NOT NULL,
      "summary" text NOT NULL,
      "audience" text DEFAULT 'technical' NOT NULL,
      "document" text DEFAULT '' NOT NULL,
      "created_at" integer NOT NULL,
      "updated_at" integer NOT NULL
    );

    CREATE TABLE "thread_plan_task" (
      "id" text PRIMARY KEY NOT NULL,
      "plan_id" text NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "status" text DEFAULT 'pending' NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
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
  `);

  return {
    drizzleDb: drizzle(sqlite, { schema }),
    sqlite,
  };
}

describe("plan service", () => {
  it("backfills and persists a markdown document for legacy plans", async () => {
    const { drizzleDb } = createPlanTestDb();
    const now = new Date();

    drizzleDb.insert(schema.threadPlans).values({
      audience: "technical",
      createdAt: now,
      document: "",
      goal: "Ship richer plan mode",
      id: "plan-1",
      summary: "Upgrade plan rendering and persistence",
      threadId: "thread-1",
      title: "Legacy plan",
      updatedAt: now,
    }).run();

    drizzleDb.insert(schema.threadPlanTasks).values({
      createdAt: now,
      description: "Store the markdown document",
      id: "task-1",
      planId: "plan-1",
      sortOrder: 0,
      status: "pending",
      title: "Update persistence",
      updatedAt: now,
    }).run();

    const result = await getThreadPlanState({
      database: drizzleDb,
      threadId: "thread-1",
    });

    expect(result.plan?.audience).toBe("technical");
    expect(result.plan?.document).toContain("# Legacy plan");
    expect(result.plan?.document).toContain("## Work Breakdown");

    const stored = await drizzleDb.query.threadPlans.findFirst({
      where: (table, { eq }) => eq(table.id, "plan-1"),
    });
    expect(stored?.document).toContain("# Legacy plan");
  });

  it("persists audience and markdown document on upsert", async () => {
    const { drizzleDb } = createPlanTestDb();
    const now = new Date();

    drizzleDb.insert(schema.threads).values({
      createdAt: now,
      id: "thread-1",
      title: "Thread title",
      updatedAt: now,
      userId: "user-1",
      workspaceId: "workspace-1",
    }).run();

    const result = await upsertThreadPlan({
      audience: "general",
      database: drizzleDb,
      document: "# Rollout plan\n\n## Overview\n\nCommunicate the change clearly.",
      goal: "Explain the feature clearly",
      summary: "A public-facing rollout plan",
      tasks: [{ title: "Draft announcement" }],
      threadId: "thread-1",
      title: "Rollout plan",
    });

    expect(result.plan?.audience).toBe("general");
    expect(result.plan?.document).toContain("# Rollout plan");

    const stored = await drizzleDb.query.threadPlans.findFirst({
      where: (table, { eq }) => eq(table.threadId, "thread-1"),
    });
    expect(stored).toMatchObject({
      audience: "general",
      document: "# Rollout plan\n\n## Overview\n\nCommunicate the change clearly.",
    });
  });

  it("falls back to a generated document when an upsert payload is missing one", async () => {
    const { drizzleDb } = createPlanTestDb();
    const now = new Date();

    drizzleDb.insert(schema.threads).values({
      createdAt: now,
      id: "thread-2",
      title: "Thread title",
      updatedAt: now,
      userId: "user-1",
      workspaceId: "workspace-1",
    }).run();

    const result = await upsertThreadPlan({
      audience: "technical",
      database: drizzleDb,
      document: undefined,
      goal: "Ship plan mode safely",
      summary: undefined,
      tasks: [{ title: "Inspect the current plan flow" }],
      threadId: "thread-2",
      title: "Plan mode resilience",
    });

    expect(result.plan?.document).toContain("# Plan mode resilience");
    expect(result.plan?.document).toContain("## Work Breakdown");
    expect(result.plan?.summary).toBe("Ship plan mode safely");
  });
});
