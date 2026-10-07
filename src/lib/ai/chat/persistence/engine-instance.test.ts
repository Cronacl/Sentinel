import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

// Real SQLite behind the persistence helpers: the instance columns are
// written with SQL expressions that a mocked db would not exercise.

// @ts-expect-error Bun test-only cache-busting import of the real module.
const { ensureTables } = await import("@/server/db/index.ts?persistence-db");

let sqlite = new SQLiteDatabase(":memory:");
let db = drizzle(sqlite, { schema });

mock.module("@/server/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, property) => Reflect.get(db, property, db),
    },
  ),
}));

const invalidateThreadRuntimeBootstrap = mock(() => {});
mock.module("../runtime/workspace", () => ({
  invalidateThreadRuntimeBootstrap,
}));
mock.module("../runtime/workspace.ts", () => ({
  invalidateThreadRuntimeBootstrap,
}));

const {
  claimNextThreadFollowUp,
  enqueueThreadFollowUp,
  enqueueThreadFollowUpAtFront,
  ensureThread,
  ensureVirtualThread,
  loadThread,
  updateThreadChatSettings,
  // @ts-expect-error Bun test-only cache-busting import of the real module.
} = await import("./index.ts?persistence-engine-instance");

function storedInstance(threadId: string) {
  return sqlite
    .prepare(
      `SELECT "chat_engine", "chat_engine_instance_id" FROM "thread" WHERE "id" = ?`,
    )
    .get(threadId) as {
    chat_engine: string;
    chat_engine_instance_id: string | null;
  } | null;
}

beforeEach(() => {
  sqlite = new SQLiteDatabase(":memory:");
  db = drizzle(sqlite, { schema });
  ensureTables(db as never, sqlite as never);
  sqlite.exec(`
    INSERT INTO "user" ("id", "name", "email", "created_at", "updated_at")
      VALUES ('user-1', 'Me', 'me@local', 1, 1);
    INSERT INTO "workspace" ("id", "user_id", "name", "created_at", "updated_at")
      VALUES ('ws-1', 'user-1', 'Repo', 1, 1);
  `);
});

describe("thread engine instances", () => {
  it("stores NULL for the default instance and the id otherwise", async () => {
    await ensureThread("t-default", "user-1", "ws-1", "A", "chat", "codex");
    await ensureThread(
      "t-explicit-default",
      "user-1",
      "ws-1",
      "B",
      "chat",
      "codex",
      null,
      "codex",
    );
    await ensureThread(
      "t-work",
      "user-1",
      "ws-1",
      "C",
      "chat",
      "codex",
      null,
      "codex-work",
    );

    expect(storedInstance("t-default")?.chat_engine_instance_id).toBeNull();
    expect(
      storedInstance("t-explicit-default")?.chat_engine_instance_id,
    ).toBeNull();
    expect(storedInstance("t-work")?.chat_engine_instance_id).toBe(
      "codex-work",
    );
    expect(await loadThread("t-work")).toMatchObject({
      chatEngine: "codex",
      chatEngineInstanceId: "codex-work",
    });
  });

  it("binds virtual threads to an instance", async () => {
    await ensureThread("parent", "user-1", "ws-1", "P", "chat", "claude");
    const childId = await ensureVirtualThread({
      engine: "claude",
      engineInstanceId: "claude-work",
      parentThreadId: "parent",
      title: "Child",
      userId: "user-1",
      workspaceId: "ws-1",
    });

    expect(storedInstance(childId)).toEqual({
      chat_engine: "claude",
      chat_engine_instance_id: "claude-work",
    });
  });

  it("keeps the instance while the driver stays and drops it when the driver changes", async () => {
    await ensureThread(
      "t-work",
      "user-1",
      "ws-1",
      "C",
      "chat",
      "codex",
      null,
      "codex-work",
    );

    updateThreadChatSettings("t-work", { engine: "codex", modelId: "m" });
    expect(storedInstance("t-work")?.chat_engine_instance_id).toBe(
      "codex-work",
    );

    updateThreadChatSettings("t-work", { modelId: "m2" });
    expect(storedInstance("t-work")?.chat_engine_instance_id).toBe(
      "codex-work",
    );

    updateThreadChatSettings("t-work", { engine: "claude" });
    expect(storedInstance("t-work")).toEqual({
      chat_engine: "claude",
      chat_engine_instance_id: null,
    });

    updateThreadChatSettings("t-work", {
      engine: "claude",
      engineInstanceId: "claude-work",
    });
    expect(storedInstance("t-work")?.chat_engine_instance_id).toBe(
      "claude-work",
    );

    updateThreadChatSettings("t-work", {
      engine: "claude",
      engineInstanceId: "claude",
    });
    expect(storedInstance("t-work")?.chat_engine_instance_id).toBeNull();
  });

  it("stores the thread's model options", async () => {
    await ensureThread("t-1", "user-1", "ws-1", "A", "chat", "opencode");

    updateThreadChatSettings("t-1", {
      modelOptions: [
        { id: "agent", value: "plan" },
        { id: "fast", value: true },
      ],
    });
    expect((await db.query.threads.findFirst())?.chatModelOptions).toEqual([
      { id: "agent", value: "plan" },
      { id: "fast", value: true },
    ]);

    updateThreadChatSettings("t-1", { modelOptions: null });
    expect((await db.query.threads.findFirst())?.chatModelOptions).toBeNull();
  });
});

describe("follow-up model options (G7)", () => {
  it("round-trips model options through the queue", async () => {
    await ensureThread("t-1", "user-1", "ws-1", "A", "chat", "opencode");

    enqueueThreadFollowUp({
      id: "f-2",
      modelId: "anthropic/claude",
      modelOptions: [{ id: "variant", value: "high" }],
      parts: [{ text: "second", type: "text" }],
      threadId: "t-1",
      threadMode: "chat",
    });
    enqueueThreadFollowUpAtFront({
      id: "f-1",
      modelId: "anthropic/claude",
      parts: [{ text: "first", type: "text" }],
      threadId: "t-1",
      threadMode: "chat",
    });

    expect(claimNextThreadFollowUp("t-1")).toMatchObject({
      id: "f-1",
      modelOptions: null,
    });
    expect(claimNextThreadFollowUp("t-1")).toMatchObject({
      id: "f-2",
      modelOptions: [{ id: "variant", value: "high" }],
    });
  });
});
