import { afterEach, describe, expect, it } from "bun:test";

import { register } from "./instrumentation";
import { getConfiguredInternalToken } from "./server/http/internal-token";

const TOKEN = "b".repeat(64);
const KEY = "d".repeat(64);
const original = {
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  SENTINEL_INTERNAL_TOKEN: process.env.SENTINEL_INTERNAL_TOKEN,
};
const globals = globalThis as {
  __sentinelEncryptionKey?: string;
  __sentinelInternalToken?: string;
};

afterEach(() => {
  delete globals.__sentinelInternalToken;
  delete globals.__sentinelEncryptionKey;
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("server instrumentation", () => {
  it("captures the internal token before the Node server spawns anything", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    await register();

    expect(process.env.SENTINEL_INTERNAL_TOKEN).toBeUndefined();
    expect(getConfiguredInternalToken()).toBe(TOKEN);
  });

  it("moves an environment ENCRYPTION_KEY out of process.env", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.ENCRYPTION_KEY = KEY;

    await register();

    // Children built from process.env can no longer inherit it; env.js
    // reads the captured value instead.
    expect(process.env.ENCRYPTION_KEY).toBeUndefined();
    expect(globals.__sentinelEncryptionKey).toBe(KEY);
  });

  it("leaves the edge runtime alone", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    await register();

    expect(process.env.SENTINEL_INTERNAL_TOKEN).toBe(TOKEN);
  });
});
