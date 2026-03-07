import { appearanceRouter } from "@/server/api/routers/appearance";
import { authRouter } from "@/server/api/routers/auth";
import { healthRouter } from "@/server/api/routers/health";
import { messagesRouter } from "@/server/api/routers/messages";
import { modelsRouter } from "@/server/api/routers/models";
import { personalizationRouter } from "@/server/api/routers/personalization";
import { providersRouter } from "@/server/api/routers/providers";
import { threadsRouter } from "@/server/api/routers/threads";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { workspacesRouter } from "@/server/api/routers/workspaces";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  appearance: appearanceRouter,
  auth: authRouter,
  health: healthRouter,
  messages: messagesRouter,
  models: modelsRouter,
  personalization: personalizationRouter,
  providers: providersRouter,
  threads: threadsRouter,
  workspaces: workspacesRouter,
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
