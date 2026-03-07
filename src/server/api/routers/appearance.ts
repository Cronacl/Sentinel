import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { appearanceFormSchema } from "@/schemas/appearance.schema";

export const appearanceRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { themePreference: true },
    });

    return {
      themePreference: user?.themePreference ?? "system",
    };
  }),

  update: protectedProcedure
    .input(appearanceFormSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { themePreference: input.themePreference },
        select: { themePreference: true },
      });

      return {
        themePreference: user.themePreference,
      };
    }),
});
