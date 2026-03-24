import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import { getCodexThreadState } from "@/lib/ai/chat/engines/types";
import {
  getDefaultReasoningEffort,
  getModelsForProvider,
  getSupportedReasoningEfforts,
  isKnownModel,
  MODEL_CATALOG,
} from "@/lib/ai/providers/models";
import { getCompositeModelId } from "@/lib/ai/providers/model-selection";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { AIProvider } from "@/server/db/enums";
import { CHAT_ENGINES } from "@/server/db/enums";
import { modelPreferences, providerCredentials } from "@/server/db/schema";
import { getOwnedThreadOrThrow } from "./workspace-thread-helpers";

const chatEngineSchema = z.enum(CHAT_ENGINES);

async function resolveCodexThreadId(
  ctx: Parameters<typeof getOwnedThreadOrThrow>[0],
  sentinelThreadId: string,
): Promise<string> {
  const thread = await getOwnedThreadOrThrow(ctx, sentinelThreadId);
  const state = getCodexThreadState(thread?.chatEngineState);
  if (!state?.codexThreadId) {
    throw new Error("This thread does not have an associated Codex thread.");
  }
  return state.codexThreadId;
}

export const enginesRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const codex = await getCodexAppServerManager().getStatus();

    return [
      {
        description:
          "Sentinel-managed runtime with plans, memory, and workspace tools.",
        engine: "sentinel" as const,
        error: null,
        isAvailable: true,
        label: "Sentinel",
      },
      {
        description: "Use the Codex CLI already configured on this machine.",
        engine: "codex" as const,
        error: codex.error,
        isAvailable:
          codex.cliDetected && codex.serverReachable && codex.authReady,
        label: "Codex",
        status: codex,
      },
    ];
  }),

  models: protectedProcedure
    .input(z.object({ engine: chatEngineSchema }))
    .query(async ({ ctx, input }) => {
      if (input.engine === "codex") {
        const status = await getCodexAppServerManager().getStatus();
        const isAvailable =
          status.cliDetected && status.serverReachable && status.authReady;

        return status.availableModels.map((model) => ({
          contextWindow: undefined as number | undefined,
          defaultReasoningEffort: model.defaultReasoningEffort,
          description: model.description,
          displayName: model.displayName,
          engine: "codex" as const,
          inputModalities: model.inputModalities,
          isConnected: isAvailable,
          isEnabled: true,
          modelId: model.id,
          provider: null,
          rawModelId: model.model,
          supportedReasoningEfforts: model.supportedReasoningEfforts.map(
            (option) => option.effort,
          ),
        }));
      }

      const userId = ctx.session.user.id;
      const connectedProviders =
        await ctx.db.query.providerCredentials.findMany({
          where: and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.isEnabled, true),
          ),
          columns: { provider: true },
        });
      const connectedSet = new Set(connectedProviders.map((p) => p.provider));

      const preferences = await ctx.db.query.modelPreferences.findMany({
        where: eq(modelPreferences.userId, userId),
      });
      const prefMap = new Map(
        preferences.map((p) => [`${p.provider}:${p.modelId}`, p]),
      );

      return (Object.keys(MODEL_CATALOG) as AIProvider[]).flatMap(
        (provider) => {
          const builtIn = getModelsForProvider(provider).map((model) => {
            const compositeId = getCompositeModelId(provider, model.id);
            const pref = prefMap.get(compositeId);

            return {
              contextWindow: model.contextWindow,
              defaultReasoningEffort: getDefaultReasoningEffort(
                provider,
                model.id,
              ),
              description: model.description,
              displayName: model.displayName,
              engine: "sentinel" as const,
              inputModalities: model.capabilities.includes("vision")
                ? ["text", "image"]
                : ["text"],
              isConnected: connectedSet.has(provider),
              isEnabled: pref?.isEnabled ?? true,
              modelId: compositeId,
              provider,
              rawModelId: model.id,
              supportedReasoningEfforts: getSupportedReasoningEfforts(
                provider,
                model.id,
              ),
            };
          });

          const customModels = preferences
            .filter(
              (preference) =>
                preference.provider === provider &&
                preference.isCustom &&
                !isKnownModel(provider, preference.modelId),
            )
            .map((preference) => ({
              contextWindow: undefined as number | undefined,
              defaultReasoningEffort: getDefaultReasoningEffort(
                provider,
                preference.modelId,
              ),
              description: "Custom model",
              displayName: preference.modelId,
              engine: "sentinel" as const,
              inputModalities: ["text"] as string[],
              isConnected: connectedSet.has(provider),
              isEnabled: preference.isEnabled,
              modelId: getCompositeModelId(provider, preference.modelId),
              provider,
              rawModelId: preference.modelId,
              supportedReasoningEfforts: getSupportedReasoningEfforts(
                provider,
                preference.modelId,
              ),
            }));

          return [...builtIn, ...customModels];
        },
      );
    }),

  codexReview: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      return codex.startReview(codexThreadId);
    }),

  codexRollback: protectedProcedure
    .input(z.object({ count: z.number().int().min(1), threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      return codex.rollbackThread(codexThreadId, input.count);
    }),

  codexCompact: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      return codex.compactThread(codexThreadId);
    }),

  codexFork: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      return codex.forkThread(codexThreadId);
    }),

  codexArchive: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      await codex.archiveThread(codexThreadId);
    }),

  codexUnarchive: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codexThreadId = await resolveCodexThreadId(ctx, input.threadId);
      const codex = getCodexAppServerManager();
      await codex.unarchiveThread(codexThreadId);
    }),

  codexLogin: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().optional(),
        method: z.enum(["apiKey", "chatgpt", "external"]),
        token: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const codex = getCodexAppServerManager();
      return codex.startLogin(input.method, {
        apiKey: input.apiKey,
        token: input.token,
      });
    }),

  codexCancelLogin: protectedProcedure.mutation(async () => {
    const codex = getCodexAppServerManager();
    await codex.cancelLogin();
  }),

  codexLogout: protectedProcedure.mutation(async () => {
    const codex = getCodexAppServerManager();
    await codex.logout();
  }),

  codexRateLimits: protectedProcedure.query(async () => {
    const codex = getCodexAppServerManager();
    return codex.readRateLimits();
  }),

  codexConfig: protectedProcedure.query(async () => {
    const codex = getCodexAppServerManager();
    return codex.readConfig();
  }),

  codexWriteConfig: protectedProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ input }) => {
      const codex = getCodexAppServerManager();
      return codex.writeConfigValue(input.key, input.value);
    }),

  codexSkills: protectedProcedure.query(async () => {
    const codex = getCodexAppServerManager();
    return codex.listSkills();
  }),

  codexWriteSkillConfig: protectedProcedure
    .input(z.object({ enabled: z.boolean(), skillId: z.string() }))
    .mutation(async ({ input }) => {
      const codex = getCodexAppServerManager();
      return codex.writeSkillConfig(input.skillId, input.enabled);
    }),

  codexMcpServers: protectedProcedure.query(async () => {
    const codex = getCodexAppServerManager();
    return codex.listMcpServerStatus();
  }),

  codexReloadMcpServer: protectedProcedure
    .input(z.object({ serverName: z.string() }))
    .mutation(async ({ input }) => {
      const codex = getCodexAppServerManager();
      await codex.reloadMcpServer(input.serverName);
    }),

  codexExperimentalFeatures: protectedProcedure.query(async () => {
    const codex = getCodexAppServerManager();
    return codex.listExperimentalFeatures();
  }),
});
