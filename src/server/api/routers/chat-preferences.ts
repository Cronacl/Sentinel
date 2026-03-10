import { eq } from "drizzle-orm";

import { chatSelectionSchema } from "@/schemas/chat-preferences.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const chatPreferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => ({
    modelId: ctx.user.defaultChatModelId ?? null,
    reasoningEffort: ctx.user.defaultChatReasoningEffort ?? null,
  })),

  updateGlobal: protectedProcedure
    .input(chatSelectionSchema)
    .mutation(({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          defaultChatModelId: input.modelId,
          defaultChatReasoningEffort: input.reasoningEffort ?? null,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        modelId: input.modelId,
        reasoningEffort: input.reasoningEffort ?? null,
      };
    }),
});
