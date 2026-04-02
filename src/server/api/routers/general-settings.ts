import { eq } from "drizzle-orm";

import {
  DEFAULT_WEBFETCH_BATCH_ENABLED,
  DEFAULT_WEBFETCH_BATCH_LIMIT,
} from "@/lib/webfetch";
import {
  DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED,
  DEFAULT_CONTEXT_COMPACTION_ENABLED,
  DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
  DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
  DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
  DEFAULT_FOLLOW_UP_BEHAVIOR,
  generalSettingsFormSchema,
} from "@/schemas/general-settings.schema";
import { users } from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const generalSettingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        contextCompactionEnabled: true,
        contextCompactionFixedWindowSize: true,
        contextCompactionUseFixedWindow: true,
        contextCompactionWindowPercent: true,
        followUpBehavior: true,
        persistBrowserSession: true,
        webFetchBatchEnabled: true,
        webFetchBatchLimit: true,
        skillsBasePath: true,
      },
    });

    return {
      persistBrowserSession:
        user?.persistBrowserSession ??
        DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED,
      contextCompactionEnabled:
        user?.contextCompactionEnabled ?? DEFAULT_CONTEXT_COMPACTION_ENABLED,
      contextCompactionFixedWindowSize:
        user?.contextCompactionFixedWindowSize ??
        DEFAULT_FIXED_CONTEXT_WINDOW_SIZE,
      contextCompactionUseFixedWindow:
        user?.contextCompactionUseFixedWindow ??
        DEFAULT_CONTEXT_COMPACTION_USE_FIXED_WINDOW,
      contextCompactionWindowPercent:
        user?.contextCompactionWindowPercent ??
        DEFAULT_CONTEXT_COMPACTION_WINDOW_PERCENT,
      followUpBehavior: user?.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR,
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
          contextCompactionEnabled: input.contextCompactionEnabled,
          contextCompactionFixedWindowSize:
            input.contextCompactionFixedWindowSize,
          contextCompactionUseFixedWindow:
            input.contextCompactionUseFixedWindow,
          contextCompactionWindowPercent: input.contextCompactionWindowPercent,
          followUpBehavior: input.followUpBehavior,
          persistBrowserSession: input.persistBrowserSession,
          webFetchBatchEnabled: input.webFetchBatchEnabled,
          webFetchBatchLimit: input.webFetchBatchLimit,
          skillsBasePath: input.skillsBasePath,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        persistBrowserSession: input.persistBrowserSession,
        contextCompactionEnabled: input.contextCompactionEnabled,
        contextCompactionFixedWindowSize:
          input.contextCompactionFixedWindowSize,
        contextCompactionUseFixedWindow: input.contextCompactionUseFixedWindow,
        contextCompactionWindowPercent: input.contextCompactionWindowPercent,
        followUpBehavior: input.followUpBehavior,
        webFetchBatchEnabled: input.webFetchBatchEnabled,
        webFetchBatchLimit: input.webFetchBatchLimit,
        skillsBasePath: input.skillsBasePath,
      };
    }),
});
