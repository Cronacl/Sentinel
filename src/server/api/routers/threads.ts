import { TRPCError } from "@trpc/server";
import { and, eq, isNull, like } from "drizzle-orm";

import {
  threadArchiveSchema,
  threadCreateSchema,
  threadGetSchema,
  threadListSchema,
  threadRenameSchema,
  threadSearchSchema,
  threadSetActiveBranchSchema,
  threadTogglePinSchema,
  threadUpdateMetaSchema,
} from "@/schemas/workspace-thread.schema";
import { threadChatSelectionSchema } from "@/schemas/chat-preferences.schema";
import { setActiveMessage } from "@/lib/ai/chat/persistence";
import { disposeShellSession } from "@/lib/ai/chat/tools/shell";
import { mapThreadMessagesToUIMessages } from "@/lib/ai/messages/ui";
import { threadMessages, threads, workspaces } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import {
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
  getThreadListSettings,
} from "./workspace-thread-helpers";

const threadSelect = {
  archivedAt: true,
  chatModelId: true,
  chatReasoningEffort: true,
  createdAt: true,
  id: true,
  pinnedAt: true,
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

      if (settings.workspaceId) {
        await getOwnedWorkspaceOrThrow(ctx, settings.workspaceId);
      }

      if (settings.organizeBy === "workspace") {
        const allWorkspaces = await ctx.db.query.workspaces.findMany({
          where: and(
            ...[
              settings.workspaceId
                ? eq(workspaces.id, settings.workspaceId)
                : undefined,
              eq(workspaces.isArchived, false),
              eq(workspaces.userId, ctx.session.user.id),
            ].filter(Boolean),
          ),
          orderBy: (workspaces, { desc }) => [desc(workspaces.updatedAt)],
          columns: workspaceSelect,
          with: {
            threads: {
              where: and(
                isNull(threads.archivedAt),
                eq(threads.userId, ctx.session.user.id),
                ...(settings.workspaceId
                  ? [eq(threads.workspaceId, settings.workspaceId)]
                  : []),
              ),
              orderBy: (threads, { desc }) => [
                settings.sortBy === "created"
                  ? desc(threads.createdAt)
                  : desc(threads.updatedAt),
              ],
              columns: threadSelect,
            },
          },
        });

        return {
          groups: allWorkspaces.map((workspace) => ({
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

      const items = await ctx.db.query.threads.findMany({
        where: and(
          isNull(threads.archivedAt),
          eq(threads.userId, ctx.session.user.id),
          ...(settings.workspaceId
            ? [eq(threads.workspaceId, settings.workspaceId)]
            : []),
        ),
        orderBy: (threads, { desc }) => [
          settings.sortBy === "created"
            ? desc(threads.createdAt)
            : desc(threads.updatedAt),
        ],
        columns: threadSelect,
        with: {
          workspace: {
            columns: workspaceSelect,
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

      const [thread] = ctx.db
        .insert(threads)
        .values({
          ...(input.threadId ? { id: input.threadId } : {}),
          summary: input.summary.trim() || null,
          title: input.title.trim(),
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        })
        .returning()
        .all();

      const result = await ctx.db.query.threads.findFirst({
        where: eq(threads.id, thread!.id),
        columns: threadSelect,
        with: {
          workspace: {
            columns: workspaceSelect,
          },
        },
      });

      return result!;
    }),

  get: protectedProcedure
    .input(threadGetSchema)
    .query(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);
      const messages = await ctx.db.query.threadMessages.findMany({
        where: eq(threadMessages.threadId, thread.id),
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      return {
        messages: await mapThreadMessagesToUIMessages(messages as any[]),
        thread: {
          archivedAt: thread.archivedAt,
          chatModelId: thread.chatModelId,
          chatReasoningEffort: thread.chatReasoningEffort,
          createdAt: thread.createdAt,
          id: thread.id,
          pinnedAt: thread.pinnedAt,
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

  search: protectedProcedure
    .input(threadSearchSchema)
    .query(async ({ ctx, input }) => {
      const allThreads = await ctx.db.query.threads.findMany({
        where: and(
          isNull(threads.archivedAt),
          eq(threads.userId, ctx.session.user.id),
          ...(input.workspaceId
            ? [eq(threads.workspaceId, input.workspaceId)]
            : []),
        ),
        orderBy: (threads, { desc }) => [desc(threads.updatedAt)],
        columns: threadSelect,
        with: {
          workspace: {
            columns: workspaceSelect,
          },
        },
        limit: 50,
      });

      const query = input.query.toLowerCase();
      return allThreads.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.summary && t.summary.toLowerCase().includes(query)),
      );
    }),

  rename: protectedProcedure
    .input(threadRenameSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      const [updated] = ctx.db
        .update(threads)
        .set({ title: input.title.trim() })
        .where(eq(threads.id, input.threadId))
        .returning({
          archivedAt: threads.archivedAt,
          createdAt: threads.createdAt,
          id: threads.id,
          pinnedAt: threads.pinnedAt,
          summary: threads.summary,
          title: threads.title,
          updatedAt: threads.updatedAt,
        })
        .all();

      return updated!;
    }),

  updateMeta: protectedProcedure
    .input(threadUpdateMetaSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      const [updated] = ctx.db
        .update(threads)
        .set({
          ...(input.summary === undefined
            ? {}
            : { summary: input.summary.trim() || null }),
        })
        .where(eq(threads.id, input.threadId))
        .returning({
          archivedAt: threads.archivedAt,
          createdAt: threads.createdAt,
          id: threads.id,
          pinnedAt: threads.pinnedAt,
          summary: threads.summary,
          title: threads.title,
          updatedAt: threads.updatedAt,
        })
        .all();

      return updated!;
    }),

  updateChatSettings: protectedProcedure
    .input(threadChatSelectionSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      const [updated] = ctx.db
        .update(threads)
        .set({
          chatModelId: input.modelId,
          chatReasoningEffort: input.reasoningEffort ?? null,
        })
        .where(eq(threads.id, input.threadId))
        .returning({
          chatModelId: threads.chatModelId,
          chatReasoningEffort: threads.chatReasoningEffort,
          id: threads.id,
        })
        .all();

      return {
        modelId: updated!.chatModelId,
        reasoningEffort: updated!.chatReasoningEffort,
        threadId: updated!.id,
      };
    }),

  archive: protectedProcedure
    .input(threadArchiveSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      await disposeShellSession(input.threadId);

      const [updated] = ctx.db
        .update(threads)
        .set({ archivedAt: new Date() })
        .where(eq(threads.id, input.threadId))
        .returning({
          archivedAt: threads.archivedAt,
          createdAt: threads.createdAt,
          id: threads.id,
          pinnedAt: threads.pinnedAt,
          summary: threads.summary,
          title: threads.title,
          updatedAt: threads.updatedAt,
        })
        .all();

      return updated!;
    }),

  togglePin: protectedProcedure
    .input(threadTogglePinSchema)
    .mutation(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);
      const nextPinnedAt = input.pinned
        ? (thread.pinnedAt ?? new Date())
        : null;

      const [updated] = ctx.db
        .update(threads)
        .set({ pinnedAt: nextPinnedAt })
        .where(eq(threads.id, input.threadId))
        .returning({
          archivedAt: threads.archivedAt,
          createdAt: threads.createdAt,
          id: threads.id,
          pinnedAt: threads.pinnedAt,
          summary: threads.summary,
          title: threads.title,
          updatedAt: threads.updatedAt,
        })
        .all();

      return updated!;
    }),

  setActiveBranch: protectedProcedure
    .input(threadSetActiveBranchSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      await setActiveMessage(input.threadId, input.messageId);

      return { ok: true };
    }),
});
