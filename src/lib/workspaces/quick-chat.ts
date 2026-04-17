import { mkdirSync } from "node:fs";
import path from "node:path";

import { getSentinelStateRoot } from "@/lib/runtime/local-state";

export const QUICK_CHAT_WORKSPACE_NAME = "Quick chats";

export function getQuickChatRootPath() {
  return path.join(getSentinelStateRoot(), "chats");
}

export function ensureQuickChatRootDirectory() {
  const rootPath = getQuickChatRootPath();
  mkdirSync(rootPath, { recursive: true });
  return rootPath;
}
