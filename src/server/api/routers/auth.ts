import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const authRouter = createTRPCRouter({
	me: protectedProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
});
