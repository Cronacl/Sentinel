import { eq } from "drizzle-orm";

import { getEnabledModels } from "@/lib/ai/providers/resolver";
import { normalizeSelectedModelId } from "@/lib/ai/providers/model-selection";
import { chatSelectionSchema } from "@/schemas/chat-preferences.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const chatPreferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const enabledModels = await getEnabledModels(ctx.user.id);
    const engine = ctx.user.defaultChatEngine ?? "sentinel";

    return {
      engine,
      mode: ctx.user.defaultChatMode ?? null,
      modelId:
        engine === "sentinel"
          ? normalizeSelectedModelId(
              ctx.user.defaultChatModelId ?? null,
              enabledModels,
            )
          : (ctx.user.defaultChatModelId ?? null),
      reasoningEffort: ctx.user.defaultChatReasoningEffort ?? null,
    };
  }),

  updateGlobal: protectedProcedure
    .input(chatSelectionSchema)
    .mutation(async ({ ctx, input }) => {
      const enabledModels = await getEnabledModels(ctx.user.id);
      const currentEngine = ctx.user.defaultChatEngine ?? "sentinel";
      const currentMode = ctx.user.defaultChatMode ?? null;
      const currentModelId =
        currentEngine === "sentinel"
          ? normalizeSelectedModelId(
              ctx.user.defaultChatModelId ?? null,
              enabledModels,
            )
          : (ctx.user.defaultChatModelId ?? null);
      const currentReasoningEffort =
        ctx.user.defaultChatReasoningEffort ?? null;

      ctx.db
        .update(users)
        .set({
          ...(input.engine !== undefined
            ? { defaultChatEngine: input.engine ?? null }
            : {}),
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
        engine:
          input.engine !== undefined
            ? (input.engine ?? "sentinel")
            : currentEngine,
        mode: input.mode !== undefined ? (input.mode ?? null) : currentMode,
        modelId:
          input.modelId !== undefined
            ? (input.engine ?? currentEngine) === "sentinel"
              ? normalizeSelectedModelId(input.modelId, enabledModels)
              : input.modelId
            : currentModelId,
        reasoningEffort:
          input.reasoningEffort !== undefined
            ? (input.reasoningEffort ?? null)
            : currentReasoningEffort,
      };
    }),
});
