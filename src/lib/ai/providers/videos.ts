import type { AIProvider } from "@/server/db/enums";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import { decrypt } from "@/lib/ai/providers/encrypt";
import { validateProviderConfig } from "@/lib/ai/providers/config-schemas";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  normalizeVideoGenerationSettings,
  type VideoGenerationSettings,
} from "@/lib/video-generation";

export type VideoModelCapabilities = {
  supportsImageToVideo: boolean;
  supportsSeed: boolean;
  supportsTextToVideo: boolean;
};

export type VideoModelMeta = {
  capabilities: VideoModelCapabilities;
  description: string;
  displayName: string;
  id: string;
};

export type VideoGenerationProviderStatus = "active" | "disabled";

export type VideoGenerationProviderListItem = {
  availableModels: VideoModelMeta[];
  description: string;
  displayName: string;
  hasValidModel: boolean;
  isCustom: boolean;
  isEnabled: boolean;
  modelId: string | null;
  provider: AIProvider;
  providerStatus: VideoGenerationProviderStatus;
  supportsCustomModel: boolean;
};

export type VideoGenerationProviderResolvedEntry =
  VideoGenerationProviderListItem & {
    config: Record<string, unknown>;
  };

export type VideoGenerationRuntimeEntry = {
  config: Record<string, unknown>;
  displayName: string;
  isCustom: boolean;
  modelId: string;
  provider: AIProvider;
};

export type VideoGenerationRuntime = {
  defaultProvider: AIProvider | null;
  providers: Partial<Record<AIProvider, VideoGenerationRuntimeEntry>>;
};

type StoredProviderCredential = {
  encryptedConfig: string;
  isEnabled: boolean;
  provider: AIProvider;
};

type StoredVideoProviderSetting = {
  isCustom: boolean;
  isEnabled: boolean;
  modelId: string | null;
  provider: AIProvider;
};

type VideoCapableProviderInstance = {
  video: (modelId: string) => unknown;
  videoModel?: (modelId: string) => unknown;
};

const TEXT_AND_IMAGE_VIDEO_CAPABILITIES: VideoModelCapabilities = {
  supportsImageToVideo: true,
  supportsSeed: true,
  supportsTextToVideo: true,
};

const TEXT_ONLY_VIDEO_CAPABILITIES: VideoModelCapabilities = {
  supportsImageToVideo: false,
  supportsSeed: true,
  supportsTextToVideo: true,
};

const IMAGE_ONLY_VIDEO_CAPABILITIES: VideoModelCapabilities = {
  supportsImageToVideo: true,
  supportsSeed: false,
  supportsTextToVideo: false,
};

const NO_SEED_TEXT_AND_IMAGE_VIDEO_CAPABILITIES: VideoModelCapabilities = {
  supportsImageToVideo: true,
  supportsSeed: false,
  supportsTextToVideo: true,
};

const VIDEO_MODEL_CATALOG: Partial<Record<AIProvider, VideoModelMeta[]>> = {
  google: [
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Google Veo 3.1 fast preview model.",
      displayName: "Veo 3.1 Fast",
      id: "veo-3.1-fast-generate-preview",
    },
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Google Veo 3.1 quality preview model.",
      displayName: "Veo 3.1",
      id: "veo-3.1-generate-preview",
    },
    {
      capabilities: TEXT_ONLY_VIDEO_CAPABILITIES,
      description: "Google Veo 2 stable text-to-video model.",
      displayName: "Veo 2",
      id: "veo-2.0-generate-001",
    },
  ],
  google_vertex: [
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Vertex AI Veo 3.1 fast preview model.",
      displayName: "Veo 3.1 Fast",
      id: "veo-3.1-fast-generate-preview",
    },
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Vertex AI Veo 3.1 quality preview model.",
      displayName: "Veo 3.1",
      id: "veo-3.1-generate-preview",
    },
    {
      capabilities: TEXT_ONLY_VIDEO_CAPABILITIES,
      description: "Vertex AI Veo 2 stable text-to-video model.",
      displayName: "Veo 2",
      id: "veo-2.0-generate-001",
    },
  ],
  xai: [
    {
      capabilities: NO_SEED_TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "xAI Grok imagine video model.",
      displayName: "Grok Imagine Video",
      id: "grok-imagine-video",
    },
  ],
  klingai: [
    {
      capabilities: {
        supportsImageToVideo: false,
        supportsSeed: false,
        supportsTextToVideo: true,
      },
      description: "Latest Kling 3.0 text-to-video model.",
      displayName: "Kling 3.0 T2V",
      id: "kling-v3.0-t2v",
    },
    {
      capabilities: {
        supportsImageToVideo: false,
        supportsSeed: false,
        supportsTextToVideo: true,
      },
      description: "Kling 2.6 text-to-video model with strong motion quality.",
      displayName: "Kling 2.6 T2V",
      id: "kling-v2.6-t2v",
    },
    {
      capabilities: IMAGE_ONLY_VIDEO_CAPABILITIES,
      description: "Latest Kling 3.0 image-to-video model.",
      displayName: "Kling 3.0 I2V",
      id: "kling-v3.0-i2v",
    },
    {
      capabilities: IMAGE_ONLY_VIDEO_CAPABILITIES,
      description: "Kling 2.6 image-to-video model.",
      displayName: "Kling 2.6 I2V",
      id: "kling-v2.6-i2v",
    },
  ],
  fal: [
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Luma Ray 2 video generation on Fal.",
      displayName: "Luma Ray 2",
      id: "luma-ray-2",
    },
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "MiniMax video generation on Fal.",
      displayName: "MiniMax Video",
      id: "minimax-video",
    },
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "Hunyuan video generation on Fal.",
      displayName: "Hunyuan Video",
      id: "hunyuan-video",
    },
  ],
  replicate: [
    {
      capabilities: TEXT_AND_IMAGE_VIDEO_CAPABILITIES,
      description: "MiniMax video generation hosted on Replicate.",
      displayName: "MiniMax Video 01",
      id: "minimax/video-01",
    },
  ],
};

