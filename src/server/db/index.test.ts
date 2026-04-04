import { describe, expect, it, mock } from "bun:test";

import { ensureTables } from "./index";

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
}: {
  userColumns?: Array<{ name: string }>;
  automationColumns?: Array<{ name: string }>;
} = {}) {
  const sqlite = {
    exec: mock((_sql: string) => undefined),
    prepare: mock((sql: string) => ({
      all: () => {
        if (sql.includes('PRAGMA table_info("user")')) {
          return userColumns;
        }

        if (sql.includes('PRAGMA table_info("automation")')) {
          return automationColumns;
        }

        return [];
      },
    })),
  };
  const db = {
    run: mock((_sql: unknown) => undefined),
  };

  return { db, sqlite };
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
});
