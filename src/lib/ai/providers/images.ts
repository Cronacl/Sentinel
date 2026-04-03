import type { AIProvider } from "@/server/db/enums";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import { decrypt } from "@/lib/ai/providers/encrypt";
import { validateProviderConfig } from "@/lib/ai/providers/config-schemas";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  normalizeImageGenerationSettings,
  type ImageGenerationSettings,
} from "@/lib/image-generation";

export type ImageModelMeta = {
  description: string;
  displayName: string;
  id: string;
};

export type ImageGenerationProviderStatus = "active" | "disabled";

export type ImageGenerationProviderListItem = {
  availableModels: ImageModelMeta[];
  description: string;
  displayName: string;
  hasValidModel: boolean;
  isCustom: boolean;
  isEnabled: boolean;
  modelId: string | null;
  provider: AIProvider;
  providerStatus: ImageGenerationProviderStatus;
  supportsCustomModel: boolean;
};

export type ImageGenerationProviderResolvedEntry =
  ImageGenerationProviderListItem & {
    config: Record<string, unknown>;
  };

export type ImageGenerationRuntimeEntry = {
  config: Record<string, unknown>;
  displayName: string;
  isCustom: boolean;
  modelId: string;
  provider: AIProvider;
};

export type ImageGenerationRuntime = {
  defaultProvider: AIProvider | null;
  providers: Partial<Record<AIProvider, ImageGenerationRuntimeEntry>>;
};

type StoredProviderCredential = {
  encryptedConfig: string;
  isEnabled: boolean;
  provider: AIProvider;
};

type StoredImageProviderSetting = {
  isCustom: boolean;
  isEnabled: boolean;
  modelId: string | null;
  provider: AIProvider;
};

const IMAGE_MODEL_CATALOG: Partial<Record<AIProvider, ImageModelMeta[]>> = {
  openai: [
    {
      description: "Highest quality OpenAI image generation model.",
      displayName: "GPT Image 1",
      id: "gpt-image-1",
    },
    {
      description: "Lower-cost OpenAI image generation model.",
      displayName: "GPT Image 1 Mini",
      id: "gpt-image-1-mini",
    },
    {
      description: "Latest OpenAI image generation variant.",
      displayName: "GPT Image 1.5",
      id: "gpt-image-1.5",
    },
    {
      description: "Classic OpenAI image generation model.",
      displayName: "DALL-E 3",
      id: "dall-e-3",
    },
    {
      description: "Legacy OpenAI image generation model.",
      displayName: "DALL-E 2",
      id: "dall-e-2",
    },
  ],
  google: [
    {
      description: "Google Imagen 4 text-to-image model.",
      displayName: "Imagen 4",
      id: "imagen-4.0-generate-001",
    },
    {
      description: "Google Imagen 3 text-to-image model.",
      displayName: "Imagen 3",
      id: "imagen-3.0-generate-002",
    },
  ],
  google_vertex: [
    {
      description: "Vertex AI Imagen 4 deployment.",
      displayName: "Imagen 4",
      id: "imagen-4.0-generate-001",
    },
    {
      description: "Vertex AI Imagen 3 deployment.",
      displayName: "Imagen 3",
      id: "imagen-3.0-generate-002",
    },
  ],
};

const CUSTOM_IMAGE_MODEL_PROVIDERS = new Set<AIProvider>([
  "amazon_bedrock",
  "azure",
  "google_vertex",
  "ollama",
  "openrouter",
  "vercel",
]);

const IMAGE_PROVIDER_PRIORITY: Partial<Record<AIProvider, number>> = {
  openai: 0,
  google_vertex: 1,
};

function normalizeModelId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function compareImageProviders(
  left: ImageGenerationProviderResolvedEntry,
  right: ImageGenerationProviderResolvedEntry,
) {
  const leftPriority =
    IMAGE_PROVIDER_PRIORITY[left.provider] ?? Number.MAX_SAFE_INTEGER;
  const rightPriority =
    IMAGE_PROVIDER_PRIORITY[right.provider] ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.displayName.localeCompare(right.displayName, undefined, {
    sensitivity: "base",
  });
}

function isImageCapableProviderInstance(value: unknown): value is {
  imageModel: (modelId: string) => unknown;
} {
  return (
    typeof value === "function" ||
    (typeof value === "object" &&
      value !== null &&
      "imageModel" in value &&
      typeof (value as { imageModel?: unknown }).imageModel === "function")
  );
}

