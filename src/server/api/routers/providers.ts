import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AIProvider } from "@/../generated/prisma";
import {
  PROVIDER_CONFIG_SCHEMAS,
  validateProviderConfig,
} from "@/lib/ai/config-schemas";
import { decrypt, encrypt } from "@/lib/ai/encrypt";
import { PROVIDER_LIST } from "@/lib/ai/providers";
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

    const credentials = await ctx.db.providerCredential.findMany({
      where: { userId },
      select: { provider: true, isEnabled: true },
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
      const credential = await ctx.db.providerCredential.findUnique({
        where: {
          userId_provider: {
            userId: ctx.session.user.id,
            provider: input.provider,
          },
        },
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

      return ctx.db.providerCredential.upsert({
        where: {
          userId_provider: {
            userId: ctx.session.user.id,
            provider: input.provider,
          },
        },
        create: {
          userId: ctx.session.user.id,
          provider: input.provider,
          encryptedConfig,
        },
        update: {
          encryptedConfig,
          isEnabled: true,
        },
        select: { provider: true, isEnabled: true },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ provider: aiProviderEnum }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db.$transaction([
        ctx.db.modelPreference.deleteMany({
          where: { userId, provider: input.provider },
        }),
        ctx.db.providerCredential.delete({
          where: {
            userId_provider: { userId, provider: input.provider },
          },
        }),
      ]);

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
      return ctx.db.providerCredential.update({
        where: {
          userId_provider: {
            userId: ctx.session.user.id,
            provider: input.provider,
          },
        },
        data: { isEnabled: input.isEnabled },
        select: { provider: true, isEnabled: true },
      });
    }),
});
