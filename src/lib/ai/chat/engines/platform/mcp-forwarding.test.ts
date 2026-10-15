import { describe, expect, it } from "bun:test";

import type { McpServerRuntimeEntry } from "@/lib/mcp/runtime";

import {
  forwardedMcpServersKey,
  resolveForwardedMcpServers,
} from "./mcp-forwarding";

const stdio = {
  config: {
    args: ["--port", "1"],
    command: "mcp-server",
    cwd: "~/tools",
    envPassthrough: ["TOKEN"],
    envVars: [{ key: "MODE", value: "x" }],
  },
  id: "1",
  isEnabled: true,
  name: "My Server",
  transport: "stdio",
} satisfies McpServerRuntimeEntry;

const http = {
  config: {
    bearerTokenEnvVar: "API",
    headers: [{ key: "X-A", value: "1" }],
    headersFromEnv: [{ key: "X-B", value: "B_VALUE" }],
    url: "https://mcp.example.com",
  },
  id: "2",
  isEnabled: true,
  name: "Remote",
  transport: "http",
} satisfies McpServerRuntimeEntry;

const options = {
  env: { API: "secret", B_VALUE: "b", TOKEN: "t" },
  exists: () => true,
  homeDir: "/Users/me",
};

describe("resolveForwardedMcpServers", () => {
  it("materializes env, cwd and headers of enabled servers", async () => {
    const result = await resolveForwardedMcpServers(
      [stdio, http, { ...stdio, id: "3", isEnabled: false, name: "Off" }],
      options,
    );

    expect(result.skipped).toEqual([]);
    expect(result.servers).toEqual([
      {
        args: ["--port", "1"],
        command: "mcp-server",
        cwd: "/Users/me/tools",
        env: { MODE: "x", TOKEN: "t" },
        name: "My_Server",
        transport: "stdio",
      },
      {
        headers: { Authorization: "Bearer secret", "X-A": "1", "X-B": "b" },
        name: "Remote",
        transport: "http",
        url: "https://mcp.example.com",
      },
    ]);
  });

  it("skips servers missing their env, http for stdio-only agents, and unsigned OAuth", async () => {
    const result = await resolveForwardedMcpServers(
      [
        stdio,
        { ...http, config: { ...http.config, headersFromEnv: [] } },
        {
          ...http,
          config: { headers: [], headersFromEnv: [], url: "https://o.example" },
          id: "4",
          name: "OAuth",
        },
      ],
      {
        env: { API: "secret" },
        requiresOAuth: (entry) => entry.name === "OAuth",
        resolveOAuthToken: async () => null,
      },
    );

    expect(result.servers.map((server) => server.name)).toEqual(["Remote"]);
    expect(result.skipped).toEqual([
      { name: "My Server", reason: "needs the environment variable TOKEN" },
      { name: "OAuth", reason: "needs to be signed in under Settings > MCP" },
    ]);

    const stdioOnly = await resolveForwardedMcpServers([stdio, http], {
      ...options,
      http: false,
    });
    expect(stdioOnly.servers.map((server) => server.name)).toEqual([
      "My_Server",
    ]);
    expect(stdioOnly.skipped).toEqual([
      { name: "Remote", reason: "the agent does not support HTTP MCP servers" },
    ]);
  });

  it("sends the stored OAuth token as the bearer header", async () => {
    const result = await resolveForwardedMcpServers(
      [
        {
          ...http,
          config: { headers: [], headersFromEnv: [], url: "https://o" },
        },
      ],
      {
        env: {},
        requiresOAuth: () => true,
        resolveOAuthToken: async () => "oauth-token",
      },
    );
    expect(result.servers).toEqual([
      {
        headers: { Authorization: "Bearer oauth-token" },
        name: "Remote",
        transport: "http",
        url: "https://o",
      },
    ]);
  });

  it("makes names agent-safe, short and unique, preferring the catalog id", async () => {
    const result = await resolveForwardedMcpServers(
      [
        { ...stdio, config: { ...stdio.config, envPassthrough: [] } },
        {
          ...stdio,
          config: { ...stdio.config, envPassthrough: [] },
          id: "5",
          name: "My  Server!",
        },
        { ...http, catalogId: "github", id: "6", name: "GitHub (work)" },
        { ...http, id: "7", name: "x".repeat(80) },
      ],
      options,
    );
    expect(result.servers.map((server) => server.name)).toEqual([
      "My_Server",
      "My_Server_2",
      "github",
      "x".repeat(48),
    ]);
  });

  it("starts a server whose cwd is missing in the agent's cwd", async () => {
    const result = await resolveForwardedMcpServers([stdio], {
      ...options,
      exists: () => false,
    });
    expect(result.servers[0]).toMatchObject({ cwd: null });
  });
});

describe("forwardedMcpServersKey", () => {
  it("is empty without servers and changes with any forwarded value", async () => {
    const { servers } = await resolveForwardedMcpServers([http], options);
    const rotated = await resolveForwardedMcpServers([http], {
      ...options,
      env: { ...options.env, API: "rotated" },
    });

    expect(forwardedMcpServersKey([])).toBe("");
    expect(forwardedMcpServersKey(servers)).toMatch(/^[0-9a-f]{64}$/);
    expect(forwardedMcpServersKey(servers)).toBe(
      forwardedMcpServersKey(structuredClone(servers)),
    );
    expect(forwardedMcpServersKey(rotated.servers)).not.toBe(
      forwardedMcpServersKey(servers),
    );
  });
});
