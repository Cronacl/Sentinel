import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => {
    return {
      createdAt: ctx.user.createdAt,
      email: ctx.user.email,
      id: ctx.user.id,
      image: ctx.user.image,
      name: ctx.user.name,
      updatedAt: ctx.user.updatedAt,
    };
  }),
});