const CUSTOM_VIDEO_MODEL_PROVIDERS = new Set<AIProvider>([
  "fal",
  "klingai",
  "replicate",
  "vercel",
  "xai",
]);

const VIDEO_PROVIDER_PRIORITY: Partial<Record<AIProvider, number>> = {
  google_vertex: 0,
  google: 1,
  klingai: 2,
  xai: 3,
  fal: 4,
  replicate: 5,
  vercel: 6,
};

function normalizeModelId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function compareVideoProviders(
  left: VideoGenerationProviderResolvedEntry,
  right: VideoGenerationProviderResolvedEntry,
) {
  const leftPriority =
    VIDEO_PROVIDER_PRIORITY[left.provider] ?? Number.MAX_SAFE_INTEGER;
  const rightPriority =
    VIDEO_PROVIDER_PRIORITY[right.provider] ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.displayName.localeCompare(right.displayName, undefined, {
    sensitivity: "base",
  });
}

function isVideoCapableProviderInstance(
  value: unknown,
): value is VideoCapableProviderInstance {
  const candidate = value as {
    video?: unknown;
    videoModel?: unknown;
  };

  return (
    (typeof value === "function" ||
      (typeof value === "object" && value !== null)) &&
    (typeof candidate.videoModel === "function" ||
      typeof candidate.video === "function")
  );
}

export function getVideoModelsForProvider(provider: AIProvider) {
  return [...(VIDEO_MODEL_CATALOG[provider] ?? [])];
}

export function getVideoModelMeta(provider: AIProvider, modelId: string) {
  return getVideoModelsForProvider(provider).find(
    (model) => model.id === modelId,
  );
}

export function supportsCustomVideoModels(provider: AIProvider) {
  return CUSTOM_VIDEO_MODEL_PROVIDERS.has(provider);
}

export function parseStoredVideoGenerationProviderConfig(
  record: StoredProviderCredential,
) {
  return validateProviderConfig(
    record.provider,
    JSON.parse(decrypt(record.encryptedConfig)),
  ) as Record<string, unknown>;
}

export function supportsVideoGeneration({
  config,
  provider,
}: {
  config: Record<string, unknown>;
  provider: AIProvider;
}) {
  try {
    const instance = createProviderInstance(provider, config);
    return isVideoCapableProviderInstance(instance);
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
  availableModels: VideoModelMeta[];
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

export function buildVideoGenerationProviderEntries({
  credentials,
  providerSettings,
}: {
  credentials: readonly StoredProviderCredential[];
  providerSettings: readonly StoredVideoProviderSetting[];
}) {
  const providerSettingMap = new Map(
    providerSettings.map((setting) => [setting.provider, setting]),
  );
  const entries: VideoGenerationProviderResolvedEntry[] = [];

  for (const credential of credentials) {
    let config: Record<string, unknown>;

    try {
      config = parseStoredVideoGenerationProviderConfig(credential);
    } catch {
      continue;
    }

    if (!supportsVideoGeneration({ config, provider: credential.provider })) {
      continue;
    }

    const setting = providerSettingMap.get(credential.provider);
    const availableModels = getVideoModelsForProvider(credential.provider);
    const supportsCustomModel = supportsCustomVideoModels(credential.provider);
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

  return entries.sort(compareVideoProviders);
}

export function stripVideoGenerationProviderConfig(
  entries: readonly VideoGenerationProviderResolvedEntry[],
): VideoGenerationProviderListItem[] {
  return entries.map(({ config: _config, ...entry }) => entry);
}

export function buildVideoGenerationRuntime({
  providerEntries,
  settings,
}: {
  providerEntries: readonly VideoGenerationProviderResolvedEntry[];
  settings: VideoGenerationSettings | null | undefined;
}) {
  const normalizedSettings = normalizeVideoGenerationSettings(settings);
  const activeEntries = providerEntries.filter(
    (entry) =>
      entry.providerStatus === "active" &&
      entry.isEnabled &&
      entry.hasValidModel &&
      entry.modelId,
  );

  const providers: Partial<Record<AIProvider, VideoGenerationRuntimeEntry>> =
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
  } satisfies VideoGenerationRuntime;
}
