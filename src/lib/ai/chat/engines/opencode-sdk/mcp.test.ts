import { describe, expect, it } from "bun:test";

import type { ForwardedMcpServer } from "../platform/mcp-forwarding";
import {
  buildOpenCodeV1McpConfig,
  buildOpenCodeV2McpServers,
  mergeOpenCodeConfigContent,
} from "./mcp";

const servers: ForwardedMcpServer[] = [
  {
    args: ["serve"],
    command: "docs-mcp",
    cwd: "/srv/docs",
    env: { DOCS_TOKEN: "secret" },
    name: "Docs",
    transport: "stdio",
  },
  {
    args: [],
    command: "plain",
    cwd: null,
    env: {},
    name: "Plain",
    transport: "stdio",
  },
  {
    headers: { Authorization: "Bearer t" },
    name: "Remote",
    transport: "http",
    url: "https://mcp.example.com/mcp",
  },
  { headers: {}, name: "Open", transport: "http", url: "https://open.example" },
];

describe("OpenCode MCP shapes", () => {
  it("1.x: local command arrays (cwd through a shell) and remote servers", () => {
    expect(buildOpenCodeV1McpConfig(servers, "darwin")).toEqual({
      Docs: {
        command: [
          "/bin/sh",
          "-c",
          'cd "$1" && shift && exec "$@"',
          "sh",
          "/srv/docs",
          "docs-mcp",
          "serve",
        ],
        environment: { DOCS_TOKEN: "secret" },
        type: "local",
      },
      Open: { type: "remote", url: "https://open.example" },
      Plain: { command: ["plain"], type: "local" },
      Remote: {
        headers: { Authorization: "Bearer t" },
        type: "remote",
        url: "https://mcp.example.com/mcp",
      },
    });
  });

  it("2.x: runtime servers with a native cwd", () => {
    expect(buildOpenCodeV2McpServers(servers)).toEqual({
      Docs: {
        command: ["docs-mcp", "serve"],
        cwd: "/srv/docs",
        environment: { DOCS_TOKEN: "secret" },
        type: "local",
      },
      Open: { type: "remote", url: "https://open.example" },
      Plain: { command: ["plain"], type: "local" },
      Remote: {
        headers: { Authorization: "Bearer t" },
        type: "remote",
        url: "https://mcp.example.com/mcp",
      },
    });
  });
});

describe("mergeOpenCodeConfigContent", () => {
  const mcp = buildOpenCodeV1McpConfig(servers.slice(2, 3));

  it("keeps the user's settings and servers, replacing same-named ones", () => {
    const merged = mergeOpenCodeConfigContent(
      JSON.stringify({
        mcp: {
          Remote: { type: "remote", url: "https://old" },
          mine: { command: ["mine"], type: "local" },
        },
        model: "anthropic/claude",
      }),
      mcp,
    );
    expect(JSON.parse(merged!)).toEqual({
      mcp: {
        mine: { command: ["mine"], type: "local" },
        Remote: mcp.Remote,
      },
      model: "anthropic/claude",
    });
  });

  it("starts from an empty config when none is set", () => {
    expect(JSON.parse(mergeOpenCodeConfigContent(undefined, mcp)!)).toEqual({
      mcp,
    });
    expect(JSON.parse(mergeOpenCodeConfigContent("  ", mcp)!)).toEqual({
      mcp,
    });
  });

  it("leaves content that is not a JSON object alone", () => {
    expect(mergeOpenCodeConfigContent("{oops", mcp)).toBeNull();
    expect(mergeOpenCodeConfigContent("[1]", mcp)).toBeNull();
    expect(mergeOpenCodeConfigContent('"x"', mcp)).toBeNull();
  });
});
