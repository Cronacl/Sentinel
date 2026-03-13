import type { OAuthClientInformation, OAuthTokens } from "@ai-sdk/mcp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { env } from "@/env";

type McpOAuthStateRecord = {
  clientInformation?: OAuthClientInformation;
  codeVerifier?: string;
  state?: string;
  tokens?: OAuthTokens;
};

type McpOAuthStore = {
  servers?: Record<string, McpOAuthStateRecord>;
};

function getStateRoot() {
  if (env.SENTINEL_STATE_PATH?.trim()) {
    return path.dirname(env.SENTINEL_STATE_PATH.trim());
  }

  return path.join(os.homedir(), ".sentinel");
}

function getStorePath() {
  return path.join(getStateRoot(), "mcp-oauth.json");
}

function getStoreKey(userId: string, serverId: string) {
  return `${userId}:${serverId}`;
}

async function readStore(): Promise<McpOAuthStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    return JSON.parse(raw) as McpOAuthStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeStore(store: McpOAuthStore) {
  const storePath = getStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function getMcpOAuthState(args: {
  serverId: string;
  userId: string;
}) {
  const store = await readStore();
  return store.servers?.[getStoreKey(args.userId, args.serverId)] ?? null;
}

export async function updateMcpOAuthState(
  args: {
    serverId: string;
    userId: string;
  },
  updater: (current: McpOAuthStateRecord | null) => McpOAuthStateRecord | null,
) {
  const store = await readStore();
  const key = getStoreKey(args.userId, args.serverId);
  const next = updater(store.servers?.[key] ?? null);

  if (!store.servers) {
    store.servers = {};
  }

  if (next) {
    store.servers[key] = next;
  } else {
    delete store.servers[key];
  }

  await writeStore(store);
  return next;
}
