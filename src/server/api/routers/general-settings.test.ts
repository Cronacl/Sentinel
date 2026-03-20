// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const findFirst = mock(
  async () =>
    ({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 96_000,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: 80,
      skillsBasePath: "/tmp/custom-skills",
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 12,
    }) as const,
);
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

const { generalSettingsRouter } = await import("./general-settings");
const { generalSettingsFormSchema } =
  await import("@/schemas/general-settings.schema");

afterEach(() => {
  mock.restore();
});

describe("generalSettingsRouter", () => {
  it("returns the stored webfetch batch settings", async () => {
    const result = await generalSettingsRouter.get({
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
    expect(result).toEqual({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 96_000,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: 80,
      followUpBehavior: "queue",
      skillsBasePath: "/tmp/custom-skills",
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 12,
    });
  });

  it("updates the stored webfetch batch settings", async () => {
    const result = await generalSettingsRouter.update({
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
        contextCompactionEnabled: true,
        contextCompactionFixedWindowSize: 64_000,
        contextCompactionUseFixedWindow: true,
        contextCompactionWindowPercent: 75,
        followUpBehavior: "queue",
        skillsBasePath: "/tmp/custom-skills",
        webFetchBatchEnabled: true,
        webFetchBatchLimit: 10,
      },
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 64_000,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: 75,
      followUpBehavior: "queue",
      skillsBasePath: "/tmp/custom-skills",
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 10,
    });
    expect(run).toHaveBeenCalled();
    expect(result).toEqual({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 64_000,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: 75,
      followUpBehavior: "queue",
      skillsBasePath: "/tmp/custom-skills",
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 10,
    });
  });

  it("rejects invalid context compaction percentages", () => {
    const parsed = generalSettingsFormSchema.safeParse({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 64_000,
      contextCompactionUseFixedWindow: false,
      contextCompactionWindowPercent: 49,
      followUpBehavior: "queue",
      skillsBasePath: null,
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 10,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid fixed context window sizes", () => {
    const parsed = generalSettingsFormSchema.safeParse({
      contextCompactionEnabled: true,
      contextCompactionFixedWindowSize: 31_999,
      contextCompactionUseFixedWindow: true,
      contextCompactionWindowPercent: 70,
      followUpBehavior: "queue",
      skillsBasePath: null,
      webFetchBatchEnabled: true,
      webFetchBatchLimit: 10,
    });

    expect(parsed.success).toBe(false);
  });
});
