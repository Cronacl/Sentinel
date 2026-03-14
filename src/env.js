import fs from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const LOCAL_STATE_DIRECTORY = path.join(os.homedir(), ".sentinel");
const LOCAL_RUNTIME_ENV_PATH = path.join(LOCAL_STATE_DIRECTORY, "desktop.env");
const LOCAL_STATE_DIRECTORY_MODE = 0o700;
const LOCAL_RUNTIME_ENV_FILE_MODE = 0o600;
const LEGACY_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
 * @param {string | undefined} value
 */
function isValidEncryptionKey(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.trim());
}

/**
 * @param {string} content
 * @param {string} key
 * @param {string} value
 */
function upsertDotEnvValue(content, key, value) {
  const assignment = `${key}=${value}`;
  const linePattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");

  if (linePattern.test(content)) {
    return content.replace(linePattern, assignment);
  }

  const suffix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${assignment}\n`;
}

/**
 * @returns {{ content: string; values: Record<string, string> }}
 */
function readLocalRuntimeEnvFile() {
  try {
    const content = fs.readFileSync(LOCAL_RUNTIME_ENV_PATH, "utf8");
    return { content, values: parseDotEnv(content) };
  } catch {
    return { content: "", values: {} };
  }
}

/**
 * @param {string} content
 */
function writeLocalRuntimeEnvFile(content) {
  fs.mkdirSync(LOCAL_STATE_DIRECTORY, {
    mode: LOCAL_STATE_DIRECTORY_MODE,
    recursive: true,
  });
  fs.writeFileSync(LOCAL_RUNTIME_ENV_PATH, content, {
    encoding: "utf8",
    mode: LOCAL_RUNTIME_ENV_FILE_MODE,
  });
  fs.chmodSync(LOCAL_STATE_DIRECTORY, LOCAL_STATE_DIRECTORY_MODE);
  fs.chmodSync(LOCAL_RUNTIME_ENV_PATH, LOCAL_RUNTIME_ENV_FILE_MODE);
}

/**
 * @param {Record<string, string>} localRuntimeEnv
 */
function ensureLocalEncryptionKey(localRuntimeEnv) {
  const explicitKey = process.env.ENCRYPTION_KEY?.trim();
  if (explicitKey) {
    return explicitKey;
  }

  const currentKey = localRuntimeEnv.ENCRYPTION_KEY?.trim();
  const normalizedCurrentKey = currentKey?.toLowerCase();
  if (
    isValidEncryptionKey(currentKey) &&
    normalizedCurrentKey !== LEGACY_ENCRYPTION_KEY
  ) {
    return currentKey;
  }

  const nextKey = randomBytes(32).toString("hex");
  const localEnvFile = readLocalRuntimeEnvFile();
  const nextContent = upsertDotEnvValue(
    localEnvFile.content,
    "ENCRYPTION_KEY",
    nextKey,
  );

  writeLocalRuntimeEnvFile(nextContent);
  localRuntimeEnv.ENCRYPTION_KEY = nextKey;
  return nextKey;
}

const localRuntimeEnv = readLocalRuntimeEnvFile().values;
ensureLocalEncryptionKey(localRuntimeEnv);

export const env = createEnv({
  server: {
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-f]+$/i, "ENCRYPTION_KEY must be a hex string")
      .length(64, "ENCRYPTION_KEY must be a 32-byte hex string (64 chars)")
      .refine(
        (value) => value.toLowerCase() !== LEGACY_ENCRYPTION_KEY,
        "ENCRYPTION_KEY must not use the legacy default value.",
      ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    SENTINEL_DB_PATH: z.string().optional(),
    SENTINEL_STATE_PATH: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    ENCRYPTION_KEY:
      process.env.ENCRYPTION_KEY ?? localRuntimeEnv.ENCRYPTION_KEY,
    NODE_ENV: process.env.NODE_ENV,
    SENTINEL_DB_PATH: process.env.SENTINEL_DB_PATH,
    SENTINEL_STATE_PATH: process.env.SENTINEL_STATE_PATH,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
