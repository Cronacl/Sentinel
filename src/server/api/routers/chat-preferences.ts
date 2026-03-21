import { eq } from "drizzle-orm";

import { getEnabledModels } from "@/lib/ai/providers/resolver";
import { normalizeSelectedModelId } from "@/lib/ai/providers/model-selection";
import { chatSelectionSchema } from "@/schemas/chat-preferences.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const chatPreferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const enabledModels = await getEnabledModels(ctx.user.id);

    return {
      mode: ctx.user.defaultChatMode ?? null,
      modelId: normalizeSelectedModelId(
        ctx.user.defaultChatModelId ?? null,
        enabledModels,
      ),
      reasoningEffort: ctx.user.defaultChatReasoningEffort ?? null,
    };
  }),

  updateGlobal: protectedProcedure
    .input(chatSelectionSchema)
    .mutation(async ({ ctx, input }) => {
      const enabledModels = await getEnabledModels(ctx.user.id);
      const currentMode = ctx.user.defaultChatMode ?? null;
      const currentModelId = normalizeSelectedModelId(
        ctx.user.defaultChatModelId ?? null,
        enabledModels,
      );
      const currentReasoningEffort =
        ctx.user.defaultChatReasoningEffort ?? null;

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
        modelId:
          input.modelId !== undefined
            ? normalizeSelectedModelId(input.modelId, enabledModels)
            : currentModelId,
        reasoningEffort:
          input.reasoningEffort !== undefined
            ? (input.reasoningEffort ?? null)
            : currentReasoningEffort,
      };
    }),
});
