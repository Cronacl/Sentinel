// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const getOwnedWorkspaceOrThrow = mock(async () => ({
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
  getOwnedWorkspaceOrThrow,
  getThreadListSettings: () => ({
    organizeBy: "workspace",
    sortBy: "updated",
    workspaceId: null,
  }),
}));

mock.module("@/server/db/schema", () => ({
  threads: {
    archivedAt: "thread.archivedAt",
    createdAt: "thread.createdAt",
    updatedAt: "thread.updatedAt",
    userId: "thread.userId",
    visibility: "thread.visibility",
    workspaceId: "thread.workspaceId",
  },
  users: {
    id: "user.id",
  },
  workspaces: {
    createdAt: "workspace.createdAt",
    id: "workspace.id",
    isArchived: "workspace.isArchived",
    userId: "workspace.userId",
  },
}));

const { workspacesRouter } = await import("./workspaces");

beforeEach(() => {
  getOwnedWorkspaceOrThrow.mockClear();
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

    expect(getOwnedWorkspaceOrThrow).toHaveBeenCalled();
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
