import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { appearanceFormSchema } from "@/schemas/appearance.schema";
import { users } from "@/server/db/schema";

export const appearanceRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: { themePreference: true },
    });

    return {
      themePreference: user?.themePreference ?? "system",
    };
  }),

  update: protectedProcedure
    .input(appearanceFormSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({ themePreference: input.themePreference })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        themePreference: input.themePreference,
      };
    }),
});
