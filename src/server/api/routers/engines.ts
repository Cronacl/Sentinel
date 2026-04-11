import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  type ClaudeEngineStatus,
  getClaudeEngineStatus,
  isClaudeEngineAvailable,
  resetClaudeCodeRuntimeCache,
  resetClaudeEngineStatusCache,
} from "@/lib/ai/chat/engines/claude-sdk";
import {
  type CopilotEngineStatus,
  getCopilotEngineStatus,
  isCopilotEngineAvailable,
  resetCopilotEngineStatusCache,
  resetCopilotRuntimeCache,
} from "@/lib/ai/chat/engines/copilot-sdk";
import {
  type CodexEngineStatus,
  getCodexAppServerManager,
  resetCodexEngineStatusCache,
} from "@/lib/ai/chat/engines/codex-app-server";
import { resetCodexCliResolutionCache } from "@/lib/ai/chat/engines/codex-cli";
import { getCodexThreadState } from "@/lib/ai/chat/engines/types";
import {
  getDefaultReasoningEffort,
  getModelsForProvider,
  getSupportedReasoningEfforts,
  isKnownModel,
  MODEL_CATALOG,
  type ReasoningEffort,
} from "@/lib/ai/providers/models";
import { getCompositeModelId } from "@/lib/ai/providers/model-selection";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { AIProvider, ChatEngine } from "@/server/db/enums";
import { CHAT_ENGINES } from "@/server/db/enums";
import { modelPreferences, providerCredentials } from "@/server/db/schema";
import { getOwnedThreadOrThrow } from "./workspace-thread-helpers";

const chatEngineSchema = z.enum(CHAT_ENGINES);
const runtimeEngineSchema = z.enum(["codex", "claude", "copilot"]);

function isCodexEngineAvailable(status: CodexEngineStatus) {
  return status.state === "ready" || status.state === "timeout_no_cache";
}

function canUseCodexFallbackModels(status: CodexEngineStatus) {
  return (
    status.state === "timeout_no_cache" &&
    status.availableModels.length === 0 &&
    status.cliDetected
  );
}

function buildFallbackCodexModels() {
  const allowedIds = new Set([
    "gpt-5-codex",
    "gpt-5.1-codex-mini",
    "codex-mini-latest",
  ]);

  return getModelsForProvider("openai")
    .filter((model) => allowedIds.has(model.id))
    .map((model) => ({
      defaultReasoningEffort: getDefaultReasoningEffort("openai", model.id),
      description: model.description,
      displayName: model.displayName,
      id: model.id,
      inputModalities: model.capabilities.includes("vision")
        ? ["text", "image"]
        : ["text"],
      isDefault: model.id === "gpt-5-codex",
      model: model.id,
      supportedReasoningEfforts: getSupportedReasoningEfforts(
        "openai",
        model.id,
      ).map((effort) => ({
        description: `${model.displayName} supports ${effort} reasoning effort.`,
        effort,
        label: effort[0]!.toUpperCase() + effort.slice(1),
      })),
      supportsPersonality: false,
    }));
}

function canUseClaudeFallbackModels(status: ClaudeEngineStatus) {
  return (
    status.binaryDetected &&
    status.state === "timeout_no_cache" &&
    status.availableModels.length === 0
  );
}

function canUseCopilotFallbackModels(status: CopilotEngineStatus) {
  return (
    status.authReady &&
    status.cliDetected &&
    status.state === "timeout_no_cache" &&
    status.availableModels.length === 0
  );
}

function shouldExposeRuntimeModels(options: {
  availableModelsCount: number;
  isAvailable: boolean;
}) {
  return options.isAvailable || options.availableModelsCount > 0;
}

function buildFallbackClaudeModels() {
  return getModelsForProvider("anthropic").map((model) => ({
    contextWindow: model.contextWindow,
    defaultReasoningEffort: getDefaultReasoningEffort("anthropic", model.id),
    description: model.description,
    displayName: model.displayName,
    id: model.id,
    inputModalities: model.capabilities.includes("vision")
      ? ["text", "image"]
      : ["text"],
    isDefault: model.id === "claude-sonnet-4-5",
    model: model.id,
    supportedReasoningEfforts: getSupportedReasoningEfforts(
      "anthropic",
      model.id,
    ).map((effort) => ({
      description: `${model.displayName} supports ${effort} reasoning effort.`,
      effort,
      label: effort[0]!.toUpperCase() + effort.slice(1),
    })),
  }));
}

