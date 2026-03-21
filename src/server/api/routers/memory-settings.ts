import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { normalizeMemorySettings } from "@/lib/memory";
import { getMemoryEmbeddingProfileById } from "@/lib/memory/profiles";
import { countMemoriesByUser } from "@/lib/memory/repository";
import {
  resolveConfiguredMemoryProfileFromId,
  resolveMemoryProfileFromSettings,
} from "@/lib/memory/runtime";
import { memorySettingsFormSchema } from "@/schemas/memory-settings.schema";
import { memorySettings } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const memorySettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.memorySettings.findFirst({
      where: eq(memorySettings.userId, ctx.session.user.id),
      columns: {
        autoSaveEnabled: true,
        autoSavePerTurnLimit: true,
        defaultScope: true,
        enabled: true,
        memoryDimensions: true,
        memoryModel: true,
        memoryProvider: true,
        retrievalLimit: true,
      },
    });

    return normalizeMemorySettings(row ?? null);
  }),

  update: protectedProcedure
    .input(memorySettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const profile = input.enabled
        ? await resolveConfiguredMemoryProfileFromId(
            userId,
            input.memoryProfileId,
          )
        : getMemoryEmbeddingProfileById(input.memoryProfileId);

      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported memory embedding profile.",
        });
      }
      const existing = await ctx.db.query.memorySettings.findFirst({
        where: eq(memorySettings.userId, userId),
      });
      const current = normalizeMemorySettings(existing ?? null);
      const next = normalizeMemorySettings({
        autoSaveEnabled: input.autoSaveEnabled,
        autoSavePerTurnLimit: input.autoSavePerTurnLimit,
        defaultScope: input.defaultScope,
        enabled: input.enabled,
        memoryDimensions: profile.dimensions,
        memoryModel: profile.model,
        memoryProvider: profile.provider,
        retrievalLimit: input.retrievalLimit,
      });

      const currentProfile = resolveMemoryProfileFromSettings(current);
      const profileChanged =
        currentProfile.id !== profile.id ||
        current.memoryDimensions !== next.memoryDimensions;

      if (profileChanged && countMemoriesByUser(userId) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Clear all memory or run a reindex before switching the memory embedding profile.",
        });
      }

      if (existing) {
        ctx.db
          .update(memorySettings)
          .set(next)
          .where(eq(memorySettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(memorySettings)
          .values({
            ...next,
            userId,
          })
          .run();
      }

      return next;
    }),
});
