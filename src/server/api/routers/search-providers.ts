import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { encrypt } from "@/lib/ai/providers/encrypt";
import {
  parseStoredSearchProvider,
  type SearchProviderRuntimeEntry,
} from "@/lib/search/providers/runtime";
import { SEARCH_PROVIDER_LIST } from "@/lib/search/providers/registry";
import {
  validateSearchProviderConfig,
  validateSearchProviderSettings,
} from "@/lib/search/providers/config-schemas";
import {
  searchProviderDeleteSchema,
  searchProviderGetSchema,
  searchProviderToggleSchema,
  searchProviderUpsertSchema,
} from "@/schemas/search-provider.schema";
import { searchProviderConfigs } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function toSearchProviderResponse(
  provider: SearchProviderRuntimeEntry<"exa"> | SearchProviderRuntimeEntry<any>,
) {
  return {
    config: provider.config,
    isEnabled: provider.isEnabled,
    provider: provider.provider,
    settings: provider.settings,
  };
}

export const searchProvidersRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.searchProviderConfigs.findMany({
      where: eq(searchProviderConfigs.userId, ctx.session.user.id),
      columns: { isEnabled: true, provider: true },
    });

    const statusMap = new Map(rows.map((row) => [row.provider, row.isEnabled]));

    return SEARCH_PROVIDER_LIST.map((provider) => {
      const isEnabled = statusMap.get(provider.id);

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
    .input(searchProviderGetSchema)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.searchProviderConfigs.findFirst({
        where: and(
          eq(searchProviderConfigs.userId, ctx.session.user.id),
          eq(searchProviderConfigs.provider, input.provider),
        ),
      });

      if (!row) {
        return null;
      }

      try {
        return toSearchProviderResponse(parseStoredSearchProvider(row));
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Search provider credentials could not be read.",
        });
      }
    }),

  upsert: protectedProcedure
    .input(searchProviderUpsertSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const config = validateSearchProviderConfig(input.provider, input.config);
      const settings = validateSearchProviderSettings(
        input.provider,
        input.settings,
      );
      const encryptedConfig = encrypt(JSON.stringify(config));
      const existing = await ctx.db.query.searchProviderConfigs.findFirst({
        where: and(
          eq(searchProviderConfigs.userId, userId),
          eq(searchProviderConfigs.provider, input.provider),
        ),
        columns: { id: true },
      });

      if (existing) {
        ctx.db
          .update(searchProviderConfigs)
          .set({
            encryptedConfig,
            isEnabled: input.isEnabled,
            settings,
          })
          .where(eq(searchProviderConfigs.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(searchProviderConfigs)
          .values({
            encryptedConfig,
            isEnabled: input.isEnabled,
            provider: input.provider,
            settings,
            userId,
          })
          .run();
      }

      return {
        config,
        isEnabled: input.isEnabled,
        provider: input.provider,
        settings,
      };
    }),

  delete: protectedProcedure
    .input(searchProviderDeleteSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .delete(searchProviderConfigs)
        .where(
          and(
            eq(searchProviderConfigs.userId, ctx.session.user.id),
            eq(searchProviderConfigs.provider, input.provider),
          ),
        )
        .run();

      return { success: true };
    }),

  toggle: protectedProcedure
    .input(searchProviderToggleSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.searchProviderConfigs.findFirst({
        where: and(
          eq(searchProviderConfigs.userId, ctx.session.user.id),
          eq(searchProviderConfigs.provider, input.provider),
        ),
        columns: { id: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Search provider not found.",
        });
      }

      ctx.db
        .update(searchProviderConfigs)
        .set({ isEnabled: input.isEnabled })
        .where(eq(searchProviderConfigs.id, existing.id))
        .run();

      return {
        isEnabled: input.isEnabled,
        provider: input.provider,
      };
    }),
});
