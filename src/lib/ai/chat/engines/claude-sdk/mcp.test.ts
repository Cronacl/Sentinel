import { describe, expect, it } from "bun:test";

import type { ForwardedMcpServer } from "../platform/mcp-forwarding";
import { buildClaudeMcpServers } from "./mcp";

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
    args: ["-y", "pkg"],
    command: "npx",
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
];

describe("buildClaudeMcpServers", () => {
  it("maps stdio (cwd through a shell) and streamable http servers", () => {
    expect(buildClaudeMcpServers(servers, "darwin")).toEqual({
      Docs: {
        args: [
          "-c",
          'cd "$1" && shift && exec "$@"',
          "sh",
          "/srv/docs",
          "docs-mcp",
          "serve",
        ],
        command: "/bin/sh",
        env: { DOCS_TOKEN: "secret" },
        type: "stdio",
      },
      Plain: { args: ["-y", "pkg"], command: "npx", env: {}, type: "stdio" },
      Remote: {
        headers: { Authorization: "Bearer t" },
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    });
  });

  it("changes directory through cmd on Windows", () => {
    expect(buildClaudeMcpServers(servers.slice(0, 1), "win32").Docs).toEqual(
      expect.objectContaining({ command: "cmd.exe", type: "stdio" }),
    );
  });
});
