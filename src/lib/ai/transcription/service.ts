import "server-only";

import { Buffer } from "node:buffer";
import { experimental_transcribe as transcribe } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";

import {
  deriveVoiceInputAvailability,
  normalizeVoiceInputSettings,
  type TranscriptionProviderId,
  type VoiceProviderStatus,
} from "@/lib/ai/providers/transcription";
import { decrypt } from "@/lib/ai/providers/encrypt";
import { db } from "@/server/db";
import { providerCredentials, users } from "@/server/db/schema";

export class VoiceTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceTranscriptionError";
  }
}

function mapProviderStatuses(
  credentials: Array<{ isEnabled: boolean; provider: string }>,
) {
  return credentials.reduce(
    (result, credential) => {
      if (
        credential.provider === "openai" ||
        credential.provider === "groq" ||
        credential.provider === "azure"
      ) {
        result[credential.provider] = credential.isEnabled
          ? "active"
          : "disabled";
      }

      return result;
    },
    {} as Partial<Record<TranscriptionProviderId, VoiceProviderStatus>>,
  );
}

export async function getVoiceInputStateForUser(userId: string) {
  const [user, credentials] = await Promise.all([
    db.query.users.findFirst({
      columns: {
        voiceInputEnabled: true,
        voiceInputModelId: true,
        voiceInputProvider: true,
      },
      where: eq(users.id, userId),
    }),
    db.query.providerCredentials.findMany({
      columns: {
        isEnabled: true,
        provider: true,
      },
      where: eq(providerCredentials.userId, userId),
    }),
  ]);

  if (!user) {
    throw new VoiceTranscriptionError("Unable to load voice input settings.");
  }

  const settings = normalizeVoiceInputSettings(user);
  const availability = deriveVoiceInputAvailability({
    providerStatuses: mapProviderStatuses(credentials),
    settings,
  });

  return {
    availability,
    settings,
  };
}

async function getDecryptedProviderConfig(
  userId: string,
  provider: TranscriptionProviderId,
) {
  const credential = await db.query.providerCredentials.findFirst({
    columns: {
      encryptedConfig: true,
      isEnabled: true,
    },
    where: and(
      eq(providerCredentials.userId, userId),
      eq(providerCredentials.provider, provider),
    ),
  });

  if (!credential) {
    throw new VoiceTranscriptionError(
      "The selected voice provider is no longer configured.",
    );
  }

  if (!credential.isEnabled) {
    throw new VoiceTranscriptionError(
      "The selected voice provider is disabled.",
    );
  }

  try {
    return JSON.parse(decrypt(credential.encryptedConfig)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new VoiceTranscriptionError(
      "Unable to decrypt the selected voice provider credentials.",
    );
  }
}

async function createTranscriptionModel(input: {
  modelId: string;
  provider: TranscriptionProviderId;
  userId: string;
}) {
  const config = await getDecryptedProviderConfig(input.userId, input.provider);

  switch (input.provider) {
    case "openai": {
      return createOpenAI({
        apiKey: String(config.apiKey ?? ""),
        ...(config.baseURL ? { baseURL: String(config.baseURL) } : {}),
      }).transcription(input.modelId);
    }
    case "groq": {
      return createGroq({
        apiKey: String(config.apiKey ?? ""),
        ...(config.baseURL ? { baseURL: String(config.baseURL) } : {}),
      }).transcription(input.modelId);
    }
    case "azure": {
      return createAzure({
        apiKey: String(config.apiKey ?? ""),
        ...(config.baseURL ? { baseURL: String(config.baseURL) } : {}),
        useDeploymentBasedUrls: true,
      }).transcription(input.modelId);
    }
    default: {
      const exhaustiveCheck: never = input.provider;
      throw new VoiceTranscriptionError(
        `Unsupported transcription provider: ${exhaustiveCheck}`,
      );
    }
  }
}

export async function transcribeAudioForUser(input: {
  audio: Uint8Array;
  filename?: string | null;
  mediaType?: string | null;
  userId: string;
}) {
  const { availability, settings } = await getVoiceInputStateForUser(
    input.userId,
  );

  if (!availability.isAvailable || !settings.voiceInputProvider) {
    throw new VoiceTranscriptionError(
      availability.unavailableReason ?? "Voice input is not available.",
    );
  }

  const model = await createTranscriptionModel({
    modelId: availability.resolvedModelId!,
    provider: settings.voiceInputProvider,
    userId: input.userId,
  });

  const result = await transcribe({
    audio: Buffer.from(input.audio),
    model,
  });

  return {
    durationInSeconds: result.durationInSeconds,
    language: result.language,
    text: result.text,
  };
}
