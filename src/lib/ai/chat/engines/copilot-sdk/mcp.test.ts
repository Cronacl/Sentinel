import { describe, expect, it } from "bun:test";

import { buildCopilotMcpServers } from "./mcp";

describe("buildCopilotMcpServers", () => {
  it("maps local servers with their working directory and http servers, all tools included", () => {
    expect(
      buildCopilotMcpServers([
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
          headers: { "X-Key": "k" },
          name: "Remote",
          transport: "http",
          url: "https://mcp.example.com/mcp",
        },
      ]),
    ).toEqual({
      Docs: {
        args: ["serve"],
        command: "docs-mcp",
        env: { DOCS_TOKEN: "secret" },
        tools: ["*"],
        type: "local",
        workingDirectory: "/srv/docs",
      },
      Plain: {
        args: [],
        command: "plain",
        env: {},
        tools: ["*"],
        type: "local",
      },
      Remote: {
        headers: { "X-Key": "k" },
        tools: ["*"],
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    });
  });
});
