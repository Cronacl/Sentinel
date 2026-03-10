import { randomBytes } from "node:crypto";
import path from "node:path";

import { APP_URL } from "./constants.mjs";
import { readTextFile, writeTextFile } from "./state.mjs";

const RUNTIME_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "NEXT_PUBLIC_URL",
  "SENTINEL_DB_PATH",
  "SENTINEL_STATE_PATH",
];

function parseDotEnv(content) {
  return content.split("\n").reduce((accumulator, line) => {
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
  }, {});
}

function buildDefaultEnv() {
  return {
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: APP_URL,
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GOOGLE_REDIRECT_URI: `${APP_URL}/api/auth/callback/google`,
    NEXT_PUBLIC_URL: APP_URL,
  };
}

function getProcessRuntimeOverrides() {
  return RUNTIME_ENV_KEYS.reduce((accumulator, key) => {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
}

function serializeEnv(envObject) {
  return Object.entries(envObject)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
}

export async function loadRuntimeEnv(runtimePaths) {
  const defaults = buildDefaultEnv();
  const existing = await readTextFile(runtimePaths.envPath);
  const overrides = getProcessRuntimeOverrides();

  if (!existing) {
    return {
      ...defaults,
      ...overrides,
    };
  }

  return {
    ...defaults,
    ...parseDotEnv(existing),
    ...overrides,
  };
}

export async function ensureLocalEnv(runtimePaths) {
  const existing = await readTextFile(runtimePaths.envPath);
  const nextEnv = buildDefaultEnv();
  const overrides = getProcessRuntimeOverrides();

  if (existing) {
    const mergedEnv = {
      ...nextEnv,
      ...parseDotEnv(existing),
      ...overrides,
    };

    await writeTextFile(runtimePaths.envPath, `${serializeEnv(mergedEnv)}\n`);
    return mergedEnv;
  }

  const initialEnv = {
    ...nextEnv,
    ...overrides,
  };
  await writeTextFile(runtimePaths.envPath, `${serializeEnv(initialEnv)}\n`);
  return initialEnv;
}
