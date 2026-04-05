// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const findMany = mock(async () => []);
const getOwnedThreadOrThrow = mock(async () => ({
  id: "thread-1",
}));
const getOwnedSubagentThreadOrThrow = mock(async () => ({
  id: "thread-virtual-1",
}));
const getOwnedWorkspaceOrThrow = mock(async () => ({
  id: "workspace-1",
  isArchived: false,
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

mock.module("./workspace-thread-helpers", () => ({
  getOwnedSubagentThreadOrThrow,
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
  getThreadListSettings: () => ({
    organizeBy: "workspace",
    sortBy: "updated",
    workspaceId: null,
  }),
}));

mock.module("@/lib/ai/chat/engines/types", () => ({
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
  getOwnedSubagentThreadOrThrow.mockClear();
  getOwnedThreadOrThrow.mockClear();
  getOwnedWorkspaceOrThrow.mockClear();
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
        id: "workspace-1",
        name: "Sentinel",
      },
    });
  });
});
