import { eq } from "drizzle-orm";

import {
  DEFAULT_WEBFETCH_BATCH_ENABLED,
  DEFAULT_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";
import { generalSettingsFormSchema } from "@/schemas/general-settings.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const generalSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        webFetchBatchEnabled: true,
        webFetchBatchLimit: true,
        skillsBasePath: true,
      },
    });

    return {
      webFetchBatchEnabled:
        user?.webFetchBatchEnabled ?? DEFAULT_WEBFETCH_BATCH_ENABLED,
      webFetchBatchLimit:
        user?.webFetchBatchLimit ?? DEFAULT_WEBFETCH_BATCH_LIMIT,
      skillsBasePath: user?.skillsBasePath ?? null,
    };
  }),

  update: protectedProcedure
    .input(generalSettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          webFetchBatchEnabled: input.webFetchBatchEnabled,
          webFetchBatchLimit: input.webFetchBatchLimit,
          skillsBasePath: input.skillsBasePath,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        webFetchBatchEnabled: input.webFetchBatchEnabled,
        webFetchBatchLimit: input.webFetchBatchLimit,
        skillsBasePath: input.skillsBasePath,
      };
    }),
});
