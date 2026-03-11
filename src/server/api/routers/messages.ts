import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  threadMessageAppendSchema,
  threadMessageListSchema,
  threadMessagesReplaceSchema,
} from "@/schemas/workspace-thread.schema";
import {
  mapThreadMessagesToUIMessages,
  serializeThreadUIMessage,
  validateThreadUIMessage,
  validateThreadUIMessages,
} from "@/lib/ai/messages/ui";
import { threadMessages, threads } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedThreadOrThrow } from "./workspace-thread-helpers";

export const messagesRouter = createTRPCRouter({
  append: protectedProcedure
    .input(threadMessageAppendSchema)
    .mutation(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);

      if (thread.archivedAt || thread.workspace.isArchived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived threads cannot receive new messages.",
        });
      }

      const message = await validateThreadUIMessage(input.message);
      const serialized = serializeThreadUIMessage(message);

      let persistedMessage: typeof threadMessages.$inferSelect;

      ctx.db.transaction((tx) => {
        const existing = tx
          .select({ id: threadMessages.id })
          .from(threadMessages)
          .where(
            and(
              eq(threadMessages.threadId, thread.id),
              eq(threadMessages.messageId, serialized.messageId),
            ),
          )
          .get();

        if (existing) {
          tx.update(threadMessages)
            .set(serialized)
            .where(eq(threadMessages.id, existing.id))
            .run();
          const updated = tx
            .select()
            .from(threadMessages)
            .where(eq(threadMessages.id, existing.id))
            .get();
          persistedMessage = updated!;
        } else {
          const insertedRows = tx
            .insert(threadMessages)
            .values({
              ...serialized,
              threadId: thread.id,
            })
            .returning()
            .all();
          const inserted = insertedRows[0];
          persistedMessage = inserted!;
        }

        tx.update(threads)
          .set({ updatedAt: new Date() })
          .where(eq(threads.id, thread.id))
          .run();
      });

      const [uiMessage] = await mapThreadMessagesToUIMessages([
        persistedMessage! as any,
      ]);

      return uiMessage;
    }),

  replaceAll: protectedProcedure
    .input(threadMessagesReplaceSchema)
    .mutation(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);

      if (thread.archivedAt || thread.workspace.isArchived) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived threads cannot receive new messages.",
        });
      }

      const messages = await validateThreadUIMessages(input.messages);

      ctx.db.transaction((tx) => {
        tx.delete(threadMessages)
          .where(eq(threadMessages.threadId, thread.id))
          .run();

        for (const message of messages) {
          tx.insert(threadMessages)
            .values({
              ...serializeThreadUIMessage(message),
              threadId: thread.id,
            })
            .run();
        }

        tx.update(threads)
          .set({ updatedAt: new Date() })
          .where(eq(threads.id, thread.id))
          .run();
      });

      return messages;
    }),

  list: protectedProcedure
    .input(threadMessageListSchema)
    .query(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);

      const messages = await ctx.db.query.threadMessages.findMany({
        where: eq(threadMessages.threadId, thread.id),
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      return await mapThreadMessagesToUIMessages(messages as any[]);
    }),
});
