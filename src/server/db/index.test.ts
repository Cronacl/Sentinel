import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "index.ts"),
  "utf8",
);

describe("database bootstrap schema", () => {
  it("keeps first-run user columns aligned with the current user model", () => {
    expect(source).toContain('"context_compaction_enabled" integer');
    expect(source).toContain('"context_compaction_use_fixed_window" integer');
    expect(source).toContain('"context_compaction_fixed_window_size" integer');
    expect(source).toContain('"context_compaction_window_percent" integer');
  });

  it("keeps first-run workspace and thread columns aligned with the app shell", () => {
    expect(source).toContain('"is_expanded" integer DEFAULT false NOT NULL');
    expect(source).toContain('"context_compaction_summary" text');
    expect(source).toContain(
      '"context_compaction_covered_through_message_id" text',
    );
    expect(source).toContain('"context_compaction_updated_at" integer');
    expect(source).toContain("\"status\" text DEFAULT 'idle' NOT NULL");
  });
});
