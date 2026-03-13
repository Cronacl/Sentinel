// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const close = mock(async () => undefined);
const createMCPClient = mock(async (config) => ({
  close,
  tools: async () =>
    config.transport.type === "http"
      ? {
          fetch_remote: {
            description: "Fetch remote data",
            execute: async () => ({ ok: true }),
          },
        }
      : {
          run_local: {
            description: "Run local tool",
            execute: async () => ({ ok: true }),
          },
        },
}));

const stdioCtorCalls: any[] = [];

class MockStdioTransport {
  constructor(config: any) {
    stdioCtorCalls.push(config);
  }
}

mock.module("@ai-sdk/mcp", () => ({
  createMCPClient,
}));

mock.module("@ai-sdk/mcp/mcp-stdio", () => ({
  Experimental_StdioMCPTransport: MockStdioTransport,
}));

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: (value: string) => value,
  encrypt: (value: string) => value,
}));

const { buildMcpServerRuntimeEntries } = await import("./runtime");
const { loadMcpTools, resetMcpToolCache } = await import("./tools");

beforeEach(() => {
  close.mockReset();
  createMCPClient.mockReset();
  stdioCtorCalls.length = 0;

  createMCPClient.mockImplementation(async (config) => ({
    close,
    tools: async () =>
      config.transport.type === "http"
        ? {
            fetch_remote: {
              description: "Fetch remote data",
              execute: async () => ({ ok: true }),
            },
          }
        : {
            run_local: {
              description: "Run local tool",
              execute: async () => ({ ok: true }),
            },
          },
  }));
});

afterEach(async () => {
  await resetMcpToolCache();
  mock.restore();
  delete process.env.MCP_TOKEN;
  delete process.env.MCP_HEADER;
  delete process.env.OPENAI_API_KEY;
});

describe("mcp runtime", () => {
  it("filters invalid stored entries", () => {
    const entries = buildMcpServerRuntimeEntries([
      {
        encryptedConfig: JSON.stringify({
          headers: [],
          headersFromEnv: [],
          url: "https://mcp.example.com",
        }),
        id: "server-1",
        isEnabled: true,
        name: "Remote",
        transport: "http",
      },
      {
        encryptedConfig: "broken",
        id: "server-2",
        isEnabled: true,
        name: "Broken",
        transport: "stdio",
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("server-1");
  });

  it("loads tools, namespaces them, and reuses warm MCP clients", async () => {
    process.env.MCP_TOKEN = "secret";
    process.env.MCP_HEADER = "dynamic";
    process.env.OPENAI_API_KEY = "key";

    const result = await loadMcpTools({
      entries: [
        {
          config: {
            bearerTokenEnvVar: "MCP_TOKEN",
            headers: [{ key: "x-api-version", value: "1" }],
            headersFromEnv: [{ key: "x-runtime", value: "MCP_HEADER" }],
            url: "https://mcp.example.com",
          },
          id: "remote",
          isEnabled: true,
          name: "Remote",
          transport: "http",
        },
        {
          config: {
            args: ["serve"],
            command: "npx",
            cwd: undefined,
            envPassthrough: ["OPENAI_API_KEY"],
            envVars: [{ key: "MODE", value: "dev" }],
          },
          id: "local",
          isEnabled: true,
          name: "Local",
          transport: "stdio",
        },
      ],
      workspaceRoot: "/tmp/workspace",
    });

    expect(result.tools).toHaveProperty("mcp_remote__fetch_remote");
    expect(result.tools).toHaveProperty("mcp_local__run_local");
    expect(await result.tools.mcp_remote__fetch_remote.needsApproval()).toBe(
      false,
    );
    expect(stdioCtorCalls[0]).toEqual({
      args: ["serve"],
      command: "npx",
      cwd: "/tmp/workspace",
      env: {
        MODE: "dev",
        OPENAI_API_KEY: "key",
      },
    });

    const second = await loadMcpTools({
      entries: [
        {
          config: {
            bearerTokenEnvVar: "MCP_TOKEN",
            headers: [{ key: "x-api-version", value: "1" }],
            headersFromEnv: [{ key: "x-runtime", value: "MCP_HEADER" }],
            url: "https://mcp.example.com",
          },
          id: "remote",
          isEnabled: true,
          name: "Remote",
          transport: "http",
        },
        {
          config: {
            args: ["serve"],
            command: "npx",
            cwd: undefined,
            envPassthrough: ["OPENAI_API_KEY"],
            envVars: [{ key: "MODE", value: "dev" }],
          },
          id: "local",
          isEnabled: true,
          name: "Local",
          transport: "stdio",
        },
      ],
      workspaceRoot: "/tmp/workspace",
    });

    expect(second.tools).toHaveProperty("mcp_remote__fetch_remote");
    expect(createMCPClient).toHaveBeenCalledTimes(2);

    await result.closeAll();
    expect(close).not.toHaveBeenCalled();
  });

  it("requires approval for mutating browser actions", async () => {
    createMCPClient.mockImplementationOnce(async () => ({
      close,
      tools: async () => ({
        browser_click: {
          description: "Click an element in the active page",
          execute: async () => ({ ok: true }),
        },
        browser_tabs: {
          description: "List current browser tabs",
          execute: async () => ({ ok: true }),
        },
      }),
    }));

    const result = await loadMcpTools({
      entries: [
        {
          config: {
            args: ["@playwright/mcp@latest"],
            command: "npx",
            cwd: undefined,
            envPassthrough: [],
            envVars: [],
          },
          id: "playwright",
          isEnabled: true,
          name: "Playwright",
          transport: "stdio",
        },
      ],
      workspaceRoot: "/tmp/workspace",
    });

    expect(
      await result.tools.mcp_playwright__browser_click.needsApproval(),
    ).toBe(true);
    expect(
      await result.tools.mcp_playwright__browser_tabs.needsApproval(),
    ).toBe(false);
  });

  it("skips servers with missing env vars", async () => {
    const warn = mock(() => undefined);
    const originalWarn = console.warn;
    console.warn = warn as never;

    const result = await loadMcpTools({
      entries: [
        {
          config: {
            bearerTokenEnvVar: "MISSING_TOKEN",
            headers: [],
            headersFromEnv: [],
            url: "https://mcp.example.com",
          },
          id: "remote",
          isEnabled: true,
          name: "Remote",
          transport: "http",
        },
      ],
      workspaceRoot: null,
    });

    expect(result.tools).toEqual({});
    expect(warn).toHaveBeenCalled();
    console.warn = originalWarn;
  });
});
