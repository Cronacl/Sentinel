import {
  threadMessageAppendSchema,
  threadMessageListSchema,
  threadMessagesReplaceSchema,
} from "@/schemas/workspace-thread.schema";
import { TRPCError } from "@trpc/server";
import {
  mapThreadMessagesToUIMessages,
  serializeThreadUIMessage,
  validateThreadUIMessage,
  validateThreadUIMessages,
} from "@/lib/ai/ui-messages";
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

      const [persistedMessage] = await ctx.db.$transaction([
        ctx.db.threadMessage.upsert({
          where: {
            threadId_messageId: {
              messageId: message.id,
              threadId: thread.id,
            },
          },
          create: {
            ...serializeThreadUIMessage(message),
            threadId: thread.id,
          },
          update: serializeThreadUIMessage(message),
        }),
        ctx.db.thread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        }),
      ]);

      const [uiMessage] = await mapThreadMessagesToUIMessages([
        persistedMessage,
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

      await ctx.db.$transaction([
        ctx.db.threadMessage.deleteMany({
          where: { threadId: thread.id },
        }),
        ...(messages.length === 0
          ? []
          : [
              ctx.db.threadMessage.createMany({
                data: messages.map((message) => ({
                  ...serializeThreadUIMessage(message),
                  threadId: thread.id,
                })),
              }),
            ]),
        ctx.db.thread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        }),
      ]);

      return messages;
    }),

  list: protectedProcedure
    .input(threadMessageListSchema)
    .query(async ({ ctx, input }) => {
      const thread = await getOwnedThreadOrThrow(ctx, input.threadId);

      const messages = await ctx.db.threadMessage.findMany({
        where: { threadId: thread.id },
        orderBy: {
          createdAt: "asc",
        },
      });

      return mapThreadMessagesToUIMessages(messages);
    }),
});
