import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const healthRouter = createTRPCRouter({
  status: publicProcedure.query(() => {
    return {
      name: "sentinel",
      ok: true,
      timestamp: new Date().toISOString(),
    };
  }),
});
