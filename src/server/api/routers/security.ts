import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { securitySettingsFormSchema } from "@/schemas/security.schema";
import { users } from "@/server/db/schema";

export const securityRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: { permissionMode: true },
    });

    return {
      permissionMode: user?.permissionMode ?? "default",
    };
  }),

  update: protectedProcedure
    .input(securitySettingsFormSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({ permissionMode: input.permissionMode })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        permissionMode: input.permissionMode,
      };
    }),
});
