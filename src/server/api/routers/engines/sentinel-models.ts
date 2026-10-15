import { and, eq } from "drizzle-orm";

import type { ComposerEngineModel } from "@/lib/ai/chat/engines/composer-catalog";
import {
  getDefaultReasoningEffort,
  getModelsForProvider,
  getSupportedReasoningEfforts,
  isKnownModel,
  MODEL_CATALOG,
} from "@/lib/ai/providers/models";
import { getCompositeModelId } from "@/lib/ai/providers/model-selection";
import type { db as appDb } from "@/server/db";
import type { AIProvider } from "@/server/db/enums";
import { modelPreferences, providerCredentials } from "@/server/db/schema";

// The built-in engine's models: the provider catalog plus the user's custom
// models, with connection and enabled state from their provider credentials
// and model preferences. Unchanged from the engines router before driver
// snapshots; the built-in driver's snapshot carries no models.

type SentinelModelsContext = {
  db: Pick<typeof appDb, "query">;
  session: { user: { id: string } };
};

export async function listSentinelModels(
  ctx: SentinelModelsContext,
): Promise<ComposerEngineModel[]> {
  const userId = ctx.session.user.id;
  const connectedProviders = await ctx.db.query.providerCredentials.findMany({
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

  return (Object.keys(MODEL_CATALOG) as AIProvider[]).flatMap((provider) => {
    const builtIn = getModelsForProvider(provider).map(
      (model): ComposerEngineModel => {
        const compositeId = getCompositeModelId(provider, model.id);
        const pref = prefMap.get(compositeId);

        return {
          contextWindow: model.contextWindow,
          defaultReasoningEffort: getDefaultReasoningEffort(provider, model.id),
          description: model.description,
          displayName: model.displayName,
          engine: "sentinel",
          inputModalities: model.capabilities.includes("vision")
            ? ["text", "image"]
            : ["text"],
          instanceId: "sentinel",
          isConnected: connectedSet.has(provider),
          isEnabled: pref?.isEnabled ?? true,
          modelId: compositeId,
          options: [],
          provider,
          rawModelId: model.id,
          supportedReasoningEfforts: getSupportedReasoningEfforts(
            provider,
            model.id,
          ),
        };
      },
    );

    const customModels = preferences
      .filter(
        (preference) =>
          preference.provider === provider &&
          preference.isCustom &&
          !isKnownModel(provider, preference.modelId),
      )
      .map((preference): ComposerEngineModel => ({
        contextWindow: undefined,
        defaultReasoningEffort: getDefaultReasoningEffort(
          provider,
          preference.modelId,
        ),
        description: "Custom model",
        displayName: preference.modelId,
        engine: "sentinel",
        inputModalities: ["text"],
        instanceId: "sentinel",
        isConnected: connectedSet.has(provider),
        isEnabled: preference.isEnabled,
        modelId: getCompositeModelId(provider, preference.modelId),
        options: [],
        provider,
        rawModelId: preference.modelId,
        supportedReasoningEfforts: getSupportedReasoningEfforts(
          provider,
          preference.modelId,
        ),
      }));

    return [...builtIn, ...customModels];
  });
}
