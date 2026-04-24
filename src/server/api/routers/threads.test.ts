// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const findMany = mock(async () => []);
const findFirst = mock(async () => null);
const getOwnedThreadOrThrow = mock(async () => ({
  id: "thread-1",
}));
const getOwnedSubagentThreadOrThrow = mock(async () => ({
  id: "thread-virtual-1",
}));
const getOrCreateQuickChatWorkspace = mock(async () => ({
  id: "quick-chat-workspace",
  isArchived: false,
  kind: "quick_chat",
}));
const getOwnedProjectWorkspaceOrThrow = mock(async () => ({
  id: "workspace-1",
  isArchived: false,
  kind: "project",
}));
const insertAll = mock(() => [
  {
    id: "thread-created-1",
  },
]);
const insertReturning = mock(() => ({ all: insertAll }));
const insertValues = mock(() => ({ returning: insertReturning }));
const insert = mock(() => ({ values: insertValues }));

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

mock.module("./workspace-thread-helpers", () => ({
  getOrCreateQuickChatWorkspace,
  getOwnedSubagentThreadOrThrow,
  getOwnedThreadOrThrow,
  getOwnedProjectWorkspaceOrThrow,
  getThreadListSettings: () => ({
    organizeBy: "workspace",
    sortBy: "updated",
    workspaceId: null,
  }),
}));

mock.module("@/lib/ai/chat/engines/types", () => ({
  getCodexThreadState: (value: any) => value?.codex ?? null,
  getRepoThreadState: () => null,
}));

mock.module("@/lib/ai/chat", () => ({
  runThreadChat: mock(async () => undefined),
}));

mock.module("@/lib/ai/chat/persistence", () => ({
  getLatestAssistantMessageId: mock(async () => null),
  listThreadFollowUps: mock(async () => []),
  moveThreadFollowUpToFront: mock(() => undefined),
  removeThreadFollowUp: mock(() => undefined),
  setActiveMessage: mock(async () => undefined),
}));

mock.module("@/lib/ai/chat/session-server", () => ({
  summarizeQueuedFollowUp: (value: unknown) => value,
}));

mock.module("@/lib/ai/chat/tools/shell", () => ({
  disposeShellSession: mock(async () => undefined),
}));

mock.module("@/lib/ai/messages/ui", () => ({
  mapThreadMessagesToUIMessages: mock(async () => []),
}));

mock.module("@/server/db/schema", () => ({
  threadMessages: {
    createdAt: "threadMessages.createdAt",
    threadId: "threadMessages.threadId",
  },
  threads: {
    archivedAt: "threads.archivedAt",
    chatEngine: "threads.chatEngine",
    chatEngineState: "threads.chatEngineState",
    chatModelId: "threads.chatModelId",
    chatReasoningEffort: "threads.chatReasoningEffort",
    createdAt: "threads.createdAt",
    id: "threads.id",
    mode: "threads.mode",
    pinnedAt: "threads.pinnedAt",
    status: "threads.status",
    summary: "threads.summary",
    title: "threads.title",
    updatedAt: "threads.updatedAt",
    userId: "threads.userId",
    visibility: "threads.visibility",
    workspaceId: "threads.workspaceId",
  },
  workspaces: {
    createdAt: "workspaces.createdAt",
    description: "workspaces.description",
    id: "workspaces.id",
    isArchived: "workspaces.isArchived",
    kind: "workspaces.kind",
    name: "workspaces.name",
    permissionModeOverride: "workspaces.permissionModeOverride",
    rootPath: "workspaces.rootPath",
    updatedAt: "workspaces.updatedAt",
    userId: "workspaces.userId",
  },
}));

const { threadsRouter } = await import("./threads");

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  getOrCreateQuickChatWorkspace.mockClear();
  getOwnedSubagentThreadOrThrow.mockClear();
  getOwnedThreadOrThrow.mockClear();
  getOwnedProjectWorkspaceOrThrow.mockClear();
  insert.mockClear();
  insertValues.mockClear();
  insertReturning.mockClear();
  insertAll.mockClear();
  insertAll.mockReturnValue([
    {
      id: "thread-created-1",
    },
  ]);
});

