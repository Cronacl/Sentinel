// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(
  async () =>
    ({
      defaultProvider: "exa",
      defaultResultCount: 7,
      maxResultCount: 12,
    }) as const,
);
const insertRun = mock(() => undefined);
const insertValues = mock(() => ({ run: insertRun }));
const insert = mock(() => ({ values: insertValues }));
const run = mock(() => undefined);
const where = mock(() => ({ run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
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

const { searchSettingsRouter } = await import("./search-settings");

afterEach(() => {
  mock.restore();
});

describe("searchSettingsRouter", () => {
  it("returns the stored search settings", async () => {
    const result = await searchSettingsRouter.get({
      ctx: {
        db: {
          query: {
            searchSettings: {
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
    });

    expect(findFirst).toHaveBeenCalled();
    expect(result).toEqual({
      defaultProvider: "exa",
      defaultResultCount: 7,
      maxResultCount: 12,
    });
  });

  it("inserts search settings when no row exists", async () => {
    findFirst.mockImplementationOnce(async () => null);

    const result = await searchSettingsRouter.update({
      ctx: {
        db: {
          insert,
          query: {
            searchSettings: {
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
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
    });

    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
      userId: "user-1",
    });
    expect(result).toEqual({
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    });
  });

  it("updates existing search settings", async () => {
    findFirst.mockImplementationOnce(async () => ({ id: "settings-1" }));

    const result = await searchSettingsRouter.update({
      ctx: {
        db: {
          insert,
          query: {
            searchSettings: {
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
        defaultProvider: "exa",
        defaultResultCount: 6,
        maxResultCount: 9,
      },
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      defaultProvider: "exa",
      defaultResultCount: 6,
      maxResultCount: 9,
    });
    expect(run).toHaveBeenCalled();
    expect(result).toEqual({
      defaultProvider: "exa",
      defaultResultCount: 6,
      maxResultCount: 9,
    });
  });
});
