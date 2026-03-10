import "server-only";

import { and, eq } from "drizzle-orm";

import type { AIProvider } from "@/server/db/enums";
import { db } from "@/server/db";
import { modelPreferences, providerCredentials } from "@/server/db/schema";

import { createCredentialDecryptionError, decrypt } from "./encrypt";
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
  const credential = await db.query.providerCredentials.findFirst({
    where: and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.provider, provider),
    ),
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

  try {
    return JSON.parse(decrypt(credential.encryptedConfig)) as ProviderConfig;
  } catch {
    throw createCredentialDecryptionError(provider);
  }
}

export async function getLanguageModel(userId: string, compositeId: string) {
  const { provider, model } = parseModelId(compositeId);
  const config = await getProviderConfig(userId, provider);
  const providerInstance = createProviderInstance(provider, config);
  return providerInstance.languageModel(model);
}

export async function getEnabledModels(userId: string) {
  const credentials = await db.query.providerCredentials.findMany({
    where: and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.isEnabled, true),
    ),
    columns: { provider: true },
  });

  const preferences = await db.query.modelPreferences.findMany({
    where: eq(modelPreferences.userId, userId),
  });

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
