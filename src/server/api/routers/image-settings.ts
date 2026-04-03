import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import {
  buildImageGenerationProviderEntries,
  buildImageGenerationRuntime,
  stripImageGenerationProviderConfig,
} from "@/lib/ai/providers/images";
import { normalizeImageGenerationSettings } from "@/lib/image-generation";
import {
  imageGenerationProviderFormSchema,
  imageGenerationSettingsFormSchema,
} from "@/schemas/image-settings.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  imageGenerationProviderSettings,
  imageGenerationSettings,
  providerCredentials,
} from "@/server/db/schema";

async function loadImageGenerationState(userId: string) {
  const [credentials, providerSettingRows, settings] = await Promise.all([
    db.query.providerCredentials.findMany({
      where: eq(providerCredentials.userId, userId),
      columns: {
        encryptedConfig: true,
        isEnabled: true,
        provider: true,
      },
    }),
    db.query.imageGenerationProviderSettings.findMany({
      where: eq(imageGenerationProviderSettings.userId, userId),
      columns: {
        isCustom: true,
        isEnabled: true,
        modelId: true,
        provider: true,
      },
    }),
    db.query.imageGenerationSettings.findFirst({
      where: eq(imageGenerationSettings.userId, userId),
      columns: {
        defaultProvider: true,
      },
    }),
  ]);

  const providerEntries = buildImageGenerationProviderEntries({
    credentials,
    providerSettings: providerSettingRows,
  });
  const runtime = buildImageGenerationRuntime({
    providerEntries,
    settings,
  });

  return {
    providerEntries,
    runtime,
    settings: normalizeImageGenerationSettings({
      defaultProvider: runtime.defaultProvider,
    }),
  };
}

export const imageSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { settings } = await loadImageGenerationState(ctx.session.user.id);
    return settings;
  }),

  listProviders: protectedProcedure.query(async ({ ctx }) => {
    const { providerEntries } = await loadImageGenerationState(
      ctx.session.user.id,
    );
    return stripImageGenerationProviderConfig(providerEntries);
  }),

  update: protectedProcedure
    .input(imageGenerationSettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { runtime } = await loadImageGenerationState(userId);

      if (input.defaultProvider && !runtime.providers[input.defaultProvider]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The default image provider must be configured, enabled, and have a valid image model.",
        });
      }

      const existing = await ctx.db.query.imageGenerationSettings.findFirst({
        where: eq(imageGenerationSettings.userId, userId),
        columns: { id: true },
      });

      if (existing) {
        ctx.db
          .update(imageGenerationSettings)
          .set({
            defaultProvider: input.defaultProvider,
          })
          .where(eq(imageGenerationSettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(imageGenerationSettings)
          .values({
            defaultProvider: input.defaultProvider,
            userId,
          })
          .run();
      }

      const refreshed = await loadImageGenerationState(userId);
      return refreshed.settings;
    }),

  updateProvider: protectedProcedure
    .input(imageGenerationProviderFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { providerEntries } = await loadImageGenerationState(userId);
      const providerEntry = providerEntries.find(
        (entry) => entry.provider === input.provider,
      );

      if (!providerEntry) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That provider is not configured for image generation yet. Add provider credentials first.",
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
          message: "Select a valid image model for that provider.",
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
            "This provider does not expose any built-in image models here. Enter a custom model or deployment name first.",
        });
      }

      const existing =
        await ctx.db.query.imageGenerationProviderSettings.findFirst({
          where: and(
            eq(imageGenerationProviderSettings.userId, userId),
            eq(imageGenerationProviderSettings.provider, input.provider),
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
          .update(imageGenerationProviderSettings)
          .set(values)
          .where(eq(imageGenerationProviderSettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(imageGenerationProviderSettings)
          .values({
            provider: input.provider,
            userId,
            ...values,
          })
          .run();
      }

      const refreshed = await loadImageGenerationState(userId);
      const updatedProvider = stripImageGenerationProviderConfig(
        refreshed.providerEntries,
      ).find((entry) => entry.provider === input.provider);

      return updatedProvider ?? null;
    }),
});
