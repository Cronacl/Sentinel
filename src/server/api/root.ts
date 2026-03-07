import { authRouter } from "@/server/api/routers/auth";
import { healthRouter } from "@/server/api/routers/health";
import { modelsRouter } from "@/server/api/routers/models";
import { personalizationRouter } from "@/server/api/routers/personalization";
import { providersRouter } from "@/server/api/routers/providers";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  health: healthRouter,
  models: modelsRouter,
  personalization: personalizationRouter,
  providers: providersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.health.status();
 *       ^? { name: string; ok: boolean; timestamp: string }
 */
export const createCaller = createCallerFactory(appRouter);
