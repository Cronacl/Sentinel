import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { sql } from "drizzle-orm";

import { createLogger } from "@/lib/logger";
import { getSentinelDbFilePath } from "@/lib/runtime/local-state";
import * as schema from "./schema";

function getDbPath(): string {
  return getSentinelDbFilePath();
}

function getVectorDbPath(): string {
  const mainPath = getDbPath();
  const dir = path.dirname(mainPath);
  return path.join(dir, "vectors.db");
}

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function ensureTableColumns(
  sqlite: Database.Database,
  tableName: string,
  columns: Array<{ name: string; definition: string }>,
) {
  const existingColumns = new Set<string>(
    (
      sqlite
        .prepare(`PRAGMA table_info("${tableName.replaceAll('"', '""')}")`)
        .all() as Array<{ name: string }>
    ).map((column) => column.name),
  );

  for (const column of columns) {
    if (existingColumns.has(column.name)) {
      continue;
    }

    sqlite.exec(
      `ALTER TABLE "${tableName.replaceAll('"', '""')}" ADD COLUMN "${column.name.replaceAll('"', '""')}" ${column.definition}`,
    );
  }
}

export function ensureTables(
  db: ReturnType<typeof drizzle>,
  sqlite: Database.Database,
) {
  db.run(sql`CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "email_verified" integer DEFAULT false NOT NULL,
    "image" text,
    "nickname" text,
    "occupation" text,
    "about_user" text,
    "personality_preset" text DEFAULT 'pragmatic' NOT NULL,
    "custom_instructions" text,
    "permission_mode" text DEFAULT 'default' NOT NULL,
    "persist_browser_session" integer DEFAULT true NOT NULL,
    "webfetch_batch_enabled" integer DEFAULT false NOT NULL,
    "webfetch_batch_limit" integer DEFAULT 10 NOT NULL,
    "context_compaction_enabled" integer,
    "context_compaction_use_fixed_window" integer,
    "context_compaction_fixed_window_size" integer,
    "context_compaction_window_percent" integer,
    "skills_base_path" text,
    "theme_preference" text DEFAULT 'system' NOT NULL,
    "default_chat_engine" text,
    "default_chat_model_id" text,
    "default_chat_mode" text,
    "default_chat_reasoning_effort" text,
    "voice_input_enabled" integer DEFAULT false,
    "voice_input_provider" text,
    "voice_input_model_id" text,
    "follow_up_behavior" text DEFAULT 'queue' NOT NULL,
    "selected_workspace_id" text,
    "last_project_open_target_id" text,
    "thread_list_organize_by" text DEFAULT 'workspace' NOT NULL,
    "thread_list_sort_by" text DEFAULT 'updated' NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "user_selected_workspace_idx" ON "user" ("selected_workspace_id")`,
  );
  ensureTableColumns(sqlite, "user", [
    { name: "nickname", definition: "text" },
    { name: "occupation", definition: "text" },
    { name: "about_user", definition: "text" },
    {
      name: "personality_preset",
      definition: "text DEFAULT 'pragmatic' NOT NULL",
    },
    { name: "custom_instructions", definition: "text" },
    {
      name: "theme_preference",
      definition: "text DEFAULT 'system' NOT NULL",
    },
    { name: "code_theme", definition: "text" },
    { name: "ui_font_family", definition: "text" },
    { name: "code_font_family", definition: "text" },
    { name: "ui_font_size", definition: "real" },
    { name: "code_font_size", definition: "real" },
    { name: "shortcut_overrides", definition: "text" },
    { name: "selected_workspace_id", definition: "text" },
    {
      name: "thread_list_organize_by",
      definition: "text DEFAULT 'workspace' NOT NULL",
    },
    {
      name: "thread_list_sort_by",
      definition: "text DEFAULT 'updated' NOT NULL",
    },
  ]);

  db.run(sql`CREATE TABLE IF NOT EXISTS "workspace" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "root_path" text,
    "description" text,
    "permission_mode_override" text,
    "is_archived" integer DEFAULT false NOT NULL,
    "is_expanded" integer DEFAULT false NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_idx" ON "workspace" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_archived_idx" ON "workspace" ("user_id", "is_archived")`,
  );
  ensureTableColumns(sqlite, "workspace", [
    { name: "permission_mode_override", definition: "text" },
    {
      name: "is_expanded",
      definition: "integer DEFAULT false NOT NULL",
    },
    {
      name: "sort_order",
      definition: "integer DEFAULT 0 NOT NULL",
    },
  ]);

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread" (
    "id" text PRIMARY KEY NOT NULL,
    "workspace_id" text NOT NULL REFERENCES "workspace"("id"),
    "user_id" text NOT NULL REFERENCES "user"("id"),
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
  )`);

  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_workspace_id_idx" ON "thread" ("workspace_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_user_id_idx" ON "thread" ("user_id")`,
  );
  ensureTableColumns(sqlite, "thread", [
    {
      name: "visibility",
      definition: "text DEFAULT 'visible' NOT NULL",
    },
    { name: "parent_thread_id", definition: "text" },
    { name: "virtual_key", definition: "text" },
    { name: "delegation_id", definition: "text" },
    { name: "source_virtual_thread_id", definition: "text" },
  ]);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_parent_thread_id_idx" ON "thread" ("parent_thread_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_visibility_parent_idx" ON "thread" ("visibility", "parent_thread_id")`,
  );
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_virtual_parent_key_unique" ON "thread" ("parent_thread_id", "virtual_key")`,
  );
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_parent_delegation_unique" ON "thread" ("parent_thread_id", "delegation_id")`,
  );
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_source_virtual_unique" ON "thread" ("source_virtual_thread_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_workspace_archived_updated_idx" ON "thread" ("workspace_id", "archived_at", "updated_at")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_user_archived_updated_idx" ON "thread" ("user_id", "archived_at", "updated_at")`,
  );

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "permission_mode" text DEFAULT 'default' NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "persist_browser_session" integer DEFAULT true NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "webfetch_batch_enabled" integer DEFAULT false NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "webfetch_batch_limit" integer DEFAULT 10 NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "context_compaction_enabled" integer`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "context_compaction_use_fixed_window" integer`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "context_compaction_fixed_window_size" integer`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "context_compaction_window_percent" integer`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "skills_base_path" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "default_chat_engine" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "default_chat_model_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "default_chat_reasoning_effort" text`,
    );
  } catch {}

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "default_chat_mode" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "voice_input_enabled" integer DEFAULT false`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "voice_input_provider" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "voice_input_model_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "follow_up_behavior" text DEFAULT 'queue' NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "user" ADD COLUMN "last_project_open_target_id" text`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "mode" text DEFAULT 'chat' NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "pinned_at" integer`);
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "chat_engine" text DEFAULT 'sentinel' NOT NULL`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "chat_engine_state" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "chat_model_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "chat_reasoning_effort" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "active_stream_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "context_compaction_summary" text`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "context_compaction_covered_through_message_id" text`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "context_compaction_updated_at" integer`,
    );
  } catch {
    // column already exists
  }

  try {
    db.run(
      sql`ALTER TABLE "thread" ADD COLUMN "status" text DEFAULT 'idle' NOT NULL`,
    );
  } catch {
    // column already exists
  }

  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_user_pinned_idx" ON "thread" ("user_id", "pinned_at")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "mcp_server_config" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "catalog_id" text,
    "transport" text NOT NULL,
    "encrypted_config" text NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  try {
    db.run(sql`ALTER TABLE "mcp_server_config" ADD COLUMN "catalog_id" text`);
  } catch {
    // column already exists
  }
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "mcp_server_config_user_catalog_unique" ON "mcp_server_config" ("user_id", "catalog_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "mcp_server_config_user_id_idx" ON "mcp_server_config" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "mcp_server_config_user_enabled_idx" ON "mcp_server_config" ("user_id", "is_enabled")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_message" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" text NOT NULL,
    "message_id" text NOT NULL,
    "role" text NOT NULL,
    "parts" text NOT NULL,
    "metadata" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_message_thread_message_unique" ON "thread_message" ("thread_id", "message_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_message_thread_created_idx" ON "thread_message" ("thread_id", "created_at")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_repo_checkpoint" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" text NOT NULL,
    "assistant_message_id" text NOT NULL,
    "parent_checkpoint_id" text,
    "run_id" text NOT NULL,
    "effective_project_path" text NOT NULL,
    "repo_root" text NOT NULL,
    "branch_at_capture" text,
    "head_at_capture" text,
    "changed_paths" text NOT NULL,
    "before_tree_hash" text,
    "after_tree_hash" text,
    "forward_patch" text NOT NULL,
    "reverse_patch" text NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_repo_checkpoint_assistant_unique" ON "thread_repo_checkpoint" ("thread_id", "assistant_message_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_repo_checkpoint_thread_created_idx" ON "thread_repo_checkpoint" ("thread_id", "created_at")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_repo_checkpoint_parent_idx" ON "thread_repo_checkpoint" ("parent_checkpoint_id")`,
  );
  try {
    db.run(
      sql`ALTER TABLE "thread_repo_checkpoint" ADD COLUMN "after_tree_hash" text`,
    );
  } catch {
    // column already exists
  }
  try {
    db.run(
      sql`ALTER TABLE "thread_repo_checkpoint" ADD COLUMN "before_tree_hash" text`,
    );
  } catch {
    // column already exists
  }

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_follow_up" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" text NOT NULL,
    "parts" text NOT NULL,
    "model_id" text NOT NULL,
    "reasoning_effort" text,
    "thread_mode" text NOT NULL,
    "status" text DEFAULT 'queued' NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_follow_up_thread_created_idx" ON "thread_follow_up" ("thread_id", "created_at")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_follow_up_thread_status_idx" ON "thread_follow_up" ("thread_id", "status")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_plan" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" text NOT NULL,
    "title" text NOT NULL,
    "goal" text NOT NULL,
    "summary" text NOT NULL,
    "audience" text DEFAULT 'technical' NOT NULL,
    "document" text DEFAULT '' NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_plan_thread_id_unique" ON "thread_plan" ("thread_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_plan_thread_id_idx" ON "thread_plan" ("thread_id")`,
  );

  try {
    db.run(
      sql`ALTER TABLE "thread_plan" ADD COLUMN "audience" text DEFAULT 'technical' NOT NULL`,
    );
  } catch {}

  try {
    db.run(
      sql`ALTER TABLE "thread_plan" ADD COLUMN "document" text DEFAULT '' NOT NULL`,
    );
  } catch {}

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_plan_task" (
    "id" text PRIMARY KEY NOT NULL,
    "plan_id" text NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_plan_task_plan_id_idx" ON "thread_plan_task" ("plan_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_plan_task_plan_sort_idx" ON "thread_plan_task" ("plan_id", "sort_order")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread_plan_question" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" text NOT NULL,
    "questions" text NOT NULL,
    "response" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "answered_at" integer,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_plan_question_thread_id_idx" ON "thread_plan_question" ("thread_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_plan_question_thread_status_idx" ON "thread_plan_question" ("thread_id", "status")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "scratchpad" (
    "id" text PRIMARY KEY NOT NULL,
    "workspace_id" text NOT NULL,
    "user_id" text NOT NULL,
    "hub_thread_id" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "scratchpad_workspace_user_unique" ON "scratchpad" ("workspace_id", "user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_workspace_id_idx" ON "scratchpad" ("workspace_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_user_id_idx" ON "scratchpad" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "scratchpad_task" (
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
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_task_scratchpad_id_idx" ON "scratchpad_task" ("scratchpad_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_task_scratchpad_sort_idx" ON "scratchpad_task" ("scratchpad_id", "sort_order")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_task_virtual_thread_idx" ON "scratchpad_task" ("virtual_thread_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "scratchpad_task_visible_thread_idx" ON "scratchpad_task" ("visible_thread_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "provider_credential" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "encrypted_config" text NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "provider_credential_user_provider_unique" ON "provider_credential" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "provider_credential_user_id_idx" ON "provider_credential" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "search_provider_config" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "encrypted_config" text NOT NULL,
    "settings" text NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "search_provider_config_user_provider_unique" ON "search_provider_config" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "search_provider_config_user_id_idx" ON "search_provider_config" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "search_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "default_provider" text NOT NULL,
    "default_result_count" integer NOT NULL,
    "max_result_count" integer NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "search_setting_user_unique" ON "search_setting" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "search_setting_user_id_idx" ON "search_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "image_generation_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "default_provider" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_setting_user_unique" ON "image_generation_setting" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "image_generation_setting_user_id_idx" ON "image_generation_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "image_generation_provider_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model_id" text,
    "is_custom" integer DEFAULT false NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "image_generation_provider_setting_user_provider_unique" ON "image_generation_provider_setting" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "image_generation_provider_setting_user_id_idx" ON "image_generation_provider_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "video_generation_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "default_provider" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "video_generation_setting_user_unique" ON "video_generation_setting" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "video_generation_setting_user_id_idx" ON "video_generation_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "video_generation_provider_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model_id" text,
    "is_custom" integer DEFAULT false NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "video_generation_provider_setting_user_provider_unique" ON "video_generation_provider_setting" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "video_generation_provider_setting_user_id_idx" ON "video_generation_provider_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "memory_setting" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "enabled" integer DEFAULT false NOT NULL,
    "auto_save_enabled" integer DEFAULT true NOT NULL,
    "default_scope" text DEFAULT 'global' NOT NULL,
    "retrieval_limit" integer DEFAULT 6 NOT NULL,
    "auto_save_per_turn_limit" integer DEFAULT 3 NOT NULL,
    "memory_provider" text DEFAULT 'openai' NOT NULL,
    "memory_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
    "memory_dimensions" integer DEFAULT 1536 NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "memory_setting_user_unique" ON "memory_setting" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "memory_setting_user_id_idx" ON "memory_setting" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "tool_approval_policy" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "tool_name" text NOT NULL,
    "require_approval" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "tool_approval_policy_user_tool_unique" ON "tool_approval_policy" ("user_id", "tool_name")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "tool_approval_policy_user_id_idx" ON "tool_approval_policy" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "model_preference" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model_id" text NOT NULL,
    "is_custom" integer DEFAULT false NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "model_preference_user_provider_model_unique" ON "model_preference" ("user_id", "provider", "model_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "model_preference_user_id_idx" ON "model_preference" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "automation" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "workspace_id" text,
    "title" text NOT NULL,
    "prompt" text NOT NULL,
    "status" text DEFAULT 'paused' NOT NULL,
    "schedule_type" text DEFAULT 'daily' NOT NULL,
    "schedule_day_of_week" integer,
    "schedule_time" text,
    "schedule_cron" text,
    "model_id" text,
    "reasoning_effort" text,
    "last_ran_at" integer,
    "next_run_at" integer,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_user_id_idx" ON "automation" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_user_status_idx" ON "automation" ("user_id", "status")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_next_run_idx" ON "automation" ("next_run_at")`,
  );
  ensureTableColumns(sqlite, "automation", [
    {
      name: "chat_engine",
      definition: "text DEFAULT 'sentinel' NOT NULL",
    },
  ]);

  db.run(sql`CREATE TABLE IF NOT EXISTS "automation_run" (
    "id" text PRIMARY KEY NOT NULL,
    "automation_id" text NOT NULL REFERENCES "automation"("id"),
    "thread_id" text REFERENCES "thread"("id"),
    "status" text DEFAULT 'pending' NOT NULL,
    "error" text,
    "started_at" integer NOT NULL,
    "completed_at" integer
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_run_automation_id_idx" ON "automation_run" ("automation_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_run_automation_started_idx" ON "automation_run" ("automation_id", "started_at")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "automation_run_thread_id_idx" ON "automation_run" ("thread_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "integration" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "auth_type" text DEFAULT 'oauth' NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "metadata" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "integration_user_provider_unique" ON "integration" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "integration_user_id_idx" ON "integration" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "integration_user_enabled_idx" ON "integration" ("user_id", "is_enabled")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "integration_oauth_token" (
    "id" text PRIMARY KEY NOT NULL,
    "integration_id" text NOT NULL REFERENCES "integration"("id") ON DELETE CASCADE,
    "encrypted_access_token" text NOT NULL,
    "encrypted_refresh_token" text,
    "token_type" text DEFAULT 'Bearer' NOT NULL,
    "scope" text,
    "expires_at" integer,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "integration_oauth_token_integration_idx" ON "integration_oauth_token" ("integration_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "integration_oauth_app" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "encrypted_client_id" text NOT NULL,
    "encrypted_client_secret" text NOT NULL,
    "redirect_uri" text,
    "scopes" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "integration_oauth_app_user_provider_unique" ON "integration_oauth_app" ("user_id", "provider")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "integration_oauth_app_user_id_idx" ON "integration_oauth_app" ("user_id")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "integration_database_config" (
    "id" text PRIMARY KEY NOT NULL,
    "integration_id" text NOT NULL REFERENCES "integration"("id") ON DELETE CASCADE,
    "encrypted_host" text NOT NULL,
    "encrypted_port" text NOT NULL,
    "encrypted_database" text,
    "encrypted_username" text NOT NULL,
    "encrypted_password" text NOT NULL,
    "encrypted_connection_url" text,
    "use_connection_url" integer DEFAULT false NOT NULL,
    "ssl" integer DEFAULT false NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "integration_db_config_integration_idx" ON "integration_database_config" ("integration_id")`,
  );
}

function initVectorDb(): Database.Database | null {
  try {
    const sqliteVec = require("sqlite-vec") as typeof import("sqlite-vec");
    const vectorDbPath = getVectorDbPath();
    ensureDirectory(vectorDbPath);

    const vectorSqlite = new Database(vectorDbPath);
    vectorSqlite.pragma("journal_mode = WAL");
    vectorSqlite.pragma("busy_timeout = 5000");

    sqliteVec.load(vectorSqlite);

    vectorSqlite.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        display_name TEXT NOT NULL,
        hash TEXT,
        chunk_count INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS knowledge_sources_workspace_idx
        ON knowledge_sources (workspace_id);
      CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_workspace_path_unique
        ON knowledge_sources (workspace_id, source_path);

      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx
        ON knowledge_chunks (source_id);
      CREATE INDEX IF NOT EXISTS knowledge_chunks_workspace_idx
        ON knowledge_chunks (workspace_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_embeddings USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding float[1536]
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        fingerprint TEXT NOT NULL,
        source_thread_id TEXT,
        source_message_id TEXT,
        salience REAL DEFAULT 0.5 NOT NULL,
        is_pinned INTEGER DEFAULT false NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER,
        embedding_provider TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding_dimensions INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memory_items_user_idx
        ON memory_items (user_id);
      CREATE INDEX IF NOT EXISTS memory_items_user_workspace_idx
        ON memory_items (user_id, workspace_id);
      CREATE INDEX IF NOT EXISTS memory_items_user_kind_idx
        ON memory_items (user_id, kind);
      CREATE UNIQUE INDEX IF NOT EXISTS memory_items_user_scope_fingerprint_unique
        ON memory_items (user_id, coalesce(workspace_id, ''), kind, fingerprint);

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings_1536 USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding float[1536]
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings_2048 USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding float[2048]
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings_3072 USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding float[3072]
      );
    `);

    return vectorSqlite;
  } catch {
    return null;
  }
}

function createDatabase() {
  const dbPath = getDbPath();
  ensureDirectory(dbPath);

  const sqlite = new Database(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  ensureTables(db, sqlite);

  return db;
}

const globalForDb = globalThis as unknown as {
  automationSchedulerInit: Promise<void> | undefined;
  startupBackupInit: Promise<void> | undefined;
  db: ReturnType<typeof createDatabase> | undefined;
  vectorDb: Database.Database | null | undefined;
};

const shouldSkipStartupTasks =
  process.env.SENTINEL_SKIP_STARTUP_TASKS === "1" ||
  process.env.SKIP_ENV_VALIDATION === "1";

function getDb() {
  if (!globalForDb.db) {
    globalForDb.db = createDatabase();
  }

  return globalForDb.db;
}

export function syncDatabaseSchema() {
  return getDb();
}

export const db = new Proxy({} as ReturnType<typeof createDatabase>, {
  get(_target, prop, receiver) {
    const realDb = getDb();
    const value = Reflect.get(realDb, prop, receiver);
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});
export const vectorDb: Database.Database | null =
  globalForDb.vectorDb !== undefined ? globalForDb.vectorDb : initVectorDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.vectorDb = vectorDb;
}

function startAutomationScheduler() {
  if (shouldSkipStartupTasks || globalForDb.automationSchedulerInit) {
    return globalForDb.automationSchedulerInit;
  }

  globalForDb.automationSchedulerInit = Promise.resolve()
    .then(async () => {
      const { initAutomationScheduler } =
        await import("@/lib/automations/scheduler");
      await initAutomationScheduler();
    })
    .catch((error) => {
      globalForDb.automationSchedulerInit = undefined;
      createLogger("Automations").error(
        `Failed to initialize scheduler: ${error instanceof Error ? error.message : error}`,
      );
    });

  return globalForDb.automationSchedulerInit;
}

function startStartupBackup() {
  if (shouldSkipStartupTasks || globalForDb.startupBackupInit) {
    return globalForDb.startupBackupInit;
  }

  globalForDb.startupBackupInit = Promise.resolve()
    .then(async () => {
      const { createStartupBackup } = await import("@/server/db/backup");
      const result = await createStartupBackup();
      if (result) {
        createLogger("Backup").info(
          `Startup backup created: ${result.filename}`,
        );
      }
    })
    .catch((error) => {
      globalForDb.startupBackupInit = undefined;
      createLogger("Backup").error(
        `Startup backup failed: ${error instanceof Error ? error.message : error}`,
      );
    });

  return globalForDb.startupBackupInit;
}

export async function startDeferredStartupTasks() {
  const tasks = [startAutomationScheduler(), startStartupBackup()].filter(
    (task): task is Promise<void> => Boolean(task),
  );

  await Promise.all(tasks);
}

export type Database = ReturnType<typeof createDatabase>;
