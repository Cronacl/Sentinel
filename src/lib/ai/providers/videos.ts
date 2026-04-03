import type { AIProvider } from "@/server/db/enums";

import { createProviderInstance } from "@/lib/ai/providers/factory";
import { decrypt } from "@/lib/ai/providers/encrypt";
import { validateProviderConfig } from "@/lib/ai/providers/config-schemas";
import { PROVIDERS } from "@/lib/ai/providers/registry";
import {
  normalizeVideoGenerationSettings,
  type VideoGenerationSettings,
} from "@/lib/video-generation";

export type VideoModelMeta = {
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

const VIDEO_MODEL_CATALOG: Partial<Record<AIProvider, VideoModelMeta[]>> = {
  google: [
    {
      description: "Google Veo 3.1 fast preview model.",
      displayName: "Veo 3.1 Fast",
      id: "veo-3.1-fast-generate-preview",
    },
    {
      description: "Google Veo 3.1 quality preview model.",
      displayName: "Veo 3.1",
      id: "veo-3.1-generate-preview",
    },
    {
      description: "Google Veo 2 stable video generation model.",
      displayName: "Veo 2",
      id: "veo-2.0-generate-001",
    },
  ],
  google_vertex: [
    {
      description: "Vertex AI Veo 3.1 fast preview model.",
      displayName: "Veo 3.1 Fast",
      id: "veo-3.1-fast-generate-preview",
    },
    {
      description: "Vertex AI Veo 3.1 quality preview model.",
      displayName: "Veo 3.1",
      id: "veo-3.1-generate-preview",
    },
    {
      description: "Vertex AI Veo 2 stable video generation model.",
      displayName: "Veo 2",
      id: "veo-2.0-generate-001",
    },
  ],
  xai: [
    {
      description: "xAI Grok imagine video model.",
      displayName: "Grok Imagine Video",
      id: "grok-imagine-video",
    },
  ],
};

const CUSTOM_VIDEO_MODEL_PROVIDERS = new Set<AIProvider>(["vercel"]);

const VIDEO_PROVIDER_PRIORITY: Partial<Record<AIProvider, number>> = {
  google_vertex: 0,
  google: 1,
  xai: 2,
  vercel: 3,
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
