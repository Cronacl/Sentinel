import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  McpHttpRuntimeEntry,
  McpServerRuntimeEntry,
  McpStdioRuntimeEntry,
} from "@/lib/mcp/runtime";

// The user's configured MCP servers, resolved for an external agent (design
// acp-and-agents §2.15): enabled entries only, env and headers materialized
// (static values, passthrough variables, bearer-token variables and stored
// OAuth tokens), names made agent-safe. Each engine turns the result into
// its own shape (ACP mcpServers, Codex mcp_servers, Claude and Copilot
// mcpServers, OpenCode mcp). Servers that cannot be forwarded are skipped
// and listed so the run can say so. Pure: OAuth tokens come from the
// injected `resolveOAuthToken`.
//
// The values are secrets: they go to the agent process only (its launch
// config or its environment), never to logs or the client. `skipped`
// holds names and reasons only.

export type ForwardedMcpStdioServer = {
  args: string[];
  command: string;
  /** Resolved and existing; null starts the server in the agent's cwd. */
  cwd: string | null;
  env: Record<string, string>;
  name: string;
  transport: "stdio";
};

export type ForwardedMcpHttpServer = {
  headers: Record<string, string>;
  name: string;
  transport: "http";
  url: string;
};

export type ForwardedMcpServer =
  ForwardedMcpHttpServer | ForwardedMcpStdioServer;

export type ForwardedMcpSkipped = { name: string; reason: string };

export type ForwardedMcpServers = {
  servers: ForwardedMcpServer[];
  skipped: ForwardedMcpSkipped[];
};

export const NO_FORWARDED_MCP_SERVERS: ForwardedMcpServers = Object.freeze({
  servers: [],
  skipped: [],
}) as ForwardedMcpServers;

export type McpForwardingOptions = {
  /** The environment variables are read from (passthrough, header env). */
  env: Record<string, string | undefined>;
  /** Whether a configured cwd exists (default fs.existsSync). */
  exists?: (directory: string) => boolean;
  /** What `~` in a configured cwd means (default os.homedir()). */
  homeDir?: string;
  /** False for agents that only take stdio servers (default true). */
  http?: boolean;
  /** Put before every name (within the length cap); see MCP_NAME_PREFIX. */
  namePrefix?: string;
  /** An OAuth server's access token, or null when it cannot be resolved. */
  resolveOAuthToken?: (entry: McpHttpRuntimeEntry) => Promise<string | null>;
  /** True for http servers that need OAuth. */
  requiresOAuth?: (entry: McpHttpRuntimeEntry) => boolean;
};

// OpenCode skips every tool of a server whose name is over 64 characters
// (its tool namespace limit); the suffix of a duplicate needs room too.
const MAX_SERVER_NAME_LENGTH = 48;

/**
 * For agents that merge the forwarded servers into their own config by
 * name, field by field (Codex config overrides over config.toml, OpenCode
 * 1.x config content over opencode.json, and OpenCode 2.x's runtime set):
 * a same-named server of the user's would be merged into an invalid entry
 * (command and url both set) or removed with ours. Prefixed names cannot
 * collide.
 */
export const MCP_NAME_PREFIX = "sentinel_";

class MissingEnvError extends Error {}

function requireEnv(env: McpForwardingOptions["env"], name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new MissingEnvError(`needs the environment variable ${name}`);
  }
  return value;
}

/** Agent-safe server names: [A-Za-z0-9_-], at most 48 characters, unique. */
function uniqueName(name: string, used: Set<string>, prefix = "") {
  const base =
    prefix +
    (name
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_SERVER_NAME_LENGTH - prefix.length) || "mcp");
  let candidate = base;
  for (let index = 2; used.has(candidate); index += 1) {
    candidate = `${base}_${index}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * For agents whose stdio servers have no cwd: a configured cwd wraps the
 * command in a shell that changes directory first (POSIX sh, or cmd on
 * Windows).
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

/**
 * The directory a stdio server starts in, as Sentinel's own MCP client
 * resolves it (lib/mcp/tools.ts getResolvedStdioCwd): `~` expanded, and a
 * directory that does not exist replaced by the session's cwd (null: the
 * agent starts servers there).
 */
export function resolveForwardedStdioCwd(
  entry: Pick<McpStdioRuntimeEntry, "config">,
  options: Pick<McpForwardingOptions, "exists" | "homeDir">,
) {
  const configured = entry.config.cwd?.trim();
  if (!configured) {
    return null;
  }
  const home = options.homeDir ?? os.homedir();
  const expanded =
    configured === "~"
      ? home
      : configured.startsWith("~/")
        ? path.join(home, configured.slice(2))
        : configured;
  return (options.exists ?? existsSync)(expanded) ? expanded : null;
}

function stdioServer(
  entry: McpStdioRuntimeEntry,
  name: string,
  options: McpForwardingOptions,
): ForwardedMcpStdioServer {
  const env: Record<string, string> = {};
  for (const variable of entry.config.envVars) {
    env[variable.key] = variable.value;
  }
  for (const variable of entry.config.envPassthrough) {
    env[variable] = requireEnv(options.env, variable);
  }
  return {
    args: [...entry.config.args],
    command: entry.config.command,
    cwd: resolveForwardedStdioCwd(entry, options),
    env,
    name,
    transport: "stdio",
  };
}

async function httpServer(
  entry: McpHttpRuntimeEntry,
  name: string,
  options: McpForwardingOptions,
): Promise<ForwardedMcpHttpServer> {
  const headers: Record<string, string> = {};
  for (const header of entry.config.headers) {
    headers[header.key] = header.value;
  }
  for (const header of entry.config.headersFromEnv) {
    headers[header.key] = requireEnv(options.env, header.value);
  }
  if (entry.config.bearerTokenEnvVar) {
    headers.Authorization = `Bearer ${requireEnv(
      options.env,
      entry.config.bearerTokenEnvVar,
    )}`;
  }
  if (options.requiresOAuth?.(entry)) {
    const token = await options.resolveOAuthToken?.(entry);
    if (!token) {
      throw new MissingEnvError("needs to be signed in under Settings > MCP");
    }
    headers.Authorization = `Bearer ${token}`;
  }
  return { headers, name, transport: "http", url: entry.config.url };
}

export async function resolveForwardedMcpServers(
  entries: readonly McpServerRuntimeEntry[],
  options: McpForwardingOptions,
): Promise<ForwardedMcpServers> {
  const servers: ForwardedMcpServer[] = [];
  const skipped: ForwardedMcpSkipped[] = [];
  const used = new Set<string>();

  for (const entry of entries) {
    if (!entry.isEnabled) {
      continue;
    }
    if (entry.transport === "http" && options.http === false) {
      skipped.push({
        name: entry.name,
        reason: "the agent does not support HTTP MCP servers",
      });
      continue;
    }
    try {
      const name = uniqueName(
        entry.catalogId ?? entry.name,
        used,
        options.namePrefix,
      );
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

/**
 * A digest of the forwarded servers (secrets included, so a rotated token
 * counts as a change). Agents that keep servers for a session or a process
 * compare it to know when to reopen or reconfigure. Never persisted.
 */
export function forwardedMcpServersKey(servers: readonly ForwardedMcpServer[]) {
  if (servers.length === 0) {
    return "";
  }
  return createHash("sha256").update(JSON.stringify(servers)).digest("hex");
}
