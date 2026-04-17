import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let stateRoot = "";

mock.module("@/lib/runtime/local-state", () => ({
  getSentinelStateRoot: () => stateRoot,
}));

beforeEach(async () => {
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-quick-chat-"));
});

afterEach(async () => {
  if (!stateRoot) {
    return;
  }

  await rm(stateRoot, { force: true, recursive: true }).catch(() => undefined);
  stateRoot = "";
});

describe("quick chat workspace helpers", () => {
  it("creates the hidden chats directory under the Sentinel state root", async () => {
    const { ensureQuickChatRootDirectory, getQuickChatRootPath } =
      await import("./quick-chat");

    const rootPath = ensureQuickChatRootDirectory();

    expect(rootPath).toBe(path.join(stateRoot, "chats"));
    expect(getQuickChatRootPath()).toBe(path.join(stateRoot, "chats"));
    expect((await stat(rootPath)).isDirectory()).toBe(true);
  });
});
