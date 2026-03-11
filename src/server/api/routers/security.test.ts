// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(async () => ({ permissionMode: "full" as const }));
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
  users: {
    id: "user.id",
  },
  workspaces: {
    id: "workspace.id",
    isArchived: "workspace.isArchived",
    userId: "workspace.userId",
  },
}));

const { securityRouter } = await import("./security");

afterEach(() => {
  mock.restore();
});

describe("securityRouter", () => {
  it("returns the stored permission mode", async () => {
    const result = await securityRouter.get({
      ctx: {
        db: {
          query: {
            users: {
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
    expect(result).toEqual({ permissionMode: "full" });
  });

  it("updates the stored permission mode", async () => {
    const result = await securityRouter.update({
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
        permissionMode: "full",
      },
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ permissionMode: "full" });
    expect(run).toHaveBeenCalled();
    expect(result).toEqual({ permissionMode: "full" });
  });
});
