// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(async () => null);
const insertRun = mock(() => undefined);
const insertValues = mock(() => ({ run: insertRun }));
const insert = mock(() => ({ values: insertValues }));
const updateRun = mock(() => undefined);
const updateWhere = mock(() => ({ run: updateRun }));
const updateSet = mock(() => ({ where: updateWhere }));
const update = mock(() => ({ set: updateSet }));
const countMemoriesByUser = mock(() => 0);
const clearMemoriesForUser = mock(() => 0);
const getMemoryById = mock(() => null);
const listMemories = mock(() => []);
const toggleMemoryPinned = mock(() => undefined);
const resolveConfiguredMemoryProfileFromId = mock(async () => ({
  dimensions: 1536,
  id: "openai:text-embedding-3-small",
  model: "text-embedding-3-small",
  provider: "openai",
}));
const resolveMemoryProfileFromSettings = mock(() => ({
  dimensions: 1536,
  id: "openai:text-embedding-3-small",
  model: "text-embedding-3-small",
  provider: "openai",
}));

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
  memorySettings: {
    id: "memorySettings.id",
    userId: "memorySettings.userId",
  },
  threads: {
    id: "threads.id",
    userId: "threads.userId",
  },
  workspaces: {
    id: "workspaces.id",
    userId: "workspaces.userId",
  },
}));

mock.module("@/lib/memory/repository", () => ({
  clearMemoriesForUser,
  countMemoriesByUser,
  getMemoryById,
  listMemories,
  toggleMemoryPinned,
}));

mock.module("@/lib/memory/runtime", () => ({
  resolveConfiguredMemoryProfileFromId,
  resolveMemoryProfileFromSettings,
}));

const { memorySettingsRouter } = await import("./memory-settings");

beforeEach(() => {
  findFirst.mockReset();
  insertRun.mockReset();
  insertValues.mockReset();
  insert.mockReset();
  updateRun.mockReset();
  updateWhere.mockReset();
  updateSet.mockReset();
  update.mockReset();
  countMemoriesByUser.mockReset();
  clearMemoriesForUser.mockReset();
  getMemoryById.mockReset();
  listMemories.mockReset();
  toggleMemoryPinned.mockReset();
  resolveConfiguredMemoryProfileFromId.mockReset();
  resolveMemoryProfileFromSettings.mockReset();

  findFirst.mockImplementation(async () => null);
  insertValues.mockImplementation(() => ({ run: insertRun }));
  insert.mockImplementation(() => ({ values: insertValues }));
  updateWhere.mockImplementation(() => ({ run: updateRun }));
  updateSet.mockImplementation(() => ({ where: updateWhere }));
  update.mockImplementation(() => ({ set: updateSet }));
  countMemoriesByUser.mockImplementation(() => 0);
  clearMemoriesForUser.mockImplementation(() => 0);
  getMemoryById.mockImplementation(() => null);
  listMemories.mockImplementation(() => []);
  toggleMemoryPinned.mockImplementation(() => undefined);
  resolveConfiguredMemoryProfileFromId.mockImplementation(async () => ({
    dimensions: 1536,
    id: "openai:text-embedding-3-small",
    model: "text-embedding-3-small",
    provider: "openai",
  }));
  resolveMemoryProfileFromSettings.mockImplementation(() => ({
    dimensions: 1536,
    id: "openai:text-embedding-3-small",
    model: "text-embedding-3-small",
    provider: "openai",
  }));
});

afterEach(() => {
  mock.restore();
});

describe("memorySettingsRouter", () => {
  it("returns normalized defaults when no settings row exists", async () => {
    const result = await memorySettingsRouter.get({
      ctx: {
        db: {
          query: {
            memorySettings: {
              findFirst,
            },
          },
        },
        session: { user: { id: "user-1" } },
      },
    });

    expect(result).toEqual({
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: false,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 6,
    });
  });

  it("persists memory settings with the selected embedding profile", async () => {
    const result = await memorySettingsRouter.update({
      ctx: {
        db: {
          insert,
          query: {
            memorySettings: {
              findFirst,
            },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        autoSaveEnabled: true,
        autoSavePerTurnLimit: 2,
        defaultScope: "workspace",
        enabled: true,
        memoryProfileId: "openai:text-embedding-3-small",
        retrievalLimit: 4,
      },
    });

    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 2,
      defaultScope: "workspace",
      enabled: true,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 4,
      userId: "user-1",
    });
    expect(result).toEqual({
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 2,
      defaultScope: "workspace",
      enabled: true,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 4,
    });
  });

  it("rejects enabling memory when the selected embedding provider is unavailable", async () => {
    resolveConfiguredMemoryProfileFromId.mockImplementation(async () => {
      throw new Error(
        "Configure and enable that provider before using it for memory.",
      );
    });

    await expect(
      memorySettingsRouter.update({
        ctx: {
          db: {
            insert,
            query: {
              memorySettings: {
                findFirst,
              },
            },
            update,
          },
          session: { user: { id: "user-1" } },
        },
        input: {
          autoSaveEnabled: true,
          autoSavePerTurnLimit: 2,
          defaultScope: "workspace",
          enabled: true,
          memoryProfileId: "openai:text-embedding-3-small",
          retrievalLimit: 4,
        },
      }),
    ).rejects.toThrow(
      "Configure and enable that provider before using it for memory.",
    );
  });

  it("blocks embedding profile switches until memory is cleared or reindexed", async () => {
    findFirst.mockImplementationOnce(async () => ({
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: true,
      id: "memory-setting-1",
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 6,
    }));
    countMemoriesByUser.mockImplementation(() => 5);
    resolveConfiguredMemoryProfileFromId.mockImplementation(async () => ({
      dimensions: 3072,
      id: "openai:text-embedding-3-large",
      model: "text-embedding-3-large",
      provider: "openai",
    }));

    await expect(
      memorySettingsRouter.update({
        ctx: {
          db: {
            insert,
            query: {
              memorySettings: {
                findFirst,
              },
            },
            update,
          },
          session: { user: { id: "user-1" } },
        },
        input: {
          autoSaveEnabled: true,
          autoSavePerTurnLimit: 3,
          defaultScope: "global",
          enabled: true,
          memoryProfileId: "openai:text-embedding-3-large",
          retrievalLimit: 6,
        },
      }),
    ).rejects.toThrow(
      "Clear all memory or run a reindex before switching the memory embedding profile.",
    );
  });
});
