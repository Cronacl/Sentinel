// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(async () => null);
const findMany = mock(async () => []);
const insertRun = mock(() => undefined);
const insertValues = mock(() => ({ run: insertRun }));
const insert = mock(() => ({ values: insertValues }));
const updateRun = mock(() => undefined);
const updateWhere = mock(() => ({ run: updateRun }));
const updateSet = mock(() => ({ where: updateWhere }));
const update = mock(() => ({ set: updateSet }));
const deleteRun = mock(() => undefined);
const deleteWhere = mock(() => ({ run: deleteRun }));
const deleteConfig = mock(() => ({ where: deleteWhere }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/server/db/schema", () => ({
  mcpServerConfigs: {
    catalogId: "mcpServerConfigs.catalogId",
    createdAt: "mcpServerConfigs.createdAt",
    id: "mcpServerConfigs.id",
    isEnabled: "mcpServerConfigs.isEnabled",
    userId: "mcpServerConfigs.userId",
  },
}));

mock.module("@paralleldrive/cuid2", () => ({
  createId: () => "mcp-server-1",
}));

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: (value: string) => value,
  encrypt: (value: string) => `encrypted:${value}`,
}));

const { mcpServersRouter } = await import("./mcp-servers");

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
  insertRun.mockReset();
  insertValues.mockReset();
  insert.mockReset();
  updateRun.mockReset();
  updateWhere.mockReset();
  updateSet.mockReset();
  update.mockReset();
  deleteRun.mockReset();
  deleteWhere.mockReset();
  deleteConfig.mockReset();

  findFirst.mockImplementation(async () => null);
  findMany.mockImplementation(async () => []);
  insertValues.mockImplementation(() => ({ run: insertRun }));
  insert.mockImplementation(() => ({ values: insertValues }));
  updateWhere.mockImplementation(() => ({ run: updateRun }));
  updateSet.mockImplementation(() => ({ where: updateWhere }));
  update.mockImplementation(() => ({ set: updateSet }));
  deleteWhere.mockImplementation(() => ({ run: deleteRun }));
  deleteConfig.mockImplementation(() => ({ where: deleteWhere }));
});

afterEach(() => {
  mock.restore();
});

describe("mcpServersRouter", () => {
  it("lists active and invalid servers", async () => {
    findMany.mockImplementationOnce(async () => [
      {
        encryptedConfig: JSON.stringify({
          command: "npx",
          envPassthrough: [],
          envVars: [],
        }),
        id: "server-1",
        isEnabled: true,
        name: "Filesystem",
        transport: "stdio",
      },
      {
        encryptedConfig: "not-json",
        id: "server-2",
        isEnabled: true,
        name: "Broken",
        transport: "http",
      },
    ]);

    const result = await mcpServersRouter.list({
      ctx: {
        db: {
          query: {
            mcpServerConfigs: {
              findMany,
            },
          },
        },
        session: { user: { id: "user-1" } },
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "server-1",
        status: "active",
        transport: "stdio",
      }),
      expect.objectContaining({
        id: "server-2",
        status: "invalid",
        transport: "http",
      }),
    ]);
  });

  it("returns decrypted HTTP config", async () => {
    findFirst.mockImplementationOnce(async () => ({
      encryptedConfig: JSON.stringify({
        bearerTokenEnvVar: "MCP_TOKEN",
        headers: [{ key: "x-api-version", value: "1" }],
        headersFromEnv: [],
        url: "https://mcp.example.com",
      }),
      id: "server-1",
      isEnabled: true,
      name: "Remote",
      transport: "http",
    }));

    const result = await mcpServersRouter.get({
      ctx: {
        db: {
          query: {
            mcpServerConfigs: {
              findFirst,
            },
          },
        },
        session: { user: { id: "user-1" } },
      },
      input: { id: "server-1" },
    });

    expect(result).toEqual({
      catalogId: undefined,
      config: {
        bearerTokenEnvVar: "MCP_TOKEN",
        headers: [{ key: "x-api-version", value: "1" }],
        headersFromEnv: [],
        url: "https://mcp.example.com",
      },
      id: "server-1",
      isEnabled: true,
      name: "Remote",
      transport: "http",
    });
  });

  it("inserts a new stdio server", async () => {
    const result = await mcpServersRouter.upsert({
      ctx: {
        db: {
          insert,
          query: {
            mcpServerConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        config: {
          args: ["serve"],
          command: "npx",
          cwd: "/tmp",
          envPassthrough: ["OPENAI_API_KEY"],
          envVars: [{ key: "MODE", value: "dev" }],
        },
        isEnabled: true,
        name: "Local",
        transport: "stdio",
      },
    });

    expect(insertValues).toHaveBeenCalledWith({
      encryptedConfig:
        'encrypted:{"args":["serve"],"command":"npx","cwd":"/tmp","envPassthrough":["OPENAI_API_KEY"],"envVars":[{"key":"MODE","value":"dev"}]}',
      id: "mcp-server-1",
      isEnabled: true,
      name: "Local",
      transport: "stdio",
      userId: "user-1",
    });
    expect(result.id).toBe("mcp-server-1");
  });

  it("updates an existing server", async () => {
    findFirst.mockImplementationOnce(async () => ({ id: "server-1" }));

    const result = await mcpServersRouter.upsert({
      ctx: {
        db: {
          insert,
          query: {
            mcpServerConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        config: {
          bearerTokenEnvVar: undefined,
          headers: [],
          headersFromEnv: [],
          url: "https://mcp.example.com",
        },
        id: "server-1",
        isEnabled: false,
        name: "Remote",
        transport: "http",
      },
    });

    expect(update).toHaveBeenCalled();
    expect(result).toEqual({
      catalogId: undefined,
      config: {
        headers: [],
        headersFromEnv: [],
        url: "https://mcp.example.com",
      },
      id: "server-1",
      isEnabled: false,
      name: "Remote",
      transport: "http",
    });
  });

  it("upserts a catalog server using the catalog defaults", async () => {
    findFirst
      .mockImplementationOnce(async () => ({ id: "server-playwright" }))
      .mockImplementationOnce(async () => ({ id: "server-playwright" }));

    const result = await mcpServersRouter.upsert({
      ctx: {
        db: {
          insert,
          query: {
            mcpServerConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        catalogId: "playwright",
        config: {
          args: ["@playwright/mcp@latest"],
          command: "npx",
          cwd: "/tmp/workspace",
          envPassthrough: [],
          envVars: [],
        },
        isEnabled: false,
        name: "Ignored name",
        transport: "stdio",
      },
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: "playwright",
        isEnabled: false,
        name: "Playwright",
        transport: "stdio",
      }),
    );
    expect(result).toEqual({
      catalogId: "playwright",
      config: {
        args: ["@playwright/mcp@latest"],
        command: "npx",
        cwd: "/tmp/workspace",
        envPassthrough: [],
        envVars: [],
      },
      id: "server-playwright",
      isEnabled: false,
      name: "Playwright",
      transport: "stdio",
    });
  });

  it("toggles an existing server", async () => {
    findFirst.mockImplementationOnce(async () => ({ id: "server-1" }));

    const result = await mcpServersRouter.toggle({
      ctx: {
        db: {
          query: {
            mcpServerConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        id: "server-1",
        isEnabled: false,
      },
    });

    expect(result).toEqual({ id: "server-1", isEnabled: false });
  });

  it("deletes a server", async () => {
    await mcpServersRouter.delete({
      ctx: {
        db: {
          delete: deleteConfig,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        id: "server-1",
      },
    });

    expect(deleteConfig).toHaveBeenCalled();
  });
});
