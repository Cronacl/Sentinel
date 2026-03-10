import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * @param {string} content
 */
function parseDotEnv(content) {
  return content.split("\n").reduce(
    /**
     * @param {Record<string, string>} accumulator
     * @param {string} line
     */
    (accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    accumulator[key] = rawValue.replace(/^"(.*)"$/, "$1");
    return accumulator;
    },
    /** @type {Record<string, string>} */ ({}),
  );
}

/**
 * @returns {Record<string, string>}
 */
function readLocalRuntimeEnv() {
  try {
    const envPath = path.join(os.homedir(), ".sentinel", "desktop.env");
    const content = fs.readFileSync(envPath, "utf8");
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

const localRuntimeEnv = readLocalRuntimeEnv();

export const env = createEnv({
  server: {
    ENCRYPTION_KEY: z
      .string()
      .length(64, "ENCRYPTION_KEY must be a 32-byte hex string (64 chars)")
      .default(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SENTINEL_DB_PATH: z.string().optional(),
    SENTINEL_STATE_PATH: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? localRuntimeEnv.ENCRYPTION_KEY,
    NODE_ENV: process.env.NODE_ENV,
    SENTINEL_DB_PATH: process.env.SENTINEL_DB_PATH,
    SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
