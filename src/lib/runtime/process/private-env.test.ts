import { afterEach, describe, expect, it } from "bun:test";

import {
  captureEncryptionKey,
  SENTINEL_PRIVATE_ENV_KEYS,
  withoutSentinelPrivateEnv,
} from "./private-env";

const KEY = "c".repeat(64);
const globalForKey = globalThis as { __sentinelEncryptionKey?: string };

afterEach(() => {
  delete globalForKey.__sentinelEncryptionKey;
});

describe("Sentinel private env", () => {
  it("strips the server secrets and keeps what agents need", () => {
    const env = {
      ANTHROPIC_API_KEY: "agent-key",
      ENCRYPTION_KEY: KEY,
      HOME: "/home/me",
      PATH: "/usr/bin",
      SENTINEL_INTERNAL_TOKEN: "t".repeat(64),
    };

    expect(withoutSentinelPrivateEnv(env)).toEqual({
      ANTHROPIC_API_KEY: "agent-key",
      HOME: "/home/me",
      PATH: "/usr/bin",
    });
    // A copy: the caller's env is untouched.
    expect(env.ENCRYPTION_KEY).toBe(KEY);
    expect([...SENTINEL_PRIVATE_ENV_KEYS].sort()).toEqual([
      "ENCRYPTION_KEY",
      "SENTINEL_INTERNAL_TOKEN",
    ]);
  });

  it("moves ENCRYPTION_KEY out of the environment into server memory", () => {
    const env: Record<string, string | undefined> = {
      ENCRYPTION_KEY: KEY,
      PATH: "/usr/bin",
    };

    captureEncryptionKey(env);
    expect(env).toEqual({ PATH: "/usr/bin" });
    expect(globalForKey.__sentinelEncryptionKey).toBe(KEY);

    // Idempotent: a second capture keeps the first value.
    captureEncryptionKey(env);
    expect(globalForKey.__sentinelEncryptionKey).toBe(KEY);
  });
});
