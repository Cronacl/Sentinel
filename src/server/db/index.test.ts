import { describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { ensureTables } from "./index";
import * as schema from "./schema";

const CURRENT_USER_COLUMNS = [
  { name: "id" },
  { name: "name" },
  { name: "email" },
  { name: "email_verified" },
  { name: "image" },
  { name: "nickname" },
  { name: "occupation" },
  { name: "about_user" },
  { name: "personality_preset" },
  { name: "custom_instructions" },
  { name: "permission_mode" },
  { name: "persist_browser_session" },
  { name: "webfetch_batch_enabled" },
  { name: "webfetch_batch_limit" },
  { name: "context_compaction_enabled" },
  { name: "context_compaction_use_fixed_window" },
  { name: "context_compaction_fixed_window_size" },
  { name: "context_compaction_window_percent" },
  { name: "skills_base_path" },
  { name: "theme_preference" },
  { name: "code_theme" },
  { name: "accent_color" },
  { name: "ui_font_family" },
  { name: "code_font_family" },
  { name: "ui_font_size" },
  { name: "code_font_size" },
  { name: "default_chat_engine" },
  { name: "default_chat_model_id" },
  { name: "default_chat_mode" },
  { name: "default_chat_reasoning_effort" },
  { name: "voice_input_enabled" },
  { name: "voice_input_provider" },
  { name: "voice_input_model_id" },
  { name: "shortcut_overrides" },
  { name: "follow_up_behavior" },
  { name: "selected_workspace_id" },
  { name: "last_project_open_target_id" },
  { name: "thread_list_organize_by" },
  { name: "thread_list_sort_by" },
  { name: "created_at" },
  { name: "updated_at" },
];

const FRESH_INSTALL_USER_COLUMNS = [
  { name: "id" },
  { name: "name" },
  { name: "email" },
  { name: "email_verified" },
  { name: "image" },
  { name: "nickname" },
  { name: "occupation" },
  { name: "about_user" },
  { name: "personality_preset" },
  { name: "custom_instructions" },
  { name: "permission_mode" },
  { name: "persist_browser_session" },
  { name: "webfetch_batch_enabled" },
  { name: "webfetch_batch_limit" },
  { name: "context_compaction_enabled" },
  { name: "context_compaction_use_fixed_window" },
  { name: "context_compaction_fixed_window_size" },
  { name: "context_compaction_window_percent" },
  { name: "skills_base_path" },
  { name: "default_chat_engine" },
  { name: "default_chat_model_id" },
  { name: "default_chat_mode" },
  { name: "default_chat_reasoning_effort" },
  { name: "voice_input_enabled" },
  { name: "voice_input_provider" },
  { name: "voice_input_model_id" },
  { name: "follow_up_behavior" },
  { name: "selected_workspace_id" },
  { name: "last_project_open_target_id" },
  { name: "thread_list_organize_by" },
  { name: "thread_list_sort_by" },
  { name: "created_at" },
  { name: "updated_at" },
];

const LEGACY_USER_COLUMNS = [
  { name: "id" },
  { name: "name" },
  { name: "email" },
  { name: "email_verified" },
  { name: "image" },
  { name: "created_at" },
  { name: "updated_at" },
];

const LEGACY_AUTOMATION_COLUMNS = [
  { name: "id" },
  { name: "user_id" },
  { name: "workspace_id" },
  { name: "title" },
  { name: "prompt" },
  { name: "status" },
  { name: "schedule_type" },
  { name: "schedule_day_of_week" },
  { name: "schedule_time" },
  { name: "schedule_cron" },
  { name: "model_id" },
  { name: "reasoning_effort" },
  { name: "last_ran_at" },
  { name: "next_run_at" },
  { name: "created_at" },
  { name: "updated_at" },
];

const CURRENT_AUTOMATION_COLUMNS = [
  ...LEGACY_AUTOMATION_COLUMNS,
  { name: "chat_engine" },
];

const CURRENT_THREAD_COLUMNS = [
  { name: "id" },
  { name: "workspace_id" },
  { name: "user_id" },
  { name: "title" },
  { name: "summary" },
  { name: "visibility" },
  { name: "parent_thread_id" },
  { name: "virtual_key" },
  { name: "delegation_id" },
  { name: "source_virtual_thread_id" },
  { name: "mode" },
  { name: "chat_engine" },
  { name: "chat_engine_state" },
  { name: "chat_model_id" },
  { name: "chat_reasoning_effort" },
  { name: "created_at" },
  { name: "updated_at" },
  { name: "archived_at" },
  { name: "pinned_at" },
  { name: "active_stream_id" },
  { name: "context_compaction_summary" },
  { name: "context_compaction_covered_through_message_id" },
  { name: "context_compaction_updated_at" },
  { name: "status" },
];

const LEGACY_THREAD_COLUMNS = CURRENT_THREAD_COLUMNS.filter(
  ({ name }) => name !== "delegation_id",
);

const CURRENT_WORKSPACE_COLUMNS = [
  { name: "id" },
  { name: "user_id" },
  { name: "name" },
  { name: "kind" },
  { name: "root_path" },
  { name: "description" },
  { name: "permission_mode_override" },
  { name: "is_archived" },
  { name: "is_expanded" },
  { name: "sort_order" },
  { name: "created_at" },
  { name: "updated_at" },
];

function serializeRunSql(statement: unknown): string {
  if (
    statement &&
    typeof statement === "object" &&
    "queryChunks" in statement &&
    Array.isArray(statement.queryChunks)
  ) {
    return statement.queryChunks
      .map((chunk) => {
        if (
          chunk &&
          typeof chunk === "object" &&
          "value" in chunk &&
          Array.isArray(chunk.value)
        ) {
          return chunk.value.join("");
        }

        return "";
      })
      .join("");
  }

  return String(statement);
}

function createMocks({
  userColumns = CURRENT_USER_COLUMNS,
  automationColumns = CURRENT_AUTOMATION_COLUMNS,
  threadColumns = CURRENT_THREAD_COLUMNS,
  workspaceColumns = CURRENT_WORKSPACE_COLUMNS,
}: {
  userColumns?: Array<{ name: string }>;
  automationColumns?: Array<{ name: string }>;
  threadColumns?: Array<{ name: string }>;
  workspaceColumns?: Array<{ name: string }>;
} = {}) {
  const operations: string[] = [];
  const sqlite = {
    exec: mock((rawSql: string) => {
      operations.push(rawSql);
      return undefined;
    }),
    prepare: mock((sql: string) => ({
      all: () => {
        if (sql.includes('PRAGMA table_info("user")')) {
          return userColumns;
        }

        if (sql.includes('PRAGMA table_info("automation")')) {
          return automationColumns;
        }

        if (sql.includes('PRAGMA table_info("thread")')) {
          return threadColumns;
        }

        if (sql.includes('PRAGMA table_info("workspace")')) {
          return workspaceColumns;
        }

        return [];
      },
    })),
  };
  const db = {
    run: mock((statement: unknown) => {
      operations.push(serializeRunSql(statement));
      return undefined;
    }),
  };

  return { db, operations, sqlite };
}

describe("ensureTables", () => {
  it("adds missing automation chat_engine columns for legacy databases", () => {
    const { db, sqlite } = createMocks({
      automationColumns: LEGACY_AUTOMATION_COLUMNS,
    });

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "automation" ADD COLUMN "chat_engine" text DEFAULT 'sentinel' NOT NULL`,
    );
  });

  it("does not re-add automation chat_engine when the schema is already current", () => {
    const { db, sqlite } = createMocks();

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).not.toHaveBeenCalled();
  });

  it("backfills fresh-install user settings columns that were missing from bootstrap SQL", () => {
    const { db, sqlite } = createMocks({
      userColumns: FRESH_INSTALL_USER_COLUMNS,
    });

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "theme_preference" text DEFAULT 'system' NOT NULL`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "code_theme" text`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "accent_color" integer`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "ui_font_family" text`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "code_font_family" text`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "ui_font_size" real`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "code_font_size" real`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "shortcut_overrides" text`,
    );
  });

  it("backfills startup-critical columns for legacy user tables", () => {
    const { db, sqlite } = createMocks({
      userColumns: LEGACY_USER_COLUMNS,
    });

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "theme_preference" text DEFAULT 'system' NOT NULL`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "selected_workspace_id" text`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "thread_list_organize_by" text DEFAULT 'workspace' NOT NULL`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "thread_list_sort_by" text DEFAULT 'updated' NOT NULL`,
    );
    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "user" ADD COLUMN "shortcut_overrides" text`,
    );
  });

  it("backfills legacy thread delegation columns before creating dependent indexes", () => {
    const { db, operations, sqlite } = createMocks({
      threadColumns: LEGACY_THREAD_COLUMNS,
    });

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "thread" ADD COLUMN "delegation_id" text`,
    );

    const addDelegationIndex = operations.findIndex((statement) =>
      statement.includes(
        `ALTER TABLE "thread" ADD COLUMN "delegation_id" text`,
      ),
    );
    const createDelegationUniqueIndex = operations.findIndex((statement) =>
      statement.includes(
        `CREATE UNIQUE INDEX IF NOT EXISTS "thread_parent_delegation_unique"`,
      ),
    );

    expect(addDelegationIndex).toBeGreaterThanOrEqual(0);
    expect(createDelegationUniqueIndex).toBeGreaterThan(addDelegationIndex);
  });

  it("creates the missing auxiliary tables expected by the runtime schema", () => {
    const { db, sqlite } = createMocks();

    ensureTables(db as never, sqlite as never);

    const statements = db.run.mock.calls.map(([statement]: [unknown]) =>
      serializeRunSql(statement),
    );

    expect(
      statements.some((statement: string) =>
        statement.includes(
          `CREATE TABLE IF NOT EXISTS "image_generation_setting"`,
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement: string) =>
        statement.includes(
          `CREATE TABLE IF NOT EXISTS "image_generation_provider_setting"`,
        ),
      ),
    ).toBe(true);
    expect(
      statements.some((statement: string) =>
        statement.includes(
          `CREATE TABLE IF NOT EXISTS "integration_database_config"`,
        ),
      ),
    ).toBe(true);
  });

  it("upgrades a legacy thread table in sqlite before adding the delegation unique index", () => {
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
    `);
    const db = drizzle(sqlite, { schema });

    expect(() => ensureTables(db as never, sqlite as never)).not.toThrow();

    const threadColumns = sqlite
      .prepare(`PRAGMA table_info("thread")`)
      .all() as Array<{ name: string }>;
    expect(threadColumns.some(({ name }) => name === "delegation_id")).toBe(
      true,
    );

    const delegationIndex = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
      )
      .get("thread_parent_delegation_unique") as { name: string } | undefined;
    expect(delegationIndex?.name).toBe("thread_parent_delegation_unique");

    sqlite.close();
  });

  it("adds workspace sort_order to legacy sqlite databases without rebuilding the table", () => {
    const sqlite = new SQLiteDatabase(":memory:");
    sqlite.exec(`
      CREATE TABLE "workspace" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL,
        "root_path" text,
        "description" text,
        "is_archived" integer DEFAULT false NOT NULL,
        "is_expanded" integer DEFAULT false NOT NULL,
        "created_at" integer NOT NULL,
        "updated_at" integer NOT NULL,
        "permission_mode_override" text
      );
    `);
    const db = drizzle(sqlite, { schema });

    expect(() => ensureTables(db as never, sqlite as never)).not.toThrow();

    const workspaceColumns = sqlite
      .prepare(`PRAGMA table_info("workspace")`)
      .all() as Array<{
      dflt_value: string | null;
      name: string;
      notnull: number;
    }>;
    const sortOrderColumn = workspaceColumns.find(
      ({ name }) => name === "sort_order",
    );

    expect(sortOrderColumn).toEqual(
      expect.objectContaining({
        dflt_value: "0",
        name: "sort_order",
        notnull: 1,
      }),
    );

    sqlite.close();
  });
});
