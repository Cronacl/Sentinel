import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import os from "node:os";
import { sql } from "drizzle-orm";

import * as schema from "./schema";

function getDbPath(): string {
  if (process.env.SENTINEL_DB_PATH?.trim()) {
    return process.env.SENTINEL_DB_PATH.trim();
  }

  return path.join(os.homedir(), ".sentinel", "sentinel.db");
}

function getVectorDbPath(): string {
  const mainPath = getDbPath();
  const dir = path.dirname(mainPath);
  return path.join(dir, "vectors.db");
}

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  const fs = require("node:fs") as typeof import("node:fs");
  fs.mkdirSync(dir, { recursive: true });
}

function ensureTables(db: ReturnType<typeof drizzle>) {
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
    "webfetch_batch_enabled" integer DEFAULT false NOT NULL,
    "webfetch_batch_limit" integer DEFAULT 10 NOT NULL,
    "theme_preference" text DEFAULT 'system' NOT NULL,
    "default_chat_model_id" text,
    "default_chat_reasoning_effort" text,
    "selected_workspace_id" text,
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

  db.run(sql`CREATE TABLE IF NOT EXISTS "workspace" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "root_path" text,
    "description" text,
    "is_archived" integer DEFAULT false NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(
    sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_idx" ON "workspace" ("user_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_archived_idx" ON "workspace" ("user_id", "is_archived")`,
  );

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread" (
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
    "archived_at" integer
  )`);

  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_workspace_id_idx" ON "thread" ("workspace_id")`,
  );
  db.run(
    sql`CREATE INDEX IF NOT EXISTS "thread_user_id_idx" ON "thread" ("user_id")`,
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
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "chat_model_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "thread" ADD COLUMN "chat_reasoning_effort" text`);
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

  ensureTables(db);

  return db;
}

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof createDatabase> | undefined;
  vectorDb: Database.Database | null | undefined;
};

export const db = globalForDb.db ?? createDatabase();
export const vectorDb: Database.Database | null =
  globalForDb.vectorDb !== undefined ? globalForDb.vectorDb : initVectorDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
  globalForDb.vectorDb = vectorDb;
}

export type Database = typeof db;
