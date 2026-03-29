import { describe, expect, it, mock } from "bun:test";

import { ensureTables } from "./index";

describe("ensureTables", () => {
  it("adds missing automation chat_engine columns for legacy databases", () => {
    const legacyAutomationColumns = [
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
    const sqlite = {
      exec: mock((_sql: string) => undefined),
      prepare: mock((sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info("automation")')) {
            return legacyAutomationColumns;
          }

          return [];
        },
      })),
    };
    const db = {
      run: mock((_sql: unknown) => undefined),
    };

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).toHaveBeenCalledWith(
      `ALTER TABLE "automation" ADD COLUMN "chat_engine" text DEFAULT 'sentinel' NOT NULL`,
    );
  });

  it("does not re-add automation chat_engine when the schema is already current", () => {
    const sqlite = {
      exec: mock((_sql: string) => undefined),
      prepare: mock((sql: string) => ({
        all: () => {
          if (sql.includes('PRAGMA table_info("automation")')) {
            return [
              { name: "id" },
              { name: "user_id" },
              { name: "workspace_id" },
              { name: "title" },
              { name: "prompt" },
              { name: "chat_engine" },
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
          }

          return [];
        },
      })),
    };
    const db = {
      run: mock((_sql: unknown) => undefined),
    };

    ensureTables(db as never, sqlite as never);

    expect(sqlite.exec).not.toHaveBeenCalled();
  });
});
