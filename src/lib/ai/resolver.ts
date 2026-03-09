import "server-only";

import type { AIProvider } from "@/../generated/prisma";
import { db } from "@/server/db";

import { decrypt } from "./encrypt";
import { getModelsForProvider, isKnownModel } from "./models";
import { createProviderInstance } from "./provider-factory";

const VALID_PROVIDERS = new Set<string>([
  "openai",
  "anthropic",
  "google",
  "google_vertex",
]);

export function parseModelId(compositeId: string): {
  provider: AIProvider;
  model: string;
} {
  const separatorIndex = compositeId.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid model ID "${compositeId}". Expected format: "provider:model"`,
    );
  }

  const provider = compositeId.slice(0, separatorIndex);
  const model = compositeId.slice(separatorIndex + 1);

  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `Unknown provider "${provider}". Valid providers: ${[...VALID_PROVIDERS].join(", ")}`,
    );
  }

  if (!model) {
    throw new Error(`Missing model name in "${compositeId}"`);
  }

  return { provider: provider as AIProvider, model };
}

export type ProviderConfig = Record<string, unknown>;

export async function getProviderConfig(
  userId: string,
  provider: AIProvider,
): Promise<ProviderConfig> {
  const credential = await db.providerCredential.findUnique({
    where: { userId_provider: { userId, provider } },
  });

  if (!credential) {
    throw new Error(
      `Provider "${provider}" is not configured. Add your credentials in Settings > Providers.`,
    );
  }

  if (!credential.isEnabled) {
    throw new Error(
      `Provider "${provider}" is disabled. Enable it in Settings > Providers.`,
    );
  }

  return JSON.parse(decrypt(credential.encryptedConfig)) as ProviderConfig;
}

/**
 * Resolves a composite model ID (e.g. "openai:gpt-5.2-pro") into an AI SDK
 * LanguageModel instance, using the given user's stored credentials.
 */
export async function getLanguageModel(userId: string, compositeId: string) {
  const { provider, model } = parseModelId(compositeId);
  const config = await getProviderConfig(userId, provider);
  const providerInstance = createProviderInstance(provider, config);
  return providerInstance.languageModel(model);
}

/**
 * Returns all models the user can currently use: built-in models for connected
 * providers that are enabled in preferences, plus any custom models.
 */
export async function getEnabledModels(userId: string) {
  const [credentials, preferences] = await Promise.all([
    db.providerCredential.findMany({
      where: { userId, isEnabled: true },
      select: { provider: true },
    }),
    db.modelPreference.findMany({
      where: { userId },
    }),
  ]);

  const connectedProviders = new Set(credentials.map((c) => c.provider));
  const prefMap = new Map(
    preferences.map((p) => [`${p.provider}:${p.modelId}`, p]),
  );

  const models: Array<{
    compositeId: string;
    provider: AIProvider;
    modelId: string;
    displayName: string;
    isCustom: boolean;
  }> = [];

  for (const provider of connectedProviders) {
    const builtIn = getModelsForProvider(provider);
    for (const m of builtIn) {
      const pref = prefMap.get(`${provider}:${m.id}`);
      const isEnabled = pref?.isEnabled ?? true;
      if (isEnabled) {
        models.push({
          compositeId: `${provider}:${m.id}`,
          provider,
          modelId: m.id,
          displayName: m.displayName,
          isCustom: false,
        });
      }
    }

    const customModels = preferences.filter(
      (p) =>
        p.provider === provider &&
        p.isCustom &&
        p.isEnabled &&
        !isKnownModel(provider, p.modelId),
    );
    for (const cm of customModels) {
      models.push({
        compositeId: `${cm.provider}:${cm.modelId}`,
        provider: cm.provider,
        modelId: cm.modelId,
        displayName: cm.modelId,
        isCustom: true,
      });
    }
  }

  return models;
}
