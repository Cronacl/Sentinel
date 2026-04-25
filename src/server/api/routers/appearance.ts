import { eq } from "drizzle-orm";

import {
  DEFAULT_APPEARANCE_SETTINGS,
  sanitizeAppearanceSettings,
} from "@/lib/appearance";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { appearanceFormSchema } from "@/schemas/appearance.schema";
import { users } from "@/server/db/schema";

export const appearanceRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        accentColor: true,
        codeFontFamily: true,
        codeFontSize: true,
        codeTheme: true,
        themePreference: true,
        uiFontFamily: true,
        uiFontSize: true,
      },
    });

    return sanitizeAppearanceSettings({
      accentColor: user?.accentColor ?? DEFAULT_APPEARANCE_SETTINGS.accentColor,
      codeFontFamily:
        user?.codeFontFamily ?? DEFAULT_APPEARANCE_SETTINGS.codeFontFamily,
      codeFontSize:
        user?.codeFontSize ?? DEFAULT_APPEARANCE_SETTINGS.codeFontSize,
      codeTheme:
        (user?.codeTheme as typeof DEFAULT_APPEARANCE_SETTINGS.codeTheme) ??
        DEFAULT_APPEARANCE_SETTINGS.codeTheme,
      themePreference:
        user?.themePreference ?? DEFAULT_APPEARANCE_SETTINGS.themePreference,
      uiFontFamily:
        user?.uiFontFamily ?? DEFAULT_APPEARANCE_SETTINGS.uiFontFamily,
      uiFontSize: user?.uiFontSize ?? DEFAULT_APPEARANCE_SETTINGS.uiFontSize,
    });
  }),

  update: protectedProcedure
    .input(appearanceFormSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          accentColor: input.accentColor,
          codeFontFamily: input.codeFontFamily,
          codeFontSize: input.codeFontSize,
          codeTheme: input.codeTheme,
          themePreference: input.themePreference,
          uiFontFamily: input.uiFontFamily,
          uiFontSize: input.uiFontSize,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return sanitizeAppearanceSettings({
        accentColor: input.accentColor,
        codeFontFamily: input.codeFontFamily,
        codeFontSize: input.codeFontSize,
        codeTheme: input.codeTheme,
        themePreference: input.themePreference,
        uiFontFamily: input.uiFontFamily,
        uiFontSize: input.uiFontSize,
      });
    }),
});
