import { eq } from "drizzle-orm";

import {
  DEFAULT_SEARCH_MAX_RESULT_COUNT,
  DEFAULT_SEARCH_PROVIDER,
  DEFAULT_SEARCH_RESULT_COUNT,
  normalizeSearchSettings,
} from "@/lib/search";
import { searchSettingsFormSchema } from "@/schemas/search-settings.schema";
import { searchSettings } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const searchSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.searchSettings.findFirst({
      where: eq(searchSettings.userId, ctx.session.user.id),
      columns: {
        defaultProvider: true,
        defaultResultCount: true,
        maxResultCount: true,
      },
    });

    return normalizeSearchSettings(row ?? null);
  }),

  update: protectedProcedure
    .input(searchSettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = await ctx.db.query.searchSettings.findFirst({
        where: eq(searchSettings.userId, userId),
        columns: { id: true },
      });

      if (existing) {
        ctx.db
          .update(searchSettings)
          .set(input)
          .where(eq(searchSettings.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(searchSettings)
          .values({
            defaultProvider: input.defaultProvider ?? DEFAULT_SEARCH_PROVIDER,
            defaultResultCount:
              input.defaultResultCount ?? DEFAULT_SEARCH_RESULT_COUNT,
            maxResultCount:
              input.maxResultCount ?? DEFAULT_SEARCH_MAX_RESULT_COUNT,
            userId,
          })
          .run();
      }

      return normalizeSearchSettings(input);
    }),
});
