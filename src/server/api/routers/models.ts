import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";
import {
  MODEL_CATALOG,
  getModelsForProvider,
  isKnownModel,
} from "@/lib/ai/providers/models";
import { modelPreferences, providerCredentials } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const aiProviderEnum = z.enum([
  "openai",
  "anthropic",
  "google",
  "google_vertex",
]);

export const modelsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          provider: aiProviderEnum.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const connectedProviders =
        await ctx.db.query.providerCredentials.findMany({
          where: and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.isEnabled, true),
          ),
          columns: { provider: true },
        });

      const connectedSet = new Set(connectedProviders.map((p) => p.provider));

      const preferences = await ctx.db.query.modelPreferences.findMany({
        where: eq(modelPreferences.userId, userId),
      });

      const prefMap = new Map(
        preferences.map((p) => [`${p.provider}:${p.modelId}`, p]),
      );

      const targetProviders = input?.provider
        ? [input.provider as AIProvider]
        : (Object.keys(MODEL_CATALOG) as AIProvider[]);

      const models = targetProviders.flatMap((provider) => {
        const builtIn = getModelsForProvider(provider).map((model) => {
          const pref = prefMap.get(`${provider}:${model.id}`);
          return {
            provider,
            modelId: model.id,
            displayName: model.displayName,
            description: model.description,
            capabilities: model.capabilities,
            contextWindow: model.contextWindow,
            isCustom: false,
            isEnabled: pref?.isEnabled ?? true,
            isConnected: connectedSet.has(provider),
          };
        });

        const customModels = preferences
          .filter(
            (p) =>
              p.provider === provider &&
              p.isCustom &&
              !isKnownModel(provider, p.modelId),
          )
          .map((p) => ({
            provider: p.provider,
            modelId: p.modelId,
            displayName: p.modelId,
            description: "Custom model",
            capabilities: [] as string[],
            contextWindow: undefined as number | undefined,
            isCustom: true,
            isEnabled: p.isEnabled,
            isConnected: connectedSet.has(provider),
          }));

        return [...builtIn, ...customModels];
      });

      return models;
    }),

  enable: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.modelPreferences.findFirst({
        where: and(
          eq(modelPreferences.userId, userId),
          eq(modelPreferences.provider, input.provider),
          eq(modelPreferences.modelId, input.modelId),
        ),
      });

      if (existing) {
        ctx.db
          .update(modelPreferences)
          .set({ isEnabled: true })
          .where(eq(modelPreferences.id, existing.id))
          .run();
        return {
          provider: input.provider,
          modelId: input.modelId,
          isEnabled: true,
        };
      }

      ctx.db
        .insert(modelPreferences)
        .values({
          userId,
          provider: input.provider,
          modelId: input.modelId,
          isEnabled: true,
        })
        .run();

      return {
        provider: input.provider,
        modelId: input.modelId,
        isEnabled: true,
      };
    }),

  disable: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.modelPreferences.findFirst({
        where: and(
          eq(modelPreferences.userId, userId),
          eq(modelPreferences.provider, input.provider),
          eq(modelPreferences.modelId, input.modelId),
        ),
      });

      if (existing) {
        ctx.db
          .update(modelPreferences)
          .set({ isEnabled: false })
          .where(eq(modelPreferences.id, existing.id))
          .run();
        return {
          provider: input.provider,
          modelId: input.modelId,
          isEnabled: false,
        };
      }

      ctx.db
        .insert(modelPreferences)
        .values({
          userId,
          provider: input.provider,
          modelId: input.modelId,
          isEnabled: false,
        })
        .run();

      return {
        provider: input.provider,
        modelId: input.modelId,
        isEnabled: false,
      };
    }),

  addCustom: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const credential = await ctx.db.query.providerCredentials.findFirst({
        where: and(
          eq(providerCredentials.userId, userId),
          eq(providerCredentials.provider, input.provider),
        ),
        columns: { isEnabled: true },
      });

      if (!credential?.isEnabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Provider "${input.provider}" must be connected and enabled to add custom models.`,
        });
      }

      const [created] = ctx.db
        .insert(modelPreferences)
        .values({
          userId,
          provider: input.provider,
          modelId: input.modelId,
          isCustom: true,
          isEnabled: true,
        })
        .returning({
          provider: modelPreferences.provider,
          modelId: modelPreferences.modelId,
          isCustom: modelPreferences.isCustom,
          isEnabled: modelPreferences.isEnabled,
        })
        .all();

      return created!;
    }),

  removeCustom: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const pref = await ctx.db.query.modelPreferences.findFirst({
        where: and(
          eq(modelPreferences.userId, userId),
          eq(modelPreferences.provider, input.provider),
          eq(modelPreferences.modelId, input.modelId),
        ),
        columns: { id: true, isCustom: true },
      });

      if (!pref?.isCustom) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only custom models can be removed.",
        });
      }

      ctx.db
        .delete(modelPreferences)
        .where(eq(modelPreferences.id, pref.id))
        .run();

      return { provider: input.provider, modelId: input.modelId };
    }),
});