function buildFallbackCopilotModels() {
  return [
    {
      contextWindow: undefined,
      defaultReasoningEffort: "medium" as const,
      description: "Default GitHub Copilot coding model.",
      displayName: "GPT-4.1",
      id: "gpt-4.1-preview",
      inputModalities: ["text"] as string[],
      isDefault: true,
      model: "gpt-4.1-preview",
      supportedReasoningEfforts: (["low", "medium", "high"] as const).map(
        (effort) => ({
          description: `GPT-4.1 supports ${effort} reasoning effort.`,
          effort,
          label: effort[0]!.toUpperCase() + effort.slice(1),
        }),
      ),
    },
  ] satisfies CopilotEngineStatus["availableModels"];
}

type EngineModelResult = {
  contextWindow?: number;
  defaultReasoningEffort: ReasoningEffort | null;
  description: string;
  displayName: string;
  engine: ChatEngine;
  inputModalities: string[];
  isConnected: boolean;
  isEnabled: boolean;
  modelId: string;
  provider: AIProvider | null;
  rawModelId: string;
  supportedReasoningEfforts: ReasoningEffort[];
};

function toEngineModelResult(input: EngineModelResult) {
  return input;
}

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

function createRuntimeStatusResolver(options?: { forceRefresh?: boolean }) {
  let codexPromise: Promise<CodexEngineStatus> | null = null;
  let claudePromise: Promise<ClaudeEngineStatus> | null = null;
  let copilotPromise: Promise<CopilotEngineStatus> | null = null;

  return {
    all: async () => {
      const [codex, claude, copilot] = await Promise.all([
        codexPromise ??
          (codexPromise = getCodexAppServerManager().getStatus(options)),
        claudePromise ?? (claudePromise = getClaudeEngineStatus(options)),
        copilotPromise ?? (copilotPromise = getCopilotEngineStatus(options)),
      ]);

      return { claude, codex, copilot };
    },
    claude: async () => {
      claudePromise ??= getClaudeEngineStatus(options);
      return await claudePromise;
    },
    copilot: async () => {
      copilotPromise ??= getCopilotEngineStatus(options);
      return await copilotPromise;
    },
    codex: async () => {
      codexPromise ??= getCodexAppServerManager().getStatus(options);
      return await codexPromise;
    },
  };
}

