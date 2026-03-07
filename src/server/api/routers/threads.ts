import { TRPCError } from "@trpc/server";

import {
  threadArchiveSchema,
  threadCreateSchema,
  threadGetSchema,
  threadListSchema,
  threadRenameSchema,
  threadUpdateMetaSchema,
} from "@/schemas/workspace-thread.schema";
import { mapThreadMessagesToUIMessages } from "@/lib/ai/ui-messages";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import {
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
  getThreadListSettings,
} from "./workspace-thread-helpers";

function getThreadOrder(sortBy: "created" | "updated") {
  return sortBy === "created"
    ? ({ createdAt: "desc" } as const)
    : ({ updatedAt: "desc" } as const);
}

const threadSelect = {
  archivedAt: true,
  createdAt: true,
  id: true,
  summary: true,
  title: true,
  updatedAt: true,
} as const;

const workspaceSelect = {
  createdAt: true,
  description: true,
  id: true,
  name: true,
  rootPath: true,
  updatedAt: true,
} as const;

export const threadsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(threadListSchema)
    .query(async ({ ctx, input }) => {
      const settings = getThreadListSettings(ctx.user, input);
      const where = {
        archivedAt: null,
        ...(settings.workspaceId ? { workspaceId: settings.workspaceId } : {}),
        userId: ctx.session.user.id,
        workspace: {
          isArchived: false,
          userId: ctx.session.user.id,
        },
      } as const;

      if (settings.workspaceId) {
        await getOwnedWorkspaceOrThrow(ctx, settings.workspaceId);
      }

      if (settings.organizeBy === "workspace") {
        const workspaces = await ctx.db.workspace.findMany({
          where: {
            ...(settings.workspaceId ? { id: settings.workspaceId } : {}),
            isArchived: false,
            userId: ctx.session.user.id,
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            ...workspaceSelect,
            threads: {
              orderBy: getThreadOrder(settings.sortBy),
              select: threadSelect,
              where,
            },
          },
        });

        return {
          groups: workspaces.map((workspace) => ({
            threads: workspace.threads,
            workspace: {
              createdAt: workspace.createdAt,
              description: workspace.description,
              id: workspace.id,
              name: workspace.name,
              rootPath: workspace.rootPath,
              updatedAt: workspace.updatedAt,
            },
          })),
          organizeBy: settings.organizeBy,
          sortBy: settings.sortBy,
        };
      }

      const items = await ctx.db.thread.findMany({
        where,
        orderBy: getThreadOrder(settings.sortBy),
        select: {
          ...threadSelect,
          workspace: {
            select: workspaceSelect,
          },
        },
      });

      return {
        items,
        organizeBy: settings.organizeBy,
        sortBy: settings.sortBy,
      };
    }),

  create: protectedProcedure
    .input(threadCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const workspaceId = input.workspaceId ?? ctx.user.selectedWorkspaceId;

      if (!workspaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a workspace before creating a thread.",
        });
      }

      const workspace = await getOwnedWorkspaceOrThrow(ctx, workspaceId);
      if (workspace.isArchived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived workspaces cannot accept new threads.",
        });
      }

      return ctx.db.thread.create({
        data: {
          ...(input.threadId ? { id: input.threadId } : {}),
          summary: input.summary.trim() || null,
          title: input.title.trim(),
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        },
        select: {
          ...threadSelect,
          workspace: {
            select: workspaceSelect,
          },
        },
      });
    }),

  get: protectedProcedure
    .input(threadGetSchema)
    .query(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);
      const messages = await ctx.db.threadMessage.findMany({
        where: { threadId: thread.id },
        orderBy: {
          createdAt: "asc",
        },
      });

      return {
        messages: await mapThreadMessagesToUIMessages(messages),
        thread: {
          archivedAt: thread.archivedAt,
          createdAt: thread.createdAt,
          id: thread.id,
          summary: thread.summary,
          title: thread.title,
          updatedAt: thread.updatedAt,
        },
        workspace: {
          createdAt: thread.workspace.createdAt,
          description: thread.workspace.description,
          id: thread.workspace.id,
          name: thread.workspace.name,
          rootPath: thread.workspace.rootPath,
          updatedAt: thread.workspace.updatedAt,
        },
      };
    }),

  rename: protectedProcedure
    .input(threadRenameSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      return ctx.db.thread.update({
        where: { id: input.threadId },
        data: {
          title: input.title.trim(),
        },
        select: threadSelect,
      });
    }),

  updateMeta: protectedProcedure
    .input(threadUpdateMetaSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      return ctx.db.thread.update({
        where: { id: input.threadId },
        data: {
          ...(input.summary === undefined
            ? {}
            : { summary: input.summary.trim() || null }),
        },
        select: threadSelect,
      });
    }),

  archive: protectedProcedure
    .input(threadArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      return ctx.db.thread.update({
        where: { id: input.threadId },
        data: {
          archivedAt: new Date(),
        },
        select: threadSelect,
      });
    }),
});
