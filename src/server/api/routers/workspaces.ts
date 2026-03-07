import { TRPCError } from "@trpc/server";
import { Prisma } from "@/../generated/prisma";

import {
  threadListPreferencesSchema,
  workspaceArchiveSchema,
  workspaceCreateSchema,
  workspaceSelectSchema,
  workspaceUpdateSchema,
} from "@/schemas/workspace-thread.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

async function assertWorkspaceRootPathAvailable(
  db: typeof import("@/server/db").db,
  userId: string,
  rootPath: string | null | undefined,
  workspaceId?: string,
) {
  if (!rootPath) {
    return;
  }

  const existingWorkspace = await db.workspace.findFirst({
    where: {
      id: workspaceId ? { not: workspaceId } : undefined,
      rootPath,
      userId,
    },
    select: { id: true },
  });

  if (existingWorkspace) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A workspace with that root path already exists.",
    });
  }
}

function getWorkspaceErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "A workspace with that root path already exists.";
  }

  return null;
}

export const workspacesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const workspaces = await ctx.db.workspace.findMany({
      where: {
        isArchived: false,
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const threadStats = await ctx.db.thread.groupBy({
      by: ["workspaceId"],
      where: {
        archivedAt: null,
        userId,
      },
      _count: {
        _all: true,
      },
      _max: {
        updatedAt: true,
      },
    });

    const statsMap = new Map(
      threadStats.map((item) => [
        item.workspaceId,
        {
          latestThreadUpdatedAt: item._max.updatedAt ?? null,
          threadCount: item._count._all,
        },
      ]),
    );

    return workspaces.map((workspace) => {
      const stats = statsMap.get(workspace.id);
      return {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isSelected: ctx.user.selectedWorkspaceId === workspace.id,
        latestThreadUpdatedAt: stats?.latestThreadUpdatedAt ?? null,
        name: workspace.name,
        rootPath: workspace.rootPath,
        threadCount: stats?.threadCount ?? 0,
        updatedAt: workspace.updatedAt,
      };
    });
  }),

  create: protectedProcedure
    .input(workspaceCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rootPath = input.rootPath?.trim() || null;
      const data = {
        description: input.description.trim() || null,
        name: input.name.trim(),
        rootPath,
        userId,
      };

      try {
        await assertWorkspaceRootPathAvailable(ctx.db, userId, rootPath);
        const workspace = await ctx.db.workspace.create({ data });

        if (!ctx.user.selectedWorkspaceId) {
          await ctx.db.user.update({
            where: { id: userId },
            data: { selectedWorkspaceId: workspace.id },
          });
        }

        return workspace;
      } catch (error) {
        const message = getWorkspaceErrorMessage(error);
        if (message) {
          throw new TRPCError({ code: "CONFLICT", message });
        }
        throw error;
      }
    }),

  update: protectedProcedure
    .input(workspaceUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = input.rootPath?.trim() || null;

      try {
        await assertWorkspaceRootPathAvailable(
          ctx.db,
          ctx.session.user.id,
          rootPath,
          input.workspaceId,
        );

        return await ctx.db.workspace.update({
          where: { id: input.workspaceId },
          data: {
            description: input.description.trim() || null,
            name: input.name.trim(),
            rootPath,
          },
        });
      } catch (error) {
        const message = getWorkspaceErrorMessage(error);
        if (message) {
          throw new TRPCError({ code: "CONFLICT", message });
        }
        throw error;
      }
    }),

  archive: protectedProcedure
    .input(workspaceArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);

      await ctx.db.workspace.update({
        where: { id: workspace.id },
        data: { isArchived: true },
      });

      let nextSelectedWorkspaceId = ctx.user.selectedWorkspaceId;
      if (ctx.user.selectedWorkspaceId === workspace.id) {
        const fallbackWorkspace = await ctx.db.workspace.findFirst({
          where: {
            id: { not: workspace.id },
            isArchived: false,
            userId: ctx.session.user.id,
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: { id: true },
        });

        nextSelectedWorkspaceId = fallbackWorkspace?.id ?? null;

        await ctx.db.user.update({
          where: { id: ctx.session.user.id },
          data: {
            selectedWorkspaceId: nextSelectedWorkspaceId,
          },
        });
      }

      return {
        selectedWorkspaceId: nextSelectedWorkspaceId ?? null,
        success: true,
        workspaceId: workspace.id,
      };
    }),

  select: protectedProcedure
    .input(workspaceSelectSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);

      if (workspace.isArchived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived workspaces cannot be selected.",
        });
      }

      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { selectedWorkspaceId: workspace.id },
      });

      return {
        selectedWorkspaceId: workspace.id,
        success: true,
      };
    }),

  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.workspace) {
      return ctx.workspace;
    }

    if (!ctx.user.selectedWorkspaceId) {
      return null;
    }

    const fallbackWorkspace = await ctx.db.workspace.findFirst({
      where: {
        isArchived: false,
        userId: ctx.session.user.id,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!fallbackWorkspace) {
      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { selectedWorkspaceId: null },
      });
      return null;
    }

    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { selectedWorkspaceId: fallbackWorkspace.id },
    });

    return fallbackWorkspace;
  }),

  getPreferences: protectedProcedure.query(({ ctx }) => {
    return {
      organizeBy: ctx.user.threadListOrganizeBy,
      sortBy: ctx.user.threadListSortBy,
    };
  }),

  updatePreferences: protectedProcedure
    .input(threadListPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          threadListOrganizeBy: input.organizeBy,
          threadListSortBy: input.sortBy,
        },
        select: {
          threadListOrganizeBy: true,
          threadListSortBy: true,
        },
      });

      return {
        organizeBy: user.threadListOrganizeBy,
        sortBy: user.threadListSortBy,
      };
    }),
});
