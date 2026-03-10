import { defineConfig } from "drizzle-kit";
import path from "node:path";
import os from "node:os";

function getDbPath(): string {
  if (process.env.SENTINEL_DB_PATH?.trim()) {
    return process.env.SENTINEL_DB_PATH.trim();
  }

  return path.join(os.homedir(), ".sentinel", "sentinel.db");
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: getDbPath(),
  },
  out: "./drizzle",
});
