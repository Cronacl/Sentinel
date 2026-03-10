import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";
import {
  PROVIDER_CONFIG_SCHEMAS,
  validateProviderConfig,
} from "@/lib/ai/config-schemas";
import { decrypt, encrypt } from "@/lib/ai/encrypt";
import { PROVIDER_LIST } from "@/lib/ai/providers";
import { modelPreferences, providerCredentials } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const aiProviderEnum = z.enum([
  "openai",
  "anthropic",
  "google",
  "google_vertex",
]);

export const providersRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const credentials = await ctx.db.query.providerCredentials.findMany({
      where: eq(providerCredentials.userId, userId),
      columns: { provider: true, isEnabled: true },
    });

    const credentialMap = new Map(
      credentials.map((c) => [c.provider, c.isEnabled]),
    );

    return PROVIDER_LIST.map((provider) => {
      const isEnabled = credentialMap.get(provider.id);
      return {
        ...provider,
        status:
          isEnabled === undefined
            ? ("not_configured" as const)
            : isEnabled
              ? ("active" as const)
              : ("disabled" as const),
      };
    });
  }),

  get: protectedProcedure
    .input(z.object({ provider: aiProviderEnum }))
    .query(async ({ ctx, input }) => {
      const credential = await ctx.db.query.providerCredentials.findFirst({
        where: and(
          eq(providerCredentials.userId, ctx.session.user.id),
          eq(providerCredentials.provider, input.provider),
        ),
      });

      if (!credential) return null;

      const config = JSON.parse(decrypt(credential.encryptedConfig)) as Record<
        string,
        unknown
      >;

      return {
        provider: credential.provider,
        isEnabled: credential.isEnabled,
        config,
      };
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        config: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const schema = PROVIDER_CONFIG_SCHEMAS[input.provider as AIProvider];
      if (!schema) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown provider: ${input.provider}`,
        });
      }

      const validated = validateProviderConfig(
        input.provider as AIProvider,
        input.config,
      );
      const encryptedConfig = encrypt(JSON.stringify(validated));
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.providerCredentials.findFirst({
        where: and(
          eq(providerCredentials.userId, userId),
          eq(providerCredentials.provider, input.provider),
        ),
        columns: { id: true },
      });

      if (existing) {
        ctx.db
          .update(providerCredentials)
          .set({ encryptedConfig, isEnabled: true })
          .where(eq(providerCredentials.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(providerCredentials)
          .values({
            userId,
            provider: input.provider,
            encryptedConfig,
          })
          .run();
      }

      return { provider: input.provider, isEnabled: true };
    }),

  delete: protectedProcedure
    .input(z.object({ provider: aiProviderEnum }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      ctx.db.transaction((tx) => {
        tx.delete(modelPreferences)
          .where(
            and(
              eq(modelPreferences.userId, userId),
              eq(modelPreferences.provider, input.provider),
            ),
          )
          .run();

        tx.delete(providerCredentials)
          .where(
            and(
              eq(providerCredentials.userId, userId),
              eq(providerCredentials.provider, input.provider),
            ),
          )
          .run();
      });

      return { success: true };
    }),

  toggle: protectedProcedure
    .input(
      z.object({
        provider: aiProviderEnum,
        isEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db.query.providerCredentials.findFirst({
        where: and(
          eq(providerCredentials.userId, userId),
          eq(providerCredentials.provider, input.provider),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Provider not found.",
        });
      }

      ctx.db
        .update(providerCredentials)
        .set({ isEnabled: input.isEnabled })
        .where(eq(providerCredentials.id, existing.id))
        .run();

      return { provider: input.provider, isEnabled: input.isEnabled };
    }),
});
