import type { AIProvider } from "@/server/db/enums";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import { decrypt } from "@/lib/ai/providers/encrypt";
import { validateProviderConfig } from "@/lib/ai/providers/config-schemas";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  normalizeImageGenerationSettings,
  type ImageGenerationSettings,
} from "@/lib/image-generation";

export type ImageModelCapabilities = {
  supportsMask: boolean;
  supportsReferenceImages: boolean;
  supportsSeed: boolean;
  supportsTextToImage: boolean;
};

export type ImageModelMeta = {
  capabilities: ImageModelCapabilities;
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

const TEXT_ONLY_IMAGE_CAPABILITIES: ImageModelCapabilities = {
  supportsMask: false,
  supportsReferenceImages: false,
  supportsSeed: false,
  supportsTextToImage: true,
};

const SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES: ImageModelCapabilities = {
  ...TEXT_ONLY_IMAGE_CAPABILITIES,
  supportsSeed: true,
};

const EDITABLE_IMAGE_CAPABILITIES: ImageModelCapabilities = {
  supportsMask: false,
  supportsReferenceImages: true,
  supportsSeed: false,
  supportsTextToImage: true,
};

const SEEDED_EDITABLE_IMAGE_CAPABILITIES: ImageModelCapabilities = {
  ...EDITABLE_IMAGE_CAPABILITIES,
  supportsSeed: true,
};

const MASK_ONLY_IMAGE_CAPABILITIES: ImageModelCapabilities = {
  supportsMask: true,
  supportsReferenceImages: true,
  supportsSeed: true,
  supportsTextToImage: false,
};

const IMAGE_MODEL_CATALOG: Partial<Record<AIProvider, ImageModelMeta[]>> = {
  openai: [
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Highest quality OpenAI image generation model.",
      displayName: "GPT Image 1",
      id: "gpt-image-1",
    },
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Lower-cost OpenAI image generation model.",
      displayName: "GPT Image 1 Mini",
      id: "gpt-image-1-mini",
    },
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Latest OpenAI image generation variant.",
      displayName: "GPT Image 1.5",
      id: "gpt-image-1.5",
    },
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Classic OpenAI image generation model.",
      displayName: "DALL-E 3",
      id: "dall-e-3",
    },
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Legacy OpenAI image generation model.",
      displayName: "DALL-E 2",
      id: "dall-e-2",
    },
  ],
  google: [
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Google Imagen 4 text-to-image model.",
      displayName: "Imagen 4",
      id: "imagen-4.0-generate-001",
    },
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Google Imagen 3 text-to-image model.",
      displayName: "Imagen 3",
      id: "imagen-3.0-generate-002",
    },
  ],
  google_vertex: [
    {
      capabilities: TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Vertex AI Imagen 4 deployment.",
      displayName: "Imagen 4",
      id: "imagen-4.0-generate-001",
    },
    {
      capabilities: {
        supportsMask: true,
        supportsReferenceImages: true,
        supportsSeed: true,
        supportsTextToImage: true,
      },
      description: "Vertex AI Imagen 3 deployment with editing support.",
      displayName: "Imagen 3",
      id: "imagen-3.0-generate-002",
    },
  ],
  xai: [
    {
      capabilities: EDITABLE_IMAGE_CAPABILITIES,
      description: "xAI Grok image generation and editing model.",
      displayName: "Grok Imagine Image",
      id: "grok-imagine-image",
    },
  ],
  black_forest_labs: [
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "FLUX Kontext Pro supports text prompts and reference-image edits.",
      displayName: "FLUX Kontext Pro",
      id: "flux-kontext-pro",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "FLUX Kontext Max improves prompt adherence for reference-image edits.",
      displayName: "FLUX Kontext Max",
      id: "flux-kontext-max",
    },
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "High-fidelity FLUX image generation model.",
      displayName: "FLUX Pro 1.1 Ultra",
      id: "flux-pro-1.1-ultra",
    },
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Balanced FLUX image generation model.",
      displayName: "FLUX Pro 1.1",
      id: "flux-pro-1.1",
    },
    {
      capabilities: MASK_ONLY_IMAGE_CAPABILITIES,
      description:
        "FLUX fill model for masked edits and inpainting with a source image.",
      displayName: "FLUX Pro 1.0 Fill",
      id: "flux-pro-1.0-fill",
    },
  ],
  fal: [
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Fast high-quality FLUX image generation on Fal.",
      displayName: "FLUX Dev",
      id: "fal-ai/flux/dev",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description: "FLUX Kontext Pro for guided image edits on Fal.",
      displayName: "FLUX Kontext Pro",
      id: "fal-ai/flux-pro/kontext",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description: "FLUX Kontext Max with stronger prompt adherence.",
      displayName: "FLUX Kontext Max",
      id: "fal-ai/flux-pro/kontext/max",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "Ideogram Character keeps identity traits consistent across generations.",
      displayName: "Ideogram Character",
      id: "fal-ai/ideogram/character",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "Qwen-Image supports strong text rendering and precise editing.",
      displayName: "Qwen-Image",
      id: "fal-ai/qwen-image",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "OmniGen V2 supports unified image editing and multi-reference workflows.",
      displayName: "OmniGen V2",
      id: "fal-ai/omnigen-v2",
    },
  ],
  replicate: [
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Fast FLUX image generation hosted on Replicate.",
      displayName: "FLUX Schnell",
      id: "black-forest-labs/flux-schnell",
    },
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "High-quality FLUX Pro image generation on Replicate.",
      displayName: "FLUX Pro",
      id: "black-forest-labs/flux-pro",
    },
    {
      capabilities: MASK_ONLY_IMAGE_CAPABILITIES,
      description:
        "FLUX fill model for inpainting and masked reference-image edits.",
      displayName: "FLUX Fill Pro",
      id: "black-forest-labs/flux-fill-pro",
    },
    {
      capabilities: SEEDED_EDITABLE_IMAGE_CAPABILITIES,
      description:
        "FLUX 2 Pro supports high-quality generation with reference images.",
      displayName: "FLUX 2 Pro",
      id: "black-forest-labs/flux-2-pro",
    },
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Luma Photon text-to-image model.",
      displayName: "Luma Photon",
      id: "luma/photon",
    },
    {
      capabilities: SEEDED_TEXT_ONLY_IMAGE_CAPABILITIES,
      description: "Recraft v3 optimized for polished visuals and branding.",
      displayName: "Recraft v3",
      id: "recraft-ai/recraft-v3",
    },
  ],
};

const CUSTOM_IMAGE_MODEL_PROVIDERS = new Set<AIProvider>([
  "amazon_bedrock",
  "azure",
  "black_forest_labs",
  "fal",
  "google_vertex",
  "ollama",
  "openrouter",
  "replicate",
  "vercel",
  "xai",
]);

const IMAGE_PROVIDER_PRIORITY: Partial<Record<AIProvider, number>> = {
  openai: 0,
  google_vertex: 1,
  black_forest_labs: 2,
  fal: 3,
  replicate: 4,
  xai: 5,
  google: 6,
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

export function getImageModelMeta(provider: AIProvider, modelId: string) {
  return getImageModelsForProvider(provider).find(
    (model) => model.id === modelId,
  );
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
