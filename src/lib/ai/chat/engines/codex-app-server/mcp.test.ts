import { describe, expect, it } from "bun:test";

import type { ForwardedMcpServer } from "../platform/mcp-forwarding";
import { buildCodexMcpServers, buildCodexThreadMcpConfig } from "./mcp";

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

describe("buildCodexMcpServers", () => {
  it("writes config.toml mcp_servers entries with a native cwd", () => {
    expect(buildCodexMcpServers(servers)).toEqual({
      Docs: {
        args: ["serve"],
        command: "docs-mcp",
        cwd: "/srv/docs",
        env: { DOCS_TOKEN: "secret" },
      },
      Open: { url: "https://open.example" },
      Plain: { args: [], command: "plain" },
      Remote: {
        http_headers: { Authorization: "Bearer t" },
        url: "https://mcp.example.com/mcp",
      },
    });
  });

  it("puts them under mcp_servers in the thread config, or sends none", () => {
    expect(buildCodexThreadMcpConfig(servers)).toEqual({
      mcp_servers: buildCodexMcpServers(servers),
    });
    expect(buildCodexThreadMcpConfig([])).toBeNull();
  });
});
