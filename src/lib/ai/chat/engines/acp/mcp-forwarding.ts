import type {
  McpHttpRuntimeEntry,
  McpServerRuntimeEntry,
  McpStdioRuntimeEntry,
} from "@/lib/mcp/runtime";

import type { AcpAgentCapabilityFlags } from "./schema";

// The user's configured MCP servers, forwarded to ACP agents in
// session/new|load|resume `mcpServers` (design §2.15). Every agent must
// accept stdio servers; http servers only go to agents that advertise
// mcpCapabilities.http. Servers that cannot be forwarded are skipped and
// listed so the run can say so. Pure: OAuth tokens are resolved by the
// injected `resolveOAuthToken`.

export type AcpMcpServer =
  | {
      args: string[];
      command: string;
      env: Array<{ name: string; value: string }>;
      name: string;
    }
  | {
      headers: Array<{ name: string; value: string }>;
      name: string;
      type: "http";
      url: string;
    };

export type AcpMcpSkipped = { name: string; reason: string };

export type AcpMcpForwarding = {
  servers: AcpMcpServer[];
  skipped: AcpMcpSkipped[];
};

export type AcpMcpForwardingOptions = {
  capabilities: Pick<AcpAgentCapabilityFlags, "mcpHttp">;
  /** The environment variables are read from (passthrough, header env). */
  env: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  /** An OAuth server's access token, or null when it cannot be resolved. */
  resolveOAuthToken?: (entry: McpHttpRuntimeEntry) => Promise<string | null>;
  /** True for http servers that need OAuth. */
  requiresOAuth?: (entry: McpHttpRuntimeEntry) => boolean;
};

class MissingEnvError extends Error {}

function requireEnv(env: AcpMcpForwardingOptions["env"], name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new MissingEnvError(`needs the environment variable ${name}`);
  }
  return value;
}

/** Agent-safe server names: [A-Za-z0-9_-], unique. */
function uniqueName(name: string, used: Set<string>) {
  const base =
    name
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "mcp";
  let candidate = base;
  for (let index = 2; used.has(candidate); index += 1) {
    candidate = `${base}_${index}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * ACP stdio servers have no cwd: a configured cwd wraps the command in a
 * shell that changes directory first (POSIX sh, or cmd on Windows).
 */
export function wrapStdioCommand(
  input: { args: string[]; command: string; cwd?: string | null },
  platform: NodeJS.Platform = process.platform,
) {
  if (!input.cwd) {
    return { args: input.args, command: input.command };
  }
  if (platform === "win32") {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    return {
      args: [
        "/d",
        "/s",
        "/c",
        [
          `cd /d ${quote(input.cwd)}`,
          "&&",
          quote(input.command),
          ...input.args.map(quote),
        ].join(" "),
      ],
      command: "cmd.exe",
    };
  }
  return {
    args: [
      "-c",
      'cd "$1" && shift && exec "$@"',
      "sh",
      input.cwd,
      input.command,
      ...input.args,
    ],
    command: "/bin/sh",
  };
}

function stdioServer(
  entry: McpStdioRuntimeEntry,
  name: string,
  options: AcpMcpForwardingOptions,
): AcpMcpServer {
  const env = [
    ...entry.config.envVars.map((variable) => ({
      name: variable.key,
      value: variable.value,
    })),
    ...entry.config.envPassthrough.map((variable) => ({
      name: variable,
      value: requireEnv(options.env, variable),
    })),
  ];
  const launch = wrapStdioCommand(
    {
      args: entry.config.args,
      command: entry.config.command,
      cwd: entry.config.cwd,
    },
    options.platform,
  );
  return { ...launch, env, name };
}

async function httpServer(
  entry: McpHttpRuntimeEntry,
  name: string,
  options: AcpMcpForwardingOptions,
): Promise<AcpMcpServer> {
  const headers = new Map<string, string>();
  for (const header of entry.config.headers) {
    headers.set(header.key, header.value);
  }
  for (const header of entry.config.headersFromEnv) {
    headers.set(header.key, requireEnv(options.env, header.value));
  }
  if (entry.config.bearerTokenEnvVar) {
    headers.set(
      "Authorization",
      `Bearer ${requireEnv(options.env, entry.config.bearerTokenEnvVar)}`,
    );
  }
  if (options.requiresOAuth?.(entry)) {
    const token = await options.resolveOAuthToken?.(entry);
    if (!token) {
      throw new MissingEnvError("needs to be signed in under Settings > MCP");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }
  return {
    headers: [...headers].map(([headerName, value]) => ({
      name: headerName,
      value,
    })),
    name,
    type: "http",
    url: entry.config.url,
  };
}

export async function buildAcpMcpServers(
  entries: readonly McpServerRuntimeEntry[],
  options: AcpMcpForwardingOptions,
): Promise<AcpMcpForwarding> {
  const servers: AcpMcpServer[] = [];
  const skipped: AcpMcpSkipped[] = [];
  const used = new Set<string>();

  for (const entry of entries) {
    if (!entry.isEnabled) {
      continue;
    }
    if (entry.transport === "http" && !options.capabilities.mcpHttp) {
      skipped.push({
        name: entry.name,
        reason: "the agent does not support HTTP MCP servers",
      });
      continue;
    }
    try {
      const name = uniqueName(entry.catalogId ?? entry.name, used);
      servers.push(
        entry.transport === "http"
          ? await httpServer(entry, name, options)
          : stdioServer(entry, name, options),
      );
    } catch (error) {
      skipped.push({
        name: entry.name,
        reason:
          error instanceof MissingEnvError
            ? error.message
            : "could not be read",
      });
    }
  }

  return { servers, skipped };
}
