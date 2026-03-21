import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

import {
  clearMemoriesForUser,
  countMemories,
  countMemoriesByUser,
  getMemoryFacetCounts,
  getMemoryById,
  listMemories,
  toggleMemoryPinned,
} from "@/lib/memory/repository";
import { forgetMemoryRecord, reindexAllMemories } from "@/lib/memory/service";
import { resolveConfiguredMemoryProfileFromId } from "@/lib/memory/runtime";
import {
  memoryClearAllSchema,
  memoryDeleteSchema,
  memoryListSchema,
  memoryReindexSchema,
  memoryTogglePinnedSchema,
} from "@/schemas/memory.schema";
import { memorySettings, threads, workspaces } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const memoryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(memoryListSchema.optional())
    .query(async ({ ctx, input }) => {
      const filters = input ?? {};
      const listFilters = {
        ...(filters.kind && filters.kind !== "all"
          ? { kind: filters.kind }
          : {}),
        ...(typeof filters.pinned === "boolean"
          ? { pinned: filters.pinned }
          : {}),
        ...(filters.query?.trim() ? { query: filters.query.trim() } : {}),
        ...(filters.scope && filters.scope !== "all"
          ? { scope: filters.scope }
          : {}),
        ...(filters.workspaceId && filters.workspaceId !== "all"
          ? { workspaceId: filters.workspaceId }
          : {}),
        userId: ctx.session.user.id,
      } as const;
      const memories = listMemories(listFilters);
      const filteredTotal = countMemories(listFilters);
      const facets = getMemoryFacetCounts({
        ...(typeof filters.pinned === "boolean"
          ? { pinned: filters.pinned }
          : {}),
        ...(filters.query?.trim() ? { query: filters.query.trim() } : {}),
        ...(filters.workspaceId && filters.workspaceId !== "all"
          ? { workspaceId: filters.workspaceId }
          : {}),
        userId: ctx.session.user.id,
      });

      const workspaceIds = [
        ...new Set(
          memories
            .map((memory) => memory.workspaceId)
            .filter((workspaceId): workspaceId is string =>
              Boolean(workspaceId),
            ),
        ),
      ];
      const threadIds = [
        ...new Set(
          memories
            .map((memory) => memory.sourceThreadId)
            .filter((threadId): threadId is string => Boolean(threadId)),
        ),
      ];

      const workspaceRows =
        workspaceIds.length > 0
          ? await ctx.db.query.workspaces.findMany({
              where: and(
                eq(workspaces.userId, ctx.session.user.id),
                inArray(workspaces.id, workspaceIds),
              ),
              columns: { id: true, name: true },
            })
          : [];
      const threadRows =
        threadIds.length > 0
          ? await ctx.db.query.threads.findMany({
              where: and(
                eq(threads.userId, ctx.session.user.id),
                inArray(threads.id, threadIds),
              ),
              columns: { id: true, title: true },
            })
          : [];

      const workspaceMap = new Map(
        workspaceRows.map((workspace) => [workspace.id, workspace.name]),
      );
      const threadMap = new Map(
        threadRows.map((thread) => [thread.id, thread.title]),
      );

      return {
        items: memories.map((memory) => ({
          ...memory,
          threadTitle: memory.sourceThreadId
            ? (threadMap.get(memory.sourceThreadId) ?? null)
            : null,
          workspaceName: memory.workspaceId
            ? (workspaceMap.get(memory.workspaceId) ?? null)
            : null,
        })),
        facets,
        filteredTotal,
        total: countMemoriesByUser(ctx.session.user.id),
      };
    }),

  delete: protectedProcedure
    .input(memoryDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      const memory = getMemoryById(ctx.session.user.id, input.memoryId);

      if (!memory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Memory not found.",
        });
      }

      const removed = forgetMemoryRecord(ctx.session.user.id, input.memoryId);
      return { removed };
    }),

  clearAll: protectedProcedure
    .input(memoryClearAllSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const deletedCount = clearMemoriesForUser(ctx.session.user.id);

      if (input?.nextProfileId) {
        const profile = await resolveConfiguredMemoryProfileFromId(
          ctx.session.user.id,
          input.nextProfileId,
        );
        const existing = await ctx.db.query.memorySettings.findFirst({
          where: eq(memorySettings.userId, ctx.session.user.id),
          columns: { id: true },
        });

        if (existing) {
          ctx.db
            .update(memorySettings)
            .set({
              memoryDimensions: profile.dimensions,
              memoryModel: profile.model,
              memoryProvider: profile.provider,
            })
            .where(eq(memorySettings.id, existing.id))
            .run();
        }
      }

      return { deletedCount };
    }),

  reindex: protectedProcedure
    .input(memoryReindexSchema)
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveConfiguredMemoryProfileFromId(
        ctx.session.user.id,
        input.nextProfileId,
      );
      const count = await reindexAllMemories({
        nextProfile: profile,
        userId: ctx.session.user.id,
      });
      const existing = await ctx.db.query.memorySettings.findFirst({
        where: eq(memorySettings.userId, ctx.session.user.id),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Memory settings were not found.",
        });
      }

      ctx.db
        .update(memorySettings)
        .set({
          memoryDimensions: profile.dimensions,
          memoryModel: profile.model,
          memoryProvider: profile.provider,
        })
        .where(eq(memorySettings.id, existing.id))
        .run();

      return { reindexedCount: count };
    }),

  togglePinned: protectedProcedure
    .input(memoryTogglePinnedSchema)
    .mutation(async ({ ctx, input }) => {
      toggleMemoryPinned(ctx.session.user.id, input.memoryId, input.isPinned);
      return {
        isPinned: input.isPinned,
        memoryId: input.memoryId,
      };
    }),
});
