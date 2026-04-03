import { approvalsRouter } from "@/server/api/routers/approvals";
import { appearanceRouter } from "@/server/api/routers/appearance";
import { backupRouter } from "@/server/api/routers/backup";
import { integrationsRouter } from "@/server/api/routers/integrations";
import { automationsRouter } from "@/server/api/routers/automations";
import { authRouter } from "@/server/api/routers/auth";
import { chatPreferencesRouter } from "@/server/api/routers/chat-preferences";
import { generalSettingsRouter } from "@/server/api/routers/general-settings";
import { imageSettingsRouter } from "@/server/api/routers/image-settings";
import { enginesRouter } from "@/server/api/routers/engines";
import { healthRouter } from "@/server/api/routers/health";
import { memoryRouter } from "@/server/api/routers/memory";
import { memorySettingsRouter } from "@/server/api/routers/memory-settings";
import { mcpServersRouter } from "@/server/api/routers/mcp-servers";
import { messagesRouter } from "@/server/api/routers/messages";
import { modelsRouter } from "@/server/api/routers/models";
import { planRouter } from "@/server/api/routers/plan";
import { personalizationRouter } from "@/server/api/routers/personalization";
import { providersRouter } from "@/server/api/routers/providers";
import { repoRouter } from "@/server/api/routers/repo";
import { searchProvidersRouter } from "@/server/api/routers/search-providers";
import { searchSettingsRouter } from "@/server/api/routers/search-settings";
import { securityRouter } from "@/server/api/routers/security";
import { skillsRouter } from "@/server/api/routers/skills";
import { shortcutsRouter } from "@/server/api/routers/shortcuts";
import { threadsRouter } from "@/server/api/routers/threads";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { videoSettingsRouter } from "@/server/api/routers/video-settings";
import { workspaceFilesRouter } from "@/server/api/routers/workspace-files";
import { workspacesRouter } from "@/server/api/routers/workspaces";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  approvals: approvalsRouter,
  appearance: appearanceRouter,
  backup: backupRouter,
  auth: authRouter,
  automations: automationsRouter,
  chatPreferences: chatPreferencesRouter,
  engines: enginesRouter,
  generalSettings: generalSettingsRouter,
  imageSettings: imageSettingsRouter,
  health: healthRouter,
  integrations: integrationsRouter,
  memory: memoryRouter,
  memorySettings: memorySettingsRouter,
  mcpServers: mcpServersRouter,
  messages: messagesRouter,
  models: modelsRouter,
  plan: planRouter,
  personalization: personalizationRouter,
  providers: providersRouter,
  repo: repoRouter,
  searchProviders: searchProvidersRouter,
  searchSettings: searchSettingsRouter,
  security: securityRouter,
  skills: skillsRouter,
  shortcuts: shortcutsRouter,
  threads: threadsRouter,
  videoSettings: videoSettingsRouter,
  workspaceFiles: workspaceFilesRouter,
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