describe("threadsRouter.search", () => {
  it("returns older title matches and does not pre-limit before searching", async () => {
    findMany.mockResolvedValueOnce([
      {
        archivedAt: null,
        id: "newer-summary-match",
        summary: "Palette migration checklist",
        title: "Release handoff",
        updatedAt: new Date("2026-03-31T12:00:00.000Z"),
        workspace: {
          kind: "project",
          id: "workspace-1",
          name: "Sentinel",
        },
      },
      {
        archivedAt: null,
        id: "older-title-match",
        summary: "Migration notes",
        title: "Palette keyboard shortcuts",
        updatedAt: new Date("2026-02-01T12:00:00.000Z"),
        workspace: {
          kind: "project",
          id: "workspace-2",
          name: "Desktop",
        },
      },
    ]);

    const result = await threadsRouter.search({
      ctx: {
        db: {
          query: {
            threads: {
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
      input: {
        query: "palette",
      },
    });

    expect(result.map((thread) => thread.id)).toEqual([
      "older-title-match",
      "newer-summary-match",
    ]);
    expect(findMany.mock.calls[0]?.[0]?.limit).toBeUndefined();
  });

  it("filters archived threads and preserves workspace metadata", async () => {
    findMany.mockResolvedValueOnce([
      {
        archivedAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "archived-thread",
        summary: "Search me",
        title: "Archived palette thread",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
        workspace: {
          kind: "quick_chat",
          id: "workspace-9",
          name: "Archive",
        },
      },
      {
        archivedAt: null,
        id: "quick-chat-thread",
        summary: "Search me three",
        title: "Quick palette thread",
        updatedAt: new Date("2026-03-22T12:00:00.000Z"),
        workspace: {
          kind: "quick_chat",
          id: "workspace-9",
          name: "Archive",
        },
      },
      {
        archivedAt: null,
        id: "active-thread",
        summary: "Search me too",
        title: "Active palette thread",
        updatedAt: new Date("2026-03-21T12:00:00.000Z"),
        workspace: {
          kind: "project",
          id: "workspace-1",
          name: "Sentinel",
        },
      },
    ]);

    const result = await threadsRouter.search({
      ctx: {
        db: {
          query: {
            threads: {
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
      input: {
        query: "palette",
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "active-thread",
      workspace: {
        kind: "project",
        id: "workspace-1",
        name: "Sentinel",
      },
    });
  });
});

describe("threadsRouter.listQuickChats", () => {
  it("returns only quick chat threads for the hidden workspace", async () => {
    findMany.mockResolvedValueOnce([
      {
        archivedAt: null,
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        id: "quick-chat-thread",
        mode: "chat",
        pinnedAt: null,
        status: "idle",
        summary: "Quick chat summary",
        title: "Quick chat thread",
        updatedAt: new Date("2026-03-21T12:00:00.000Z"),
        workspace: {
          createdAt: new Date("2026-03-20T12:00:00.000Z"),
          description: null,
          id: "quick-chat-workspace",
          kind: "quick_chat",
          name: "Quick chats",
          permissionModeOverride: null,
          rootPath: "/tmp/sentinel/chats",
          updatedAt: new Date("2026-03-20T12:00:00.000Z"),
        },
      },
    ]);

    const result = await threadsRouter.listQuickChats({
      ctx: {
        db: {
          query: {
            threads: {
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
      input: undefined,
    });

    expect(getOrCreateQuickChatWorkspace).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "quick-chat-thread",
      workspace: {
        id: "quick-chat-workspace",
        kind: "quick_chat",
      },
    });
  });
});

describe("threadsRouter.createQuickChat", () => {
  it("creates a thread in the hidden quick chat workspace", async () => {
    findFirst.mockResolvedValueOnce({
      archivedAt: null,
      chatEngine: "codex",
      chatEngineState: null,
      chatModelId: null,
      chatReasoningEffort: null,
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      id: "thread-created-1",
      mode: "chat",
      pinnedAt: null,
      status: "idle",
      summary: "Created in quick chat",
      title: "Quick chat thread",
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      workspace: {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        description: null,
        id: "quick-chat-workspace",
        kind: "quick_chat",
        name: "Quick chats",
        permissionModeOverride: null,
        rootPath: "/tmp/sentinel/chats",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    });

    const result = await threadsRouter.createQuickChat({
      ctx: {
        db: {
          insert,
          query: {
            threads: {
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
        engine: "codex",
        mode: "chat",
        summary: "  Created in quick chat  ",
        title: "  Quick chat thread  ",
      },
    });

    expect(getOrCreateQuickChatWorkspace).toHaveBeenCalled();
    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Created in quick chat",
        title: "Quick chat thread",
        userId: "user-1",
        workspaceId: "quick-chat-workspace",
      }),
    );
    expect(result).toMatchObject({
      id: "thread-created-1",
      workspace: {
        id: "quick-chat-workspace",
        kind: "quick_chat",
      },
    });
  });
});

describe("threadsRouter.get", () => {
  it("reports whether Codex app commands have a backing thread", async () => {
    getOwnedThreadOrThrow.mockResolvedValueOnce({
      activeStreamId: null,
      archivedAt: null,
      chatEngine: "codex",
      chatEngineState: {
        codex: {
          codexThreadId: "codex-thread-1",
        },
      },
      chatModelId: null,
      chatReasoningEffort: null,
      createdAt: new Date("2026-03-20T12:00:00.000Z"),
      id: "thread-1",
      mode: "chat",
      pinnedAt: null,
      status: "idle",
      summary: null,
      title: "Codex thread",
      updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      workspace: {
        createdAt: new Date("2026-03-20T12:00:00.000Z"),
        description: null,
        id: "workspace-1",
        kind: "project",
        name: "Project",
        permissionModeOverride: null,
        rootPath: "/tmp/project",
        updatedAt: new Date("2026-03-20T12:00:00.000Z"),
      },
    });
    findMany.mockResolvedValueOnce([]);

    const result = await threadsRouter.get({
      ctx: {
        db: {
          query: {
            threadMessages: {
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
      input: {
        threadId: "thread-1",
      },
    });

    expect(result.thread.hasCodexThread).toBe(true);
  });
});
