import { eq } from "drizzle-orm";

import { chatSelectionSchema } from "@/schemas/chat-preferences.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const chatPreferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => ({
    mode: ctx.user.defaultChatMode ?? null,
    modelId: ctx.user.defaultChatModelId ?? null,
    reasoningEffort: ctx.user.defaultChatReasoningEffort ?? null,
  })),

  updateGlobal: protectedProcedure
    .input(chatSelectionSchema)
    .mutation(({ ctx, input }) => {
      const currentMode = ctx.user.defaultChatMode ?? null;
      const currentModelId = ctx.user.defaultChatModelId ?? null;
      const currentReasoningEffort = ctx.user.defaultChatReasoningEffort ?? null;

      ctx.db
        .update(users)
        .set({
          ...(input.mode !== undefined
            ? { defaultChatMode: input.mode ?? null }
            : {}),
          ...(input.modelId !== undefined
            ? { defaultChatModelId: input.modelId }
            : {}),
          ...(input.reasoningEffort !== undefined
            ? { defaultChatReasoningEffort: input.reasoningEffort ?? null }
            : {}),
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        mode: input.mode !== undefined ? (input.mode ?? null) : currentMode,
        modelId: input.modelId !== undefined ? input.modelId : currentModelId,
        reasoningEffort:
          input.reasoningEffort !== undefined
            ? (input.reasoningEffort ?? null)
            : currentReasoningEffort,
      };
    }),
});