export function getImageModelsForProvider(provider: AIProvider) {
  return [...(IMAGE_MODEL_CATALOG[provider] ?? [])];
}

export function supportsCustomImageModels(provider: AIProvider) {
  return CUSTOM_IMAGE_MODEL_PROVIDERS.has(provider);
}

export function parseStoredImageGenerationProviderConfig(
  record: StoredProviderCredential,
) {
  return validateProviderConfig(
    record.provider,
    JSON.parse(decrypt(record.encryptedConfig)),
  ) as Record<string, unknown>;
}

export function supportsImageGeneration({
  config,
  provider,
}: {
  config: Record<string, unknown>;
  provider: AIProvider;
}) {
  try {
    const instance = createProviderInstance(provider, config);
    return isImageCapableProviderInstance(instance);
  } catch {
    return false;
  }
}

function resolveSelectedModelId({
  availableModels,
  isCustom,
  requestedModelId,
  supportsCustomModel,
}: {
  availableModels: ImageModelMeta[];
  isCustom: boolean;
  requestedModelId: string | null;
  supportsCustomModel: boolean;
}) {
  if (requestedModelId) {
    if (availableModels.some((model) => model.id === requestedModelId)) {
      return requestedModelId;
    }

    if (isCustom && supportsCustomModel) {
      return requestedModelId;
    }

    return null;
  }

  return availableModels[0]?.id ?? null;
}

export function buildImageGenerationProviderEntries({
  credentials,
  providerSettings,
}: {
  credentials: readonly StoredProviderCredential[];
  providerSettings: readonly StoredImageProviderSetting[];
}) {
  const providerSettingMap = new Map(
    providerSettings.map((setting) => [setting.provider, setting]),
  );
  const entries: ImageGenerationProviderResolvedEntry[] = [];

  for (const credential of credentials) {
    let config: Record<string, unknown>;

    try {
      config = parseStoredImageGenerationProviderConfig(credential);
    } catch {
      continue;
    }

    if (!supportsImageGeneration({ config, provider: credential.provider })) {
      continue;
    }

    const setting = providerSettingMap.get(credential.provider);
    const availableModels = getImageModelsForProvider(credential.provider);
    const supportsCustomModel = supportsCustomImageModels(credential.provider);
    const requestedModelId = normalizeModelId(setting?.modelId);
    const isCustom = setting?.isCustom ?? false;
    const modelId = resolveSelectedModelId({
      availableModels,
      isCustom,
      requestedModelId,
      supportsCustomModel,
    });

    entries.push({
      availableModels,
      config,
      description: PROVIDERS[credential.provider].description,
      displayName: PROVIDERS[credential.provider].displayName,
      hasValidModel: modelId !== null,
      isCustom,
      isEnabled: setting?.isEnabled ?? true,
      modelId,
      provider: credential.provider,
      providerStatus: credential.isEnabled ? "active" : "disabled",
      supportsCustomModel,
    });
  }

  return entries.sort(compareImageProviders);
}

export function stripImageGenerationProviderConfig(
  entries: readonly ImageGenerationProviderResolvedEntry[],
): ImageGenerationProviderListItem[] {
  return entries.map(({ config: _config, ...entry }) => entry);
}

export function buildImageGenerationRuntime({
  providerEntries,
  settings,
}: {
  providerEntries: readonly ImageGenerationProviderResolvedEntry[];
  settings: ImageGenerationSettings | null | undefined;
}): ImageGenerationRuntime {
  const normalizedSettings = normalizeImageGenerationSettings(settings);
  const activeEntries = providerEntries.filter(
    (entry) =>
      entry.providerStatus === "active" &&
      entry.isEnabled &&
      entry.hasValidModel &&
      entry.modelId,
  );

  const providers: Partial<Record<AIProvider, ImageGenerationRuntimeEntry>> =
    {};
  for (const entry of activeEntries) {
    providers[entry.provider] = {
      config: entry.config,
      displayName: entry.displayName,
      isCustom: entry.isCustom,
      modelId: entry.modelId!,
      provider: entry.provider,
    };
  }

  const firstProvider = activeEntries[0]?.provider ?? null;
  const defaultProvider =
    normalizedSettings.defaultProvider &&
    activeEntries.some(
      (entry) => entry.provider === normalizedSettings.defaultProvider,
    )
      ? normalizedSettings.defaultProvider
      : firstProvider;

  return {
    defaultProvider,
    providers,
  };
}
