import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

import type {
  McpHttpRuntimeEntry,
  McpServerRuntimeEntry,
  McpStdioRuntimeEntry,
} from "@/lib/mcp/runtime";

type McpToolMap = Record<string, any>;

type CachedMcpServerTools = {
  close: () => Promise<void>;
  key: string;
  serverId: string;
  tools: McpToolMap;
};

const MCP_SAFE_TOOL_PATTERNS = [
  /\bget\b/i,
  /\blist\b/i,
  /\bread\b/i,
  /\bfetch\b/i,
  /\bfind\b/i,
  /\bsearch\b/i,
  /\btabs?\b/i,
  /\bsnapshot\b/i,
  /\bscreenshot\b/i,
  /\bconsole\b/i,
  /\bnetwork\b/i,
  /\blogs?\b/i,
  /\bwait\b/i,
  /\bnavigate\b/i,
  /\bback\b/i,
  /\bforward\b/i,
  /\breload\b/i,
];

const MCP_MUTATING_TOOL_PATTERNS = [
  /\bclick\b/i,
  /\btype\b/i,
  /\bpress\b/i,
  /\bdrag\b/i,
  /\bdrop\b/i,
  /\bfill\b/i,
  /\bselect\b/i,
  /\bhover\b/i,
  /\bupload\b/i,
  /\bdownload\b/i,
  /\bsubmit\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bwrite\b/i,
  /\bedit\b/i,
  /\bclose\b/i,
  /\bstart\b/i,
  /\bstop\b/i,
];

const cachedToolServers = new Map<string, Promise<CachedMcpServerTools>>();
const cachedKeyByServerId = new Map<string, string>();

function requireEnvValue(envVar: string, serverName: string) {
  const value = process.env[envVar]?.trim();

  if (!value) {
    throw new Error(
      `MCP server "${serverName}" requires environment variable "${envVar}".`,
    );
  }

  return value;
}

function resolveHttpHeaders(entry: McpHttpRuntimeEntry) {
  const headers = new Headers();

  for (const header of entry.config.headers) {
    headers.set(header.key, header.value);
  }

  for (const header of entry.config.headersFromEnv) {
    headers.set(header.key, requireEnvValue(header.value, entry.name));
  }

  if (entry.config.bearerTokenEnvVar) {
    headers.set(
      "Authorization",
      `Bearer ${requireEnvValue(entry.config.bearerTokenEnvVar, entry.name)}`,
    );
  }

  return Object.fromEntries(headers.entries());
}

function resolveStdioEnv(entry: McpStdioRuntimeEntry) {
  const env: Record<string, string> = {};

  for (const variable of entry.config.envVars) {
    env[variable.key] = variable.value;
  }

  for (const envName of entry.config.envPassthrough) {
    env[envName] = requireEnvValue(envName, entry.name);
  }

  return env;
}

function getResolvedStdioCwd(
  entry: McpStdioRuntimeEntry,
  workspaceRoot: string | null,
) {
  return entry.config.cwd || workspaceRoot || undefined;
}

function getMcpServerCacheKey(
  entry: McpServerRuntimeEntry,
  workspaceRoot: string | null,
) {
  return JSON.stringify({
    config: entry.config,
    id: entry.id,
    name: entry.name,
    resolvedCwd:
      entry.transport === "stdio"
        ? (getResolvedStdioCwd(entry, workspaceRoot) ?? null)
        : null,
    transport: entry.transport,
  });
}

function shouldRequireMcpApproval(toolName: string, description?: string) {
  const signal = `${toolName} ${description ?? ""}`.replaceAll("_", " ");

  if (MCP_MUTATING_TOOL_PATTERNS.some((pattern) => pattern.test(signal))) {
    return true;
  }

  if (MCP_SAFE_TOOL_PATTERNS.some((pattern) => pattern.test(signal))) {
    return false;
  }

  return true;
}

function namespaceMcpTools(entry: McpServerRuntimeEntry, tools: McpToolMap) {
  const namespaced: McpToolMap = {};

  for (const [toolName, toolConfig] of Object.entries(tools)) {
    const description = toolConfig.description ?? toolName;

    namespaced[`mcp_${entry.id}__${toolName}`] = {
      ...toolConfig,
      description: `[MCP ${entry.name}] ${description}`,
      needsApproval: () => shouldRequireMcpApproval(toolName, description),
    };
  }

  return namespaced;
}

async function createCachedServerTools(
  entry: McpServerRuntimeEntry,
  workspaceRoot: string | null,
): Promise<CachedMcpServerTools> {
  let client: {
    close: () => Promise<void>;
    tools: () => Promise<McpToolMap>;
  };

  if (entry.transport === "http") {
    client = await createMCPClient({
      transport: {
        headers: resolveHttpHeaders(entry),
        type: "http",
        url: entry.config.url,
      },
    });
  } else {
    client = await createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        args: entry.config.args,
        command: entry.config.command,
        cwd: getResolvedStdioCwd(entry, workspaceRoot),
        env: resolveStdioEnv(entry),
      }),
    });
  }

  return {
    close: client.close,
    key: getMcpServerCacheKey(entry, workspaceRoot),
    serverId: entry.id,
    tools: namespaceMcpTools(entry, await client.tools()),
  };
}

async function closeCachedServerKey(cacheKey: string) {
  const cached = cachedToolServers.get(cacheKey);
  cachedToolServers.delete(cacheKey);

  if (!cached) {
    return;
  }

  const resolved = await cached.catch(() => null);

  if (!resolved) {
    return;
  }

  if (cachedKeyByServerId.get(resolved.serverId) === cacheKey) {
    cachedKeyByServerId.delete(resolved.serverId);
  }

  await resolved.close().catch(() => undefined);
}

async function getCachedServerTools(
  entry: McpServerRuntimeEntry,
  workspaceRoot: string | null,
) {
  const nextKey = getMcpServerCacheKey(entry, workspaceRoot);
  const previousKey = cachedKeyByServerId.get(entry.id);

  if (previousKey === nextKey) {
    return cachedToolServers.get(nextKey) ?? null;
  }

  if (previousKey && previousKey !== nextKey) {
    void closeCachedServerKey(previousKey);
  }

  const pending = createCachedServerTools(entry, workspaceRoot).catch(
    (error) => {
      cachedToolServers.delete(nextKey);
      if (cachedKeyByServerId.get(entry.id) === nextKey) {
        cachedKeyByServerId.delete(entry.id);
      }
      throw error;
    },
  );

  cachedKeyByServerId.set(entry.id, nextKey);
  cachedToolServers.set(nextKey, pending);
  return pending;
}

export async function resetMcpToolCache() {
  const keys = [...cachedToolServers.keys()];
  await Promise.allSettled(
    keys.map((cacheKey) => closeCachedServerKey(cacheKey)),
  );
}

export async function loadMcpTools(args: {
  entries: readonly McpServerRuntimeEntry[];
  workspaceRoot: string | null;
}) {
  const tools: McpToolMap = {};

  for (const entry of args.entries.filter((item) => item.isEnabled)) {
    try {
      const cached = await getCachedServerTools(entry, args.workspaceRoot);

      if (!cached) {
        continue;
      }

      Object.assign(tools, cached.tools);
    } catch (error) {
      console.warn(
        `[MCP] Skipping server "${entry.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    async closeAll() {
      // Desktop chat requests keep MCP clients warm to avoid reconnecting and
      // rediscovering tools before every response.
    },
    tools,
  };
}
