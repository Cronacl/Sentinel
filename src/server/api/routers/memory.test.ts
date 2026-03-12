// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const listMemories = mock(() => []);
const countMemoriesByUser = mock(() => 0);
const getMemoryById = mock(() => null);
const clearMemoriesForUser = mock(() => 0);
const toggleMemoryPinned = mock(() => undefined);
const forgetMemoryRecord = mock(() => ({
  id: "memory-1",
  kind: "preference",
  summary: "Prefers concise answers.",
}));
const reindexAllMemories = mock(async () => 0);
const resolveConfiguredMemoryProfileFromId = mock(async () => ({
  dimensions: 3072,
  id: "openai:text-embedding-3-large",
  model: "text-embedding-3-large",
  provider: "openai",
}));
const retrieveRelevantMemories = mock(async () => []);
const buildMemoryPromptLines = mock(() => []);
const autosaveConversationMemories = mock(async () => []);
const workspacesFindMany = mock(async () => []);
const threadsFindMany = mock(async () => []);
const memorySettingsFindFirst = mock(async () => ({ id: "memory-setting-1" }));
const updateRun = mock(() => undefined);
const updateWhere = mock(() => ({ run: updateRun }));
const updateSet = mock(() => ({ where: updateWhere }));
const update = mock(() => ({ set: updateSet }));

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

mock.module("@/lib/memory/repository", () => ({
  clearMemoriesForUser,
  countMemoriesByUser,
  getMemoryById,
  listMemories,
  toggleMemoryPinned,
}));

mock.module("@/lib/memory/service", () => ({
  autosaveConversationMemories,
  buildMemoryPromptLines,
  extractLatestUserText: () => "",
  forgetMemoryRecord,
  reindexAllMemories,
  retrieveRelevantMemories,
}));

mock.module("@/lib/memory/runtime", () => ({
  resolveConfiguredMemoryProfileFromId,
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

const { memoryRouter } = await import("./memory");

beforeEach(() => {
  listMemories.mockReset();
  countMemoriesByUser.mockReset();
  getMemoryById.mockReset();
  clearMemoriesForUser.mockReset();
  toggleMemoryPinned.mockReset();
  forgetMemoryRecord.mockReset();
  reindexAllMemories.mockReset();
  retrieveRelevantMemories.mockReset();
  buildMemoryPromptLines.mockReset();
  autosaveConversationMemories.mockReset();
  resolveConfiguredMemoryProfileFromId.mockReset();
  workspacesFindMany.mockReset();
  threadsFindMany.mockReset();
  memorySettingsFindFirst.mockReset();
  updateRun.mockReset();
  updateWhere.mockReset();
  updateSet.mockReset();
  update.mockReset();

  listMemories.mockImplementation(() => []);
  countMemoriesByUser.mockImplementation(() => 0);
  getMemoryById.mockImplementation(() => null);
  clearMemoriesForUser.mockImplementation(() => 0);
  toggleMemoryPinned.mockImplementation(() => undefined);
  forgetMemoryRecord.mockImplementation(() => ({
    id: "memory-1",
    kind: "preference",
    summary: "Prefers concise answers.",
  }));
  reindexAllMemories.mockImplementation(async () => 0);
  retrieveRelevantMemories.mockImplementation(async () => []);
  buildMemoryPromptLines.mockImplementation(() => []);
  autosaveConversationMemories.mockImplementation(async () => []);
  resolveConfiguredMemoryProfileFromId.mockImplementation(async () => ({
    dimensions: 3072,
    id: "openai:text-embedding-3-large",
    model: "text-embedding-3-large",
    provider: "openai",
  }));
  workspacesFindMany.mockImplementation(async () => []);
  threadsFindMany.mockImplementation(async () => []);
  memorySettingsFindFirst.mockImplementation(async () => ({
    id: "memory-setting-1",
  }));
  updateWhere.mockImplementation(() => ({ run: updateRun }));
  updateSet.mockImplementation(() => ({ where: updateWhere }));
  update.mockImplementation(() => ({ set: updateSet }));
});

afterEach(() => {
  mock.restore();
});

describe("memoryRouter", () => {
  it("lists memories with workspace and thread metadata", async () => {
    listMemories.mockImplementation(() => [
      {
        content: "Prefers concise answers.",
        createdAt: 1,
        embeddingDimensions: 1536,
        embeddingModel: "text-embedding-3-small",
        embeddingProvider: "openai",
        id: "memory-1",
        isPinned: true,
        kind: "preference",
        lastAccessedAt: 5,
        salience: 0.7,
        scope: "workspace",
        sourceMessageId: "assistant-1",
        sourceThreadId: "thread-1",
        summary: "Prefers concise answers.",
        updatedAt: 4,
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    ]);
    countMemoriesByUser.mockImplementation(() => 1);
    workspacesFindMany.mockImplementation(async () => [
      { id: "workspace-1", name: "Sentinel" },
    ]);
    threadsFindMany.mockImplementation(async () => [
      { id: "thread-1", title: "Memory thread" },
    ]);

    const result = await memoryRouter.list({
      ctx: {
        db: {
          query: {
            memorySettings: { findFirst: memorySettingsFindFirst },
            threads: { findMany: threadsFindMany },
            workspaces: { findMany: workspacesFindMany },
          },
        },
        session: { user: { id: "user-1" } },
      },
      input: {},
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "memory-1",
          threadTitle: "Memory thread",
          workspaceName: "Sentinel",
        }),
      ],
      total: 1,
    });
  });

  it("clears memory and updates the selected profile", async () => {
    clearMemoriesForUser.mockImplementation(() => 4);

    const result = await memoryRouter.clearAll({
      ctx: {
        db: {
          query: {
            memorySettings: { findFirst: memorySettingsFindFirst },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        nextProfileId: "openai:text-embedding-3-large",
      },
    });

    expect(clearMemoriesForUser).toHaveBeenCalledWith("user-1");
    expect(updateSet).toHaveBeenCalledWith({
      memoryDimensions: 3072,
      memoryModel: "text-embedding-3-large",
      memoryProvider: "openai",
    });
    expect(result).toEqual({ deletedCount: 4 });
  });

  it("reindexes memory and persists the active profile", async () => {
    reindexAllMemories.mockImplementation(async () => 7);

    const result = await memoryRouter.reindex({
      ctx: {
        db: {
          query: {
            memorySettings: { findFirst: memorySettingsFindFirst },
          },
          update,
        },
        session: { user: { id: "user-1" } },
      },
      input: {
        nextProfileId: "openai:text-embedding-3-large",
      },
    });

    expect(reindexAllMemories).toHaveBeenCalledWith({
      nextProfile: expect.objectContaining({
        id: "openai:text-embedding-3-large",
      }),
      userId: "user-1",
    });
    expect(updateSet).toHaveBeenCalledWith({
      memoryDimensions: 3072,
      memoryModel: "text-embedding-3-large",
      memoryProvider: "openai",
    });
    expect(result).toEqual({ reindexedCount: 7 });
  });
});
