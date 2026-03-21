import path from "node:path";

import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull, max, ne, sql } from "drizzle-orm";

import { z } from "zod";

import {
  threadListPreferencesSchema,
  workspaceArchiveSchema,
  workspaceCreateSchema,
  workspacePermissionOverrideSchema,
  workspaceSelectSchema,
  workspaceUpdateSchema,
} from "@/schemas/workspace-thread.schema";
import { threads, users, workspaces } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

function normalizeWorkspaceRootPath(rootPath: string | null | undefined) {
  if (!rootPath) {
    return null;
  }

  const trimmed = rootPath.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = path.normalize(trimmed);
  const root = path.parse(normalized).root;

  if (normalized.length <= root.length) {
    return normalized;
  }

  return normalized.replace(/[\\/]+$/, "");
}

async function assertWorkspaceRootPathAvailable(
  db: typeof import("@/server/db").db,
  userId: string,
  rootPath: string | null | undefined,
  workspaceId?: string,
) {
  if (!rootPath) {
    return;
  }

  const conditions = [
    eq(workspaces.rootPath, rootPath),
    eq(workspaces.userId, userId),
    eq(workspaces.isArchived, false),
  ];

  if (workspaceId) {
    conditions.push(ne(workspaces.id, workspaceId));
  }

  const existingWorkspace = await db.query.workspaces.findFirst({
    where: and(...conditions),
    columns: { id: true },
  });

  if (existingWorkspace) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A workspace with that root path already exists.",
    });
  }
}

export const workspacesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const allWorkspaces = await ctx.db.query.workspaces.findMany({
      where: and(
        eq(workspaces.isArchived, false),
        eq(workspaces.userId, userId),
      ),
      orderBy: (workspaces, { desc }) => [desc(workspaces.createdAt)],
    });

    const threadStats = ctx.db
      .select({
        workspaceId: threads.workspaceId,
        threadCount: count().as("thread_count"),
        latestThreadUpdatedAt: max(threads.updatedAt).as("latest_updated"),
      })
      .from(threads)
      .where(and(isNull(threads.archivedAt), eq(threads.userId, userId)))
      .groupBy(threads.workspaceId)
      .all();

    const statsMap = new Map(
      threadStats.map((item) => [
        item.workspaceId,
        {
          latestThreadUpdatedAt: item.latestThreadUpdatedAt ?? null,
          threadCount: item.threadCount,
        },
      ]),
    );

    return allWorkspaces.map((workspace) => {
      const stats = statsMap.get(workspace.id);
      return {
        createdAt: workspace.createdAt,
        description: workspace.description,
        id: workspace.id,
        isExpanded: workspace.isExpanded,
        isSelected: ctx.user.selectedWorkspaceId === workspace.id,
        latestThreadUpdatedAt: stats?.latestThreadUpdatedAt ?? null,
        name: workspace.name,
        permissionModeOverride: workspace.permissionModeOverride,
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
      const rootPath = normalizeWorkspaceRootPath(input.rootPath);

      await assertWorkspaceRootPathAvailable(ctx.db, userId, rootPath);

      const [workspace] = ctx.db
        .insert(workspaces)
        .values({
          description: input.description.trim() || null,
          name: input.name.trim(),
          rootPath,
          userId,
        })
        .returning()
        .all();

      if (!ctx.user.selectedWorkspaceId && workspace) {
        ctx.db
          .update(users)
          .set({ selectedWorkspaceId: workspace.id })
          .where(eq(users.id, userId))
          .run();
      }

      return workspace!;
    }),

  update: protectedProcedure
    .input(workspaceUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = normalizeWorkspaceRootPath(input.rootPath);

      await assertWorkspaceRootPathAvailable(
        ctx.db,
        ctx.session.user.id,
        rootPath,
        input.workspaceId,
      );

      const [updated] = ctx.db
        .update(workspaces)
        .set({
          description: input.description.trim() || null,
          name: input.name.trim(),
          rootPath,
        })
        .where(eq(workspaces.id, input.workspaceId))
        .returning()
        .all();

      return updated!;
    }),

  archive: protectedProcedure
    .input(workspaceArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);

      let nextSelectedWorkspaceId = ctx.user.selectedWorkspaceId;
      if (ctx.user.selectedWorkspaceId === workspace.id) {
        const fallbackWorkspace = await ctx.db.query.workspaces.findFirst({
          where: and(
            ne(workspaces.id, workspace.id),
            eq(workspaces.isArchived, false),
            eq(workspaces.userId, ctx.session.user.id),
          ),
          orderBy: (workspaces, { desc }) => [desc(workspaces.createdAt)],
          columns: { id: true },
        });

        nextSelectedWorkspaceId = fallbackWorkspace?.id ?? null;
      }

      ctx.db.transaction((tx) => {
        tx.update(threads)
          .set({
            archivedAt: sql`coalesce(${threads.archivedAt}, ${Math.floor(Date.now() / 1000)})`,
            pinnedAt: null,
          })
          .where(
            and(
              eq(threads.workspaceId, workspace.id),
              eq(threads.userId, ctx.session.user.id),
              isNull(threads.archivedAt),
            ),
          )
          .run();

        tx.update(workspaces)
          .set({ isArchived: true, rootPath: null })
          .where(eq(workspaces.id, workspace.id))
          .run();

        if (ctx.user.selectedWorkspaceId === workspace.id) {
          tx.update(users)
            .set({ selectedWorkspaceId: nextSelectedWorkspaceId })
            .where(eq(users.id, ctx.session.user.id))
            .run();
        }
      });

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

      ctx.db
        .update(users)
        .set({ selectedWorkspaceId: workspace.id })
        .where(eq(users.id, ctx.session.user.id))
        .run();

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

    const fallbackWorkspace = await ctx.db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.isArchived, false),
        eq(workspaces.userId, ctx.session.user.id),
      ),
      orderBy: (workspaces, { desc }) => [desc(workspaces.createdAt)],
    });

    if (!fallbackWorkspace) {
      ctx.db
        .update(users)
        .set({ selectedWorkspaceId: null })
        .where(eq(users.id, ctx.session.user.id))
        .run();
      return null;
    }

    ctx.db
      .update(users)
      .set({ selectedWorkspaceId: fallbackWorkspace.id })
      .where(eq(users.id, ctx.session.user.id))
      .run();

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
      ctx.db
        .update(users)
        .set({
          threadListOrganizeBy: input.organizeBy,
          threadListSortBy: input.sortBy,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        organizeBy: input.organizeBy,
        sortBy: input.sortBy,
      };
    }),

  updatePermissionOverride: protectedProcedure
    .input(workspacePermissionOverrideSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);

      const [updated] = ctx.db
        .update(workspaces)
        .set({
          permissionModeOverride: input.permissionModeOverride,
        })
        .where(eq(workspaces.id, input.workspaceId))
        .returning()
        .all();

      return {
        permissionModeOverride: updated?.permissionModeOverride ?? null,
        workspaceId: input.workspaceId,
      };
    }),

  toggleExpanded: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const next = !workspace.isExpanded;

      ctx.db
        .update(workspaces)
        .set({ isExpanded: next })
        .where(eq(workspaces.id, input.workspaceId))
        .run();

      return { isExpanded: next, workspaceId: input.workspaceId };
    }),
});
