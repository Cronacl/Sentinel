import { beforeEach, describe, expect, it } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";
import { automations, threads, users } from "@/server/db/schema";

import { engineInstanceIdForEngineWrite } from "./instance-columns";

// Real SQLite: the helper is a SET expression that reads the row being
// updated, which a mocked db would not exercise.

// @ts-expect-error Bun test-only cache-busting import of the real module.
const { ensureTables } = await import("@/server/db/index.ts?instance-columns");

let sqlite: SQLiteDatabase;
let db: ReturnType<typeof drizzle<typeof schema>>;

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

function setThreadEngine(engine: string, instanceId?: string | null) {
  db.update(threads)
    .set({
      chatEngine: engine as never,
      chatEngineInstanceId: engineInstanceIdForEngineWrite({
        engine,
        engineColumn: threads.chatEngine,
        instanceColumn: threads.chatEngineInstanceId,
        instanceId,
      }),
    })
    .where(eq(threads.id, "t-1"))
    .run();

  return db
    .select({
      engine: threads.chatEngine,
      instanceId: threads.chatEngineInstanceId,
    })
    .from(threads)
    .where(eq(threads.id, "t-1"))
    .get();
}

describe("engineInstanceIdForEngineWrite", () => {
  it("keeps the instance while the driver stays and clears it on a change", () => {
    db.insert(threads)
      .values({
        chatEngine: "codex",
        chatEngineInstanceId: "codex-work",
        id: "t-1",
        title: "T",
        userId: "user-1",
        workspaceId: "ws-1",
      })
      .run();

    expect(setThreadEngine("codex")).toEqual({
      engine: "codex",
      instanceId: "codex-work",
    });
    expect(setThreadEngine("claude")).toEqual({
      engine: "claude",
      instanceId: null,
    });
    expect(setThreadEngine("claude", "claude-work")).toEqual({
      engine: "claude",
      instanceId: "claude-work",
    });
    // The default instance is stored as NULL.
    expect(setThreadEngine("claude", "claude")).toEqual({
      engine: "claude",
      instanceId: null,
    });
  });

  it("clears an automation's instance when its engine changes", () => {
    db.insert(automations)
      .values({
        chatEngine: "codex",
        chatEngineInstanceId: "codex-work",
        id: "a-1",
        prompt: "p",
        title: "A",
        userId: "user-1",
      })
      .run();

    const update = (engine: "claude" | "codex") =>
      db
        .update(automations)
        .set({
          chatEngine: engine,
          chatEngineInstanceId: engineInstanceIdForEngineWrite({
            engine,
            engineColumn: automations.chatEngine,
            instanceColumn: automations.chatEngineInstanceId,
          }),
        })
        .where(eq(automations.id, "a-1"))
        .returning({ instanceId: automations.chatEngineInstanceId })
        .get();

    expect(update("codex")).toEqual({ instanceId: "codex-work" });
    expect(update("claude")).toEqual({ instanceId: null });
  });

  it("reads a NULL user default engine as sentinel", () => {
    sqlite.exec(`
      UPDATE "user" SET "default_chat_engine" = NULL,
        "default_chat_engine_instance_id" = 'sentinel-local'
        WHERE "id" = 'user-1';
    `);

    const update = (engine: "codex" | "sentinel") =>
      db
        .update(users)
        .set({
          defaultChatEngine: engine,
          defaultChatEngineInstanceId: engineInstanceIdForEngineWrite({
            engine,
            engineColumn: users.defaultChatEngine,
            instanceColumn: users.defaultChatEngineInstanceId,
          }),
        })
        .where(eq(users.id, "user-1"))
        .returning({ instanceId: users.defaultChatEngineInstanceId })
        .get();

    expect(update("sentinel")).toEqual({ instanceId: "sentinel-local" });
    expect(update("codex")).toEqual({ instanceId: null });
  });
});
