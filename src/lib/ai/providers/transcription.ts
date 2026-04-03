import type { AIProvider } from "@/server/db/enums";
import { PROVIDERS } from "./registry";

export const TRANSCRIPTION_PROVIDER_IDS = [
  "openai",
  "groq",
  "azure",
] as const satisfies readonly AIProvider[];

export type TranscriptionProviderId =
  (typeof TRANSCRIPTION_PROVIDER_IDS)[number];
export type VoiceProviderStatus = "active" | "disabled" | "not_configured";

export type TranscriptionModelOption = {
  description: string;
  id: string;
  label: string;
};

export type VoiceInputSettings = {
  voiceInputEnabled: boolean;
  voiceInputModelId: string | null;
  voiceInputProvider: TranscriptionProviderId | null;
};

export type VoiceInputProviderOption = {
  defaultModelId: string | null;
  description: string;
  displayName: string;
  id: TranscriptionProviderId;
  modelOptions: readonly TranscriptionModelOption[];
  requiresModelOverride: boolean;
  status: VoiceProviderStatus;
};

export type VoiceInputAvailability = {
  isAvailable: boolean;
  providers: VoiceInputProviderOption[];
  resolvedModelId: string | null;
  unavailableReason: string | null;
};

const OPENAI_TRANSCRIPTION_MODELS = [
  {
    description: "OpenAI Whisper transcription for broad audio compatibility.",
    id: "whisper-1",
    label: "Whisper 1",
  },
  {
    description: "Balanced accuracy, latency, and cost for spoken prompts.",
    id: "gpt-4o-mini-transcribe",
    label: "GPT-4o Mini Transcribe",
  },
  {
    description:
      "Pinned OpenAI transcription snapshot used as Sentinel's default.",
    id: "gpt-4o-mini-transcribe-2025-12-15",
    label: "GPT-4o Mini Transcribe 2025-12-15",
  },
  {
    description: "Higher-end OpenAI transcription model for nuanced speech.",
    id: "gpt-4o-transcribe",
    label: "GPT-4o Transcribe",
  },
] as const satisfies readonly TranscriptionModelOption[];

const GROQ_TRANSCRIPTION_MODELS = [
  {
    description: "Fast Whisper-based transcription tuned for interactive apps.",
    id: "whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo",
  },
  {
    description: "Groq's full Whisper Large V3 offering.",
    id: "whisper-large-v3",
    label: "Whisper Large V3",
  },
] as const satisfies readonly TranscriptionModelOption[];

export const TRANSCRIPTION_PROVIDER_CATALOG: Record<
  TranscriptionProviderId,
  {
    defaultModelId: string | null;
    description: string;
    modelOptions: readonly TranscriptionModelOption[];
    requiresModelOverride: boolean;
  }
> = {
  azure: {
    defaultModelId: null,
    description: "Azure OpenAI transcription using your deployment name.",
    modelOptions: [],
    requiresModelOverride: true,
  },
  groq: {
    defaultModelId: "whisper-large-v3-turbo",
    description: "Groq Whisper transcription with low latency.",
    modelOptions: GROQ_TRANSCRIPTION_MODELS,
    requiresModelOverride: false,
  },
  openai: {
    defaultModelId: "whisper-1",
    description: "OpenAI audio transcription with Whisper and 4o models.",
    modelOptions: OPENAI_TRANSCRIPTION_MODELS,
    requiresModelOverride: false,
  },
};

export function isTranscriptionProvider(
  value: string | null | undefined,
): value is TranscriptionProviderId {
  return TRANSCRIPTION_PROVIDER_IDS.includes(value as TranscriptionProviderId);
}

export function normalizeVoiceInputModelId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizeVoiceInputSettings(input: {
  voiceInputEnabled?: boolean | null;
  voiceInputModelId?: string | null;
  voiceInputProvider?: string | null;
}): VoiceInputSettings {
  return {
    voiceInputEnabled: input.voiceInputEnabled ?? false,
    voiceInputModelId: normalizeVoiceInputModelId(input.voiceInputModelId),
    voiceInputProvider: isTranscriptionProvider(input.voiceInputProvider)
      ? input.voiceInputProvider
      : null,
  };
}

export function resolveVoiceInputModelId(settings: VoiceInputSettings) {
  const provider = settings.voiceInputProvider;
  if (!provider) {
    return null;
  }

  const explicitModelId = normalizeVoiceInputModelId(
    settings.voiceInputModelId,
  );
  if (explicitModelId) {
    return explicitModelId;
  }

  return TRANSCRIPTION_PROVIDER_CATALOG[provider].defaultModelId;
}

export function buildVoiceProviderOptions(
  statuses: Partial<Record<TranscriptionProviderId, VoiceProviderStatus>>,
) {
  return TRANSCRIPTION_PROVIDER_IDS.map((providerId) => ({
    defaultModelId: TRANSCRIPTION_PROVIDER_CATALOG[providerId].defaultModelId,
    description: TRANSCRIPTION_PROVIDER_CATALOG[providerId].description,
    displayName: PROVIDERS[providerId].displayName,
    id: providerId,
    modelOptions: TRANSCRIPTION_PROVIDER_CATALOG[providerId].modelOptions,
    requiresModelOverride:
      TRANSCRIPTION_PROVIDER_CATALOG[providerId].requiresModelOverride,
    status: statuses[providerId] ?? "not_configured",
  }));
}

export function deriveVoiceInputAvailability(input: {
  providerStatuses: Partial<
    Record<TranscriptionProviderId, VoiceProviderStatus>
  >;
  settings: VoiceInputSettings;
}): VoiceInputAvailability {
  const providers = buildVoiceProviderOptions(input.providerStatuses);
  const provider = input.settings.voiceInputProvider;
  const resolvedModelId = resolveVoiceInputModelId(input.settings);

  if (!input.settings.voiceInputEnabled) {
    return {
      isAvailable: false,
      providers,
      resolvedModelId,
      unavailableReason: "Voice input is turned off.",
    };
  }

  if (!provider) {
    return {
      isAvailable: false,
      providers,
      resolvedModelId,
      unavailableReason: "Choose a transcription provider.",
    };
  }

  const providerOption = providers.find((item) => item.id === provider);
  if (!providerOption || providerOption.status !== "active") {
    return {
      isAvailable: false,
      providers,
      resolvedModelId,
      unavailableReason: `Connect and enable ${PROVIDERS[provider].displayName} in Providers.`,
    };
  }

  if (!resolvedModelId) {
    return {
      isAvailable: false,
      providers,
      resolvedModelId,
      unavailableReason: providerOption.requiresModelOverride
        ? "Enter a transcription deployment or model ID."
        : "Choose a transcription model.",
    };
  }

  return {
    isAvailable: true,
    providers,
    resolvedModelId,
    unavailableReason: null,
  };
}
