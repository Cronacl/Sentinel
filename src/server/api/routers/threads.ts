import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  threadArchiveSchema,
  threadCreateSchema,
  threadGetSchema,
  threadQueuedFollowUpActionSchema,
  threadListSchema,
  threadRenameSchema,
  threadSearchSchema,
  threadSetActiveBranchSchema,
  threadSettingsSchema,
  threadTogglePinSchema,
  threadUpdateMetaSchema,
} from "@/schemas/workspace-thread.schema";
import { getRepoThreadState } from "@/lib/ai/chat/engines/types";
import { runThreadChat } from "@/lib/ai/chat";
import {
  getLatestAssistantMessageId,
  listThreadFollowUps,
  moveThreadFollowUpToFront,
  removeThreadFollowUp,
  setActiveMessage,
} from "@/lib/ai/chat/persistence";
import { summarizeQueuedFollowUp } from "@/lib/ai/chat/session-server";
import { disposeShellSession } from "@/lib/ai/chat/tools/shell";
import { mapThreadMessagesToUIMessages } from "@/lib/ai/messages/ui";
import { threadMessages, threads, workspaces } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import {
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
  getThreadListSettings,
} from "./workspace-thread-helpers";
import {
  escapeThreadSearchLikePattern,
  sortThreadSearchResults,
} from "./thread-search";

const threadSelect = {
  archivedAt: true,
  chatEngine: true,
  chatEngineState: true,
  chatModelId: true,
  chatReasoningEffort: true,
  createdAt: true,
  id: true,
  mode: true,
  pinnedAt: true,
  status: true,
  summary: true,
  title: true,
  updatedAt: true,
} as const;

const workspaceSelect = {
  createdAt: true,
  description: true,
  id: true,
  name: true,
  permissionModeOverride: true,
  rootPath: true,
  updatedAt: true,
} as const;

function withLinkedPullRequest<T extends { chatEngineState?: unknown }>(
  thread: T,
) {
  return {
    ...thread,
    linkedPullRequest:
      getRepoThreadState(thread.chatEngineState)?.lastPullRequest ?? null,
  };
}

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
          orderBy: (workspaces, { desc }) => [desc(workspaces.createdAt)],
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
            threads: workspace.threads.map(withLinkedPullRequest),
            workspace: {
              createdAt: workspace.createdAt,
              description: workspace.description,
              id: workspace.id,
              name: workspace.name,
              permissionModeOverride: workspace.permissionModeOverride,
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
        items: items.map(withLinkedPullRequest),
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
          chatEngine: input.engine,
          ...(input.threadId ? { id: input.threadId } : {}),
          mode: input.mode,
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
      const queuedFollowUps = await listThreadFollowUps(thread.id);

      return {
        messages: await mapThreadMessagesToUIMessages(messages as any[]),
        queuedFollowUps: queuedFollowUps
          .filter((followUp) => followUp.status === "queued")
          .map(summarizeQueuedFollowUp),
        thread: {
          activeRunId: thread.activeStreamId,
          archivedAt: thread.archivedAt,
          chatEngine: thread.chatEngine,
          chatModelId: thread.chatModelId,
          chatReasoningEffort: thread.chatReasoningEffort,
          createdAt: thread.createdAt,
          id: thread.id,
          linkedPullRequest:
            getRepoThreadState(thread.chatEngineState)?.lastPullRequest ?? null,
          mode: thread.mode,
          pinnedAt: thread.pinnedAt,
          status: thread.status,
          summary: thread.summary,
          title: thread.title,
          updatedAt: thread.updatedAt,
        },
        workspace: {
          createdAt: thread.workspace.createdAt,
          description: thread.workspace.description,
          id: thread.workspace.id,
          name: thread.workspace.name,
          permissionModeOverride: thread.workspace.permissionModeOverride,
          rootPath: thread.workspace.rootPath,
          updatedAt: thread.workspace.updatedAt,
        },
      };
    }),

  search: protectedProcedure
    .input(threadSearchSchema)
    .query(async ({ ctx, input }) => {
      const normalizedQuery = input.query.trim().toLowerCase();
      const queryPattern = `%${escapeThreadSearchLikePattern(normalizedQuery)}%`;
      const matchedThreads = await ctx.db.query.threads.findMany({
        where: and(
          isNull(threads.archivedAt),
          eq(threads.userId, ctx.session.user.id),
          sql`(
            lower(${threads.title}) like ${queryPattern} escape '\\'
            or lower(coalesce(${threads.summary}, '')) like ${queryPattern} escape '\\'
          )`,
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
      });

      return sortThreadSearchResults(matchedThreads, normalizedQuery)
        .map(withLinkedPullRequest)
        .slice(0, 50);
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
          mode: threads.mode,
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
          mode: threads.mode,
          pinnedAt: threads.pinnedAt,
          summary: threads.summary,
          title: threads.title,
          updatedAt: threads.updatedAt,
        })
        .all();

      return updated!;
    }),

  updateChatSettings: protectedProcedure
    .input(threadSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);

      const [updated] = ctx.db
        .update(threads)
        .set({
          ...(input.engine === undefined ? {} : { chatEngine: input.engine }),
          ...(input.modelId === undefined
            ? {}
            : { chatModelId: input.modelId }),
          ...(input.reasoningEffort === undefined
            ? {}
            : { chatReasoningEffort: input.reasoningEffort ?? null }),
          ...(input.mode === undefined ? {} : { mode: input.mode }),
        })
        .where(eq(threads.id, input.threadId))
        .returning({
          chatEngine: threads.chatEngine,
          chatModelId: threads.chatModelId,
          chatReasoningEffort: threads.chatReasoningEffort,
          id: threads.id,
          mode: threads.mode,
        })
        .all();

      return {
        engine: updated!.chatEngine,
        modelId: updated!.chatModelId,
        mode: updated!.mode,
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
          mode: threads.mode,
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
          mode: threads.mode,
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

      const messages = await ctx.db.query.threadMessages.findMany({
        where: eq(threadMessages.threadId, input.threadId),
        orderBy: (records, { asc }) => [asc(records.createdAt)],
      });

      return {
        messages: await mapThreadMessagesToUIMessages(messages as any[]),
        ok: true,
      };
    }),

  removeQueuedFollowUp: protectedProcedure
    .input(threadQueuedFollowUpActionSchema)
    .mutation(async ({ ctx, input }) => {
      await getOwnedThreadOrThrow(ctx, input.threadId);
      removeThreadFollowUp(input.threadId, input.followUpId);
      return { ok: true };
    }),

  steerQueuedFollowUp: protectedProcedure
    .input(threadQueuedFollowUpActionSchema)
    .mutation(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);
      moveThreadFollowUpToFront(input.threadId, input.followUpId);

      if (thread.status === "streaming") {
        const latestAssistantId = await getLatestAssistantMessageId(
          input.threadId,
        );

        await runThreadChat(
          {
            id: input.threadId,
            ...(latestAssistantId ? { messageId: latestAssistantId } : {}),
            trigger: "stop-stream",
            workspaceId: thread.workspaceId,
          },
          ctx.session.user.id,
        );
      }

      return { ok: true };
    }),
});
