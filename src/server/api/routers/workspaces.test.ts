// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const getOrCreateQuickChatWorkspace = mock(async () => ({
  id: "quick-chat-workspace",
  kind: "quick_chat",
  name: "Quick chats",
}));
const getOwnedSubagentThreadOrThrow = mock(async () => ({
  id: "thread-virtual-1",
}));
const getOwnedThreadOrThrow = mock(async () => ({
  id: "thread-1",
}));
const getOwnedProjectWorkspaceOrThrow = mock(async () => ({
  id: "workspace-1",
}));
const run = mock(() => undefined);
const all = mock(() => [
  {
    permissionModeOverride: "full",
  },
]);
const returning = mock(() => ({ all }));
const where = mock(() => ({ all, run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));

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
  getOwnedProjectWorkspaceOrThrow,
  getOwnedSubagentThreadOrThrow,
  getOwnedThreadOrThrow,
  getThreadListSettings: () => ({
    organizeBy: "workspace",
    sortBy: "updated",
    workspaceId: null,
  }),
}));

mock.module("@/server/db/schema", () => ({
  threadMessages: {
    createdAt: "threadMessages.createdAt",
    threadId: "threadMessages.threadId",
  },
  threads: {
    archivedAt: "thread.archivedAt",
    chatEngine: "thread.chatEngine",
    chatEngineState: "thread.chatEngineState",
    chatModelId: "thread.chatModelId",
    chatReasoningEffort: "thread.chatReasoningEffort",
    createdAt: "thread.createdAt",
    updatedAt: "thread.updatedAt",
    id: "thread.id",
    mode: "thread.mode",
    pinnedAt: "thread.pinnedAt",
    status: "thread.status",
    summary: "thread.summary",
    title: "thread.title",
    userId: "thread.userId",
    visibility: "thread.visibility",
    workspaceId: "thread.workspaceId",
  },
  users: {
    id: "user.id",
  },
  workspaces: {
    createdAt: "workspace.createdAt",
    description: "workspace.description",
    id: "workspace.id",
    isArchived: "workspace.isArchived",
    kind: "workspace.kind",
    name: "workspace.name",
    permissionModeOverride: "workspace.permissionModeOverride",
    rootPath: "workspace.rootPath",
    sortOrder: "workspace.sortOrder",
    updatedAt: "workspace.updatedAt",
    userId: "workspace.userId",
  },
}));

const { workspacesRouter } = await import("./workspaces");

beforeEach(() => {
  getOrCreateQuickChatWorkspace.mockClear();
  getOwnedSubagentThreadOrThrow.mockClear();
  getOwnedThreadOrThrow.mockClear();
  getOwnedProjectWorkspaceOrThrow.mockClear();
  run.mockClear();
  all.mockClear();
  returning.mockClear();
  where.mockClear();
  set.mockClear();
  update.mockClear();
  all.mockReturnValue([
    {
      permissionModeOverride: "full",
    },
  ]);
  where.mockReturnValue({ returning, run });
  returning.mockReturnValue({ all });
});

describe("workspacesRouter.updatePermissionOverride", () => {
  it("updates the workspace permission override", async () => {
    const result = await workspacesRouter.updatePermissionOverride({
      ctx: {
        db: {
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        permissionModeOverride: "full",
        workspaceId: "workspace-1",
      },
    });

    expect(getOwnedProjectWorkspaceOrThrow).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      permissionModeOverride: "full",
    });
    expect(run).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalled();
    expect(result).toEqual({
      permissionModeOverride: "full",
      workspaceId: "workspace-1",
    });
  });

  it("clears the workspace permission override", async () => {
    all.mockReturnValueOnce([{ permissionModeOverride: null }]);

    const result = await workspacesRouter.updatePermissionOverride({
      ctx: {
        db: {
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      },
      input: {
        permissionModeOverride: null,
        workspaceId: "workspace-1",
      },
    });

    expect(set).toHaveBeenCalledWith({
      permissionModeOverride: null,
    });
    expect(result).toEqual({
      permissionModeOverride: null,
      workspaceId: "workspace-1",
    });
  });
});

describe("workspacesRouter.getQuickChat", () => {
  it("returns the hidden quick chat workspace", async () => {
    const result = await workspacesRouter.getQuickChat({
      ctx: {
        db: {},
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });

    expect(getOrCreateQuickChatWorkspace).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "quick-chat-workspace",
      kind: "quick_chat",
      name: "Quick chats",
    });
  });
});
