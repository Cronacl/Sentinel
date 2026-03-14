// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let mockedStatePath = "";
const tempRoots: string[] = [];

mock.module("@/env", () => ({
  env: {
    get SENTINEL_STATE_PATH() {
      return mockedStatePath;
    },
  },
}));

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: (value: string) => Buffer.from(value, "base64").toString("utf8"),
  encrypt: (value: string) => Buffer.from(value, "utf8").toString("base64"),
}));

const { getMcpOAuthState, updateMcpOAuthState } = await import("./oauth-state");

async function createStateRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-mcp-oauth-"));
  tempRoots.push(root);
  mockedStatePath = path.join(root, "state.json");
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("mcp oauth state storage", () => {
  it("stores OAuth state encrypted at rest", async () => {
    const root = await createStateRoot();
    const storePath = path.join(root, "mcp-oauth.json");

    await updateMcpOAuthState(
      { serverId: "server-1", userId: "user-1" },
      () => ({
        state: "oauth-state",
        tokens: {
          accessToken: "secret-token",
          tokenType: "Bearer",
        },
      }),
    );

    const stored = await readFile(storePath, "utf8");
    expect(stored).toContain('"encrypted": true');
    expect(stored).not.toContain("secret-token");

    const record = await getMcpOAuthState({
      serverId: "server-1",
      userId: "user-1",
    });

    expect(record?.tokens?.accessToken).toBe("secret-token");
  });

  it("reads legacy plaintext stores and rewrites them encrypted", async () => {
    const root = await createStateRoot();
    const storePath = path.join(root, "mcp-oauth.json");

    await writeFile(
      storePath,
      JSON.stringify(
        {
          servers: {
            "user-1:server-1": {
              state: "legacy-state",
              tokens: {
                accessToken: "legacy-token",
                tokenType: "Bearer",
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const beforeRewrite = await getMcpOAuthState({
      serverId: "server-1",
      userId: "user-1",
    });
    expect(beforeRewrite?.tokens?.accessToken).toBe("legacy-token");

    await updateMcpOAuthState(
      { serverId: "server-1", userId: "user-1" },
      (current) => current,
    );

    const stored = await readFile(storePath, "utf8");
    expect(stored).toContain('"encrypted": true');
    expect(stored).not.toContain("legacy-token");
  });
});
