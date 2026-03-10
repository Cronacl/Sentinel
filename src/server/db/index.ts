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
    "theme_preference" text DEFAULT 'system' NOT NULL,
    "default_chat_model_id" text,
    "default_chat_reasoning_effort" text,
    "selected_workspace_id" text,
    "thread_list_organize_by" text DEFAULT 'workspace' NOT NULL,
    "thread_list_sort_by" text DEFAULT 'updated' NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_email_unique" ON "user" ("email")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "user_selected_workspace_idx" ON "user" ("selected_workspace_id")`);

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

  db.run(sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_idx" ON "workspace" ("user_id")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "workspace_user_id_archived_idx" ON "workspace" ("user_id", "is_archived")`);

  db.run(sql`CREATE TABLE IF NOT EXISTS "thread" (
    "id" text PRIMARY KEY NOT NULL,
    "workspace_id" text NOT NULL,
    "user_id" text NOT NULL,
    "title" text NOT NULL,
    "summary" text,
    "chat_model_id" text,
    "chat_reasoning_effort" text,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL,
    "archived_at" integer
  )`);

  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_workspace_id_idx" ON "thread" ("workspace_id")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_user_id_idx" ON "thread" ("user_id")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_workspace_archived_updated_idx" ON "thread" ("workspace_id", "archived_at", "updated_at")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_user_archived_updated_idx" ON "thread" ("user_id", "archived_at", "updated_at")`);

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "default_chat_model_id" text`);
  } catch {
    // column already exists
  }

  try {
    db.run(sql`ALTER TABLE "user" ADD COLUMN "default_chat_reasoning_effort" text`);
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
  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_user_pinned_idx" ON "thread" ("user_id", "pinned_at")`);

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

  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "thread_message_thread_message_unique" ON "thread_message" ("thread_id", "message_id")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "thread_message_thread_created_idx" ON "thread_message" ("thread_id", "created_at")`);

  db.run(sql`CREATE TABLE IF NOT EXISTS "provider_credential" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "encrypted_config" text NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL,
    "updated_at" integer NOT NULL
  )`);

  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "provider_credential_user_provider_unique" ON "provider_credential" ("user_id", "provider")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "provider_credential_user_id_idx" ON "provider_credential" ("user_id")`);

  db.run(sql`CREATE TABLE IF NOT EXISTS "model_preference" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "provider" text NOT NULL,
    "model_id" text NOT NULL,
    "is_custom" integer DEFAULT false NOT NULL,
    "is_enabled" integer DEFAULT true NOT NULL,
    "created_at" integer NOT NULL
  )`);

  db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "model_preference_user_provider_model_unique" ON "model_preference" ("user_id", "provider", "model_id")`);
  db.run(sql`CREATE INDEX IF NOT EXISTS "model_preference_user_id_idx" ON "model_preference" ("user_id")`);
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