export const enginesRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    const runtimeStatuses = createRuntimeStatusResolver();
    const { codex, claude, copilot } = await runtimeStatuses.all();

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
        isAvailable: isCodexEngineAvailable(codex),
        label: "Codex",
        status: codex,
      },
      {
        description: "Use the locally configured Claude Code SDK runtime.",
        engine: "claude" as const,
        error: claude.error,
        isAvailable: isClaudeEngineAvailable(claude),
        label: "Claude",
        status: claude,
      },
      {
        description: "Use the locally configured GitHub Copilot SDK runtime.",
        engine: "copilot" as const,
        error: copilot.error,
        isAvailable: isCopilotEngineAvailable(copilot),
        label: "Copilot",
        status: copilot,
      },
    ];
  }),

  models: protectedProcedure
    .input(z.object({ engine: chatEngineSchema }))
    .query(async ({ ctx, input }) => {
      const runtimeStatuses = createRuntimeStatusResolver();

      if (input.engine === "codex") {
        const status = await runtimeStatuses.codex();
        const models = canUseCodexFallbackModels(status)
          ? buildFallbackCodexModels()
          : status.availableModels;
        const isConnected = shouldExposeRuntimeModels({
          availableModelsCount: models.length,
          isAvailable: isCodexEngineAvailable(status),
        });

        return models.map((model) =>
          toEngineModelResult({
            contextWindow: undefined,
            defaultReasoningEffort: model.defaultReasoningEffort,
            description: model.description,
            displayName: model.displayName,
            engine: "codex",
            inputModalities: model.inputModalities,
            isConnected,
            isEnabled: true,
            modelId: model.id,
            provider: null,
            rawModelId: model.model,
            supportedReasoningEfforts: model.supportedReasoningEfforts.map(
              (option) => option.effort,
            ),
          }),
        );
      }

      if (input.engine === "claude") {
        const status = await runtimeStatuses.claude();
        const models = canUseClaudeFallbackModels(status)
          ? buildFallbackClaudeModels()
          : status.availableModels;
        const isConnected = shouldExposeRuntimeModels({
          availableModelsCount: models.length,
          isAvailable: isClaudeEngineAvailable(status),
        });

        return models.map((model) =>
          toEngineModelResult({
            contextWindow: model.contextWindow,
            defaultReasoningEffort: model.defaultReasoningEffort,
            description: model.description,
            displayName: model.displayName,
            engine: "claude",
            inputModalities: model.inputModalities,
            isConnected,
            isEnabled: true,
            modelId: model.id,
            provider: null,
            rawModelId: model.model,
            supportedReasoningEfforts: model.supportedReasoningEfforts.map(
              (option) => option.effort,
            ),
          }),
        );
      }

      if (input.engine === "copilot") {
        const status = await runtimeStatuses.copilot();
        const models = canUseCopilotFallbackModels(status)
          ? buildFallbackCopilotModels()
          : status.availableModels;
        const isConnected = shouldExposeRuntimeModels({
          availableModelsCount: models.length,
          isAvailable: isCopilotEngineAvailable(status),
        });

        return models.map((model) =>
          toEngineModelResult({
            contextWindow: model.contextWindow,
            defaultReasoningEffort: model.defaultReasoningEffort,
            description: model.description,
            displayName: model.displayName,
            engine: "copilot",
            inputModalities: model.inputModalities,
            isConnected,
            isEnabled: true,
            modelId: model.id,
            provider: null,
            rawModelId: model.model,
            supportedReasoningEfforts: model.supportedReasoningEfforts.map(
              (option) => option.effort,
            ),
          }),
        );
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

            return toEngineModelResult({
              contextWindow: model.contextWindow,
              defaultReasoningEffort: getDefaultReasoningEffort(
                provider,
                model.id,
              ),
              description: model.description,
              displayName: model.displayName,
              engine: "sentinel",
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
            });
          });

          const customModels = preferences
            .filter(
              (preference) =>
                preference.provider === provider &&
                preference.isCustom &&
                !isKnownModel(provider, preference.modelId),
            )
            .map((preference) =>
              toEngineModelResult({
                contextWindow: undefined,
                defaultReasoningEffort: getDefaultReasoningEffort(
                  provider,
                  preference.modelId,
                ),
                description: "Custom model",
                displayName: preference.modelId,
                engine: "sentinel",
                inputModalities: ["text"],
                isConnected: connectedSet.has(provider),
                isEnabled: preference.isEnabled,
                modelId: getCompositeModelId(provider, preference.modelId),
                provider,
                rawModelId: preference.modelId,
                supportedReasoningEfforts: getSupportedReasoningEfforts(
                  provider,
                  preference.modelId,
                ),
              }),
            );

          return [...builtIn, ...customModels];
        },
      );
    }),

  refreshStatus: protectedProcedure
    .input(z.object({ engine: runtimeEngineSchema }))
    .mutation(async ({ input }) => {
      const runtimeStatuses = createRuntimeStatusResolver({
        forceRefresh: true,
      });

      if (input.engine === "codex") {
        resetCodexCliResolutionCache();
        resetCodexEngineStatusCache();
        const status = await runtimeStatuses.codex();

        return {
          engine: "codex" as const,
          status,
        };
      }

      if (input.engine === "copilot") {
        resetCopilotRuntimeCache();
        resetCopilotEngineStatusCache();
        const status = await runtimeStatuses.copilot();

        return {
          engine: "copilot" as const,
          status,
        };
      }

      resetClaudeCodeRuntimeCache();
      resetClaudeEngineStatusCache();
      const status = await runtimeStatuses.claude();

      return {
        engine: "claude" as const,
        status,
      };
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
