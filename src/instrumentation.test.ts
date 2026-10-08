import { afterEach, describe, expect, it } from "bun:test";

import { register } from "./instrumentation";
import { getConfiguredInternalToken } from "./server/http/internal-token";

const TOKEN = "b".repeat(64);
const original = {
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  SENTINEL_INTERNAL_TOKEN: process.env.SENTINEL_INTERNAL_TOKEN,
};

afterEach(() => {
  delete (globalThis as { __sentinelInternalToken?: string })
    .__sentinelInternalToken;
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

  it("leaves the edge runtime alone", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.SENTINEL_INTERNAL_TOKEN = TOKEN;

    await register();

    expect(process.env.SENTINEL_INTERNAL_TOKEN).toBe(TOKEN);
  });
});
