import type { OAuthClientInformation, OAuthTokens } from "@ai-sdk/mcp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { env } from "@/env";
import { decrypt, encrypt } from "@/lib/ai/providers/encrypt";

type McpOAuthStateRecord = {
  clientInformation?: OAuthClientInformation;
  codeVerifier?: string;
  state?: string;
  tokens?: OAuthTokens;
};

type McpOAuthStore = {
  servers?: Record<string, McpOAuthStateRecord>;
};

type EncryptedMcpOAuthStoreFile = {
  encrypted: true;
  payload: string;
  version: 1;
};

const STATE_DIRECTORY_MODE = 0o700;
const STATE_FILE_MODE = 0o600;

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

function isEncryptedStoreFile(
  value: unknown,
): value is EncryptedMcpOAuthStoreFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<EncryptedMcpOAuthStoreFile>;
  return (
    candidate.encrypted === true &&
    candidate.version === 1 &&
    typeof candidate.payload === "string"
  );
}

async function readStore(): Promise<McpOAuthStore> {
  try {
    const raw = await readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (isEncryptedStoreFile(parsed)) {
      return JSON.parse(decrypt(parsed.payload)) as McpOAuthStore;
    }

    return parsed as McpOAuthStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeStore(store: McpOAuthStore) {
  const storePath = getStorePath();
  const payload: EncryptedMcpOAuthStoreFile = {
    encrypted: true,
    payload: encrypt(JSON.stringify(store)),
    version: 1,
  };

  await mkdir(path.dirname(storePath), {
    mode: STATE_DIRECTORY_MODE,
    recursive: true,
  });
  await writeFile(storePath, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: STATE_FILE_MODE,
  });
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
