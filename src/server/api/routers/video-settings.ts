import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import {
  buildVideoGenerationProviderEntries,
  buildVideoGenerationRuntime,
  stripVideoGenerationProviderConfig,
} from "@/lib/ai/providers/videos";
import { normalizeVideoGenerationSettings } from "@/lib/video-generation";
import {
  videoGenerationProviderFormSchema,
  videoGenerationSettingsFormSchema,
} from "@/schemas/video-settings.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  providerCredentials,
  videoGenerationProviderSettings,
  videoGenerationSettings,
} from "@/server/db/schema";

async function loadVideoGenerationState(userId: string) {
  const [credentials, providerSettingRows, settings] = await Promise.all([
    db.query.providerCredentials.findMany({
      where: eq(providerCredentials.userId, userId),
      columns: {
        encryptedConfig: true,
        isEnabled: true,
        provider: true,
      },
    }),
    db.query.videoGenerationProviderSettings.findMany({
      where: eq(videoGenerationProviderSettings.userId, userId),
      columns: {
        isCustom: true,
        isEnabled: true,
        modelId: true,
        provider: true,
      },
    }),
    db.query.videoGenerationSettings.findFirst({
      where: eq(videoGenerationSettings.userId, userId),
      columns: {
        defaultProvider: true,
      },
    }),
  ]);

  const providerEntries = buildVideoGenerationProviderEntries({
    credentials,
    providerSettings: providerSettingRows,
  });
  const runtime = buildVideoGenerationRuntime({
    providerEntries,
    settings,
  });

  return {
    providerEntries,
    runtime,
    settings: normalizeVideoGenerationSettings({
      defaultProvider: runtime.defaultProvider,
    }),
  };
}

export const videoSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { settings } = await loadVideoGenerationState(ctx.session.user.id);
    return settings;
  }),

  listProviders: protectedProcedure.query(async ({ ctx }) => {
    const { providerEntries } = await loadVideoGenerationState(
      ctx.session.user.id,
    );
    return stripVideoGenerationProviderConfig(providerEntries);
  }),

  update: protectedProcedure
    .input(videoGenerationSettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { runtime } = await loadVideoGenerationState(userId);

      if (input.defaultProvider && !runtime.providers[input.defaultProvider]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The default video provider must be configured, enabled, and have a valid video model.",
        });
      }

      const existing = await ctx.db.query.videoGenerationSettings.findFirst({
        where: eq(videoGenerationSettings.userId, userId),
        columns: { id: true },
      });

      if (existing) {
        ctx.db
          .update(videoGenerationSettings)
          .set({
            defaultProvider: input.defaultProvider,
          })
          .where(eq(videoGenerationSettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(videoGenerationSettings)
          .values({
            defaultProvider: input.defaultProvider,
            userId,
          })
          .run();
      }

      const refreshed = await loadVideoGenerationState(userId);
      return refreshed.settings;
    }),

  updateProvider: protectedProcedure
    .input(videoGenerationProviderFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { providerEntries } = await loadVideoGenerationState(userId);
      const providerEntry = providerEntries.find(
        (entry) => entry.provider === input.provider,
      );

      if (!providerEntry) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That provider is not configured for video generation yet. Add provider credentials first.",
        });
      }

      const normalizedModelId = input.modelId?.trim() || null;
      if (
        normalizedModelId &&
        !providerEntry.availableModels.some(
          (model) => model.id === normalizedModelId,
        ) &&
        !(input.isCustom && providerEntry.supportsCustomModel)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a valid video model for that provider.",
        });
      }

      if (
        input.isEnabled &&
        !normalizedModelId &&
        providerEntry.availableModels.length === 0 &&
        !providerEntry.supportsCustomModel
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This provider does not expose any built-in video models here. Enter a custom model or deployment name first.",
        });
      }

      const existing =
        await ctx.db.query.videoGenerationProviderSettings.findFirst({
          where: and(
            eq(videoGenerationProviderSettings.userId, userId),
            eq(videoGenerationProviderSettings.provider, input.provider),
          ),
          columns: { id: true },
        });

      const values = {
        isCustom: input.isCustom,
        isEnabled: input.isEnabled,
        modelId: normalizedModelId,
      };

      if (existing) {
        ctx.db
          .update(videoGenerationProviderSettings)
          .set(values)
          .where(eq(videoGenerationProviderSettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(videoGenerationProviderSettings)
          .values({
            provider: input.provider,
            userId,
            ...values,
          })
          .run();
      }

      const refreshed = await loadVideoGenerationState(userId);
      const updatedProvider = stripVideoGenerationProviderConfig(
        refreshed.providerEntries,
      ).find((entry) => entry.provider === input.provider);

      return updatedProvider ?? null;
    }),
});
