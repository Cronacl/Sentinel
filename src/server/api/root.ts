import { approvalsRouter } from "@/server/api/routers/approvals";
import { appearanceRouter } from "@/server/api/routers/appearance";
import { authRouter } from "@/server/api/routers/auth";
import { chatPreferencesRouter } from "@/server/api/routers/chat-preferences";
import { generalSettingsRouter } from "@/server/api/routers/general-settings";
import { healthRouter } from "@/server/api/routers/health";
import { memoryRouter } from "@/server/api/routers/memory";
import { memorySettingsRouter } from "@/server/api/routers/memory-settings";
import { mcpServersRouter } from "@/server/api/routers/mcp-servers";
import { messagesRouter } from "@/server/api/routers/messages";
import { modelsRouter } from "@/server/api/routers/models";
import { planRouter } from "@/server/api/routers/plan";
import { personalizationRouter } from "@/server/api/routers/personalization";
import { providersRouter } from "@/server/api/routers/providers";
import { searchProvidersRouter } from "@/server/api/routers/search-providers";
import { searchSettingsRouter } from "@/server/api/routers/search-settings";
import { securityRouter } from "@/server/api/routers/security";
import { threadsRouter } from "@/server/api/routers/threads";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { workspacesRouter } from "@/server/api/routers/workspaces";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  approvals: approvalsRouter,
  appearance: appearanceRouter,
  auth: authRouter,
  chatPreferences: chatPreferencesRouter,
  generalSettings: generalSettingsRouter,
  health: healthRouter,
  memory: memoryRouter,
  memorySettings: memorySettingsRouter,
  mcpServers: mcpServersRouter,
  messages: messagesRouter,
  models: modelsRouter,
  plan: planRouter,
  personalization: personalizationRouter,
  providers: providersRouter,
  searchProviders: searchProvidersRouter,
  searchSettings: searchSettingsRouter,
  security: securityRouter,
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
