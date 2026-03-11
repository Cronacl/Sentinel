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
  searchProviderConfigs: {
    id: "searchProviderConfigs.id",
    provider: "searchProviderConfigs.provider",
    userId: "searchProviderConfigs.userId",
  },
  searchSettings: {
    id: "searchSettings.id",
    userId: "searchSettings.userId",
  },
}));

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: (value: string) => value,
  encrypt: (value: string) => `encrypted:${value}`,
}));

const { searchProvidersRouter } = await import("./search-providers");

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

describe("searchProvidersRouter", () => {
  it("lists Exa with not configured status when no row exists", async () => {
    const result = await searchProvidersRouter.list({
      ctx: {
        db: {
          query: {
            searchProviderConfigs: {
              findMany,
            },
          },
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "exa",
        status: "not_configured",
      }),
      expect.objectContaining({
        id: "searxng",
        installationDocsUrl: "https://docs.searxng.org/admin/installation.html",
        status: "not_configured",
      }),
    ]);
  });

  it("returns decrypted Exa config and settings", async () => {
    findFirst.mockImplementationOnce(async () => ({
      encryptedConfig: JSON.stringify({ apiKey: "exa_key" }),
      isEnabled: true,
      provider: "exa",
      settings: {
        defaultLivecrawl: "preferred",
        defaultSearchType: "fast",
      },
    }));

    const result = await searchProvidersRouter.get({
      ctx: {
        db: {
          query: {
            searchProviderConfigs: {
              findFirst,
            },
          },
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        provider: "exa",
      },
    });

    expect(result).toEqual({
      config: {
        apiKey: "exa_key",
      },
      isEnabled: true,
      provider: "exa",
      settings: {
        defaultLivecrawl: "preferred",
        defaultSearchType: "fast",
      },
    });
  });

  it("upserts Exa config and settings", async () => {
    const result = await searchProvidersRouter.upsert({
      ctx: {
        db: {
          insert,
          query: {
            searchProviderConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        config: {
          apiKey: "exa_key",
        },
        isEnabled: true,
        provider: "exa",
        settings: {
          defaultLivecrawl: "always",
          defaultSearchType: "deep",
        },
      },
    });

    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({
      encryptedConfig: 'encrypted:{"apiKey":"exa_key"}',
      isEnabled: true,
      provider: "exa",
      settings: {
        defaultLivecrawl: "always",
        defaultSearchType: "deep",
      },
      userId: "user-1",
    });
    expect(result).toEqual({
      config: {
        apiKey: "exa_key",
      },
      isEnabled: true,
      provider: "exa",
      settings: {
        defaultLivecrawl: "always",
        defaultSearchType: "deep",
      },
    });
  });

  it("upserts SearXNG config and settings", async () => {
    const result = await searchProvidersRouter.upsert({
      ctx: {
        db: {
          insert,
          query: {
            searchProviderConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        config: {
          baseURL: "https://search.example.com",
        },
        isEnabled: true,
        provider: "searxng",
        settings: {
          defaultLivecrawl: "preferred",
          defaultSearchType: "auto",
        },
      },
    });

    expect(insertValues).toHaveBeenCalledWith({
      encryptedConfig: 'encrypted:{"baseURL":"https://search.example.com"}',
      isEnabled: true,
      provider: "searxng",
      settings: {
        defaultLivecrawl: "preferred",
        defaultSearchType: "auto",
      },
      userId: "user-1",
    });
    expect(result).toEqual({
      config: {
        baseURL: "https://search.example.com",
      },
      isEnabled: true,
      provider: "searxng",
      settings: {
        defaultLivecrawl: "preferred",
        defaultSearchType: "auto",
      },
    });
  });

  it("toggles an existing provider", async () => {
    findFirst.mockImplementationOnce(async () => ({ id: "provider-1" }));

    const result = await searchProvidersRouter.toggle({
      ctx: {
        db: {
          query: {
            searchProviderConfigs: {
              findFirst,
            },
          },
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        isEnabled: false,
        provider: "exa",
      },
    });

    expect(update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith({
      isEnabled: false,
    });
    expect(result).toEqual({
      isEnabled: false,
      provider: "exa",
    });
  });

  it("deletes a configured provider", async () => {
    const result = await searchProvidersRouter.delete({
      ctx: {
        db: {
          delete: deleteConfig,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        provider: "exa",
      },
    });

    expect(deleteConfig).toHaveBeenCalled();
    expect(deleteRun).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
