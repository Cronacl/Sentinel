import { TRPCError } from "@trpc/server";

import { createLogger } from "@/lib/logger";
import type {
  MemoryRuntimeState,
  MemoryRuntimeUnavailableReason,
  MemorySettings,
} from "@/lib/memory";
import {
  getMemoryEmbeddingProfile,
  getMemoryEmbeddingProfileById,
  type MemoryEmbeddingProfile,
} from "@/lib/memory/profiles";
import { getProviderConfig } from "@/lib/ai/providers/resolver";

const MEMORY_EMBEDDING_FAILURE_TTL_MS = 5 * 60 * 1000;
const memoryEmbeddingFailureCircuit = new Map<string, number>();
const log = createLogger("MemoryRuntime");

export function resolveMemoryProfileFromSettings(settings: MemorySettings) {
  const profile = getMemoryEmbeddingProfile(
    settings.memoryProvider,
    settings.memoryModel,
  );

  if (!profile || profile.dimensions !== settings.memoryDimensions) {
    throw new Error(
      "The configured memory embedding profile is not supported.",
    );
  }

  return profile;
}

function getCircuitKey(userId: string, profile: MemoryEmbeddingProfile) {
  return `${userId}:${profile.provider}:${profile.model}`;
}

function getOpenCircuitRetryAt(
  userId: string,
  profile: MemoryEmbeddingProfile,
  now = Date.now(),
) {
  const key = getCircuitKey(userId, profile);
  const retryAt = memoryEmbeddingFailureCircuit.get(key);

  if (retryAt == null) {
    return null;
  }

  if (retryAt <= now) {
    memoryEmbeddingFailureCircuit.delete(key);
    return null;
  }

  return retryAt;
}

function mapProviderConfigError(
  error: unknown,
): Exclude<
  MemoryRuntimeUnavailableReason,
  "disabled" | "embedding_temporarily_unavailable" | "unsupported_profile"
> {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");

  if (message.includes("disabled")) {
    return "provider_disabled";
  }

  return "missing_credentials";
}

export async function resolveMemoryProfileRuntimeState({
  profile,
  userId,
}: {
  profile: MemoryEmbeddingProfile;
  userId: string;
}): Promise<
  | { available: true }
  | {
      available: false;
      reason: Exclude<
        MemoryRuntimeUnavailableReason,
        "disabled" | "unsupported_profile"
      >;
      retryAt?: number;
    }
> {
  const retryAt = getOpenCircuitRetryAt(userId, profile);
  if (retryAt != null) {
    return {
      available: false,
      reason: "embedding_temporarily_unavailable",
      retryAt,
    };
  }

  try {
    await getProviderConfig(userId, profile.provider);
    return { available: true };
  } catch (error) {
    return {
      available: false,
      reason: mapProviderConfigError(error),
    };
  }
}

export async function resolveMemoryRuntimeState({
  settings,
  userId,
}: {
  settings: MemorySettings;
  userId: string;
}): Promise<MemoryRuntimeState> {
  if (!settings.enabled) {
    return {
      available: false,
      reason: "disabled",
      settings,
    };
  }

  const profile = getMemoryEmbeddingProfile(
    settings.memoryProvider,
    settings.memoryModel,
  );

  if (!profile || profile.dimensions !== settings.memoryDimensions) {
    return {
      available: false,
      reason: "unsupported_profile",
      settings,
    };
  }

  const availability = await resolveMemoryProfileRuntimeState({
    profile,
    userId,
  });

  if (!availability.available) {
    return {
      available: false,
      reason: availability.reason,
      ...(availability.retryAt ? { retryAt: availability.retryAt } : {}),
      settings,
    };
  }

  return {
    available: true,
    settings,
  };
}

export function describeMemoryRuntimeUnavailability(
  state: Pick<MemoryRuntimeState, "reason" | "retryAt" | "settings">,
) {
  switch (state.reason) {
    case "disabled":
      return "Long-term memory is disabled.";
    case "missing_credentials":
      return `Long-term memory is unavailable because ${state.settings.memoryProvider} embedding credentials are not configured.`;
    case "provider_disabled":
      return `Long-term memory is unavailable because ${state.settings.memoryProvider} is disabled in Settings > Providers.`;
    case "unsupported_profile":
      return "Long-term memory is unavailable because the configured embedding profile is not supported.";
    case "embedding_temporarily_unavailable":
      return state.retryAt
        ? `Long-term memory is temporarily unavailable after an embedding failure. Retry after ${new Date(state.retryAt).toISOString()}.`
        : "Long-term memory is temporarily unavailable after an embedding failure.";
    default:
      return "Long-term memory is unavailable.";
  }
}

export function describeMemoryProfileRuntimeUnavailability(input: {
  profile: MemoryEmbeddingProfile;
  reason: Exclude<
    MemoryRuntimeUnavailableReason,
    "disabled" | "unsupported_profile"
  >;
  retryAt?: number;
}) {
  return describeMemoryRuntimeUnavailability({
    reason: input.reason,
    ...(input.retryAt ? { retryAt: input.retryAt } : {}),
    settings: {
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: true,
      memoryDimensions: input.profile.dimensions,
      memoryModel: input.profile.model,
      memoryProvider: input.profile.provider,
      retrievalLimit: 6,
    },
  });
}

export function assertMemoryRuntimeAvailable(state: MemoryRuntimeState) {
  if (state.available) {
    return;
  }

  throw new Error(describeMemoryRuntimeUnavailability(state));
}

export function markMemoryEmbeddingTemporarilyUnavailable({
  error,
  profile,
  userId,
}: {
  error: unknown;
  profile: MemoryEmbeddingProfile;
  userId: string;
}) {
  const retryAt = Date.now() + MEMORY_EMBEDDING_FAILURE_TTL_MS;
  memoryEmbeddingFailureCircuit.set(getCircuitKey(userId, profile), retryAt);
  log.warn("Embedding circuit opened for memory.", {
    error: error instanceof Error ? error.message : String(error ?? "Unknown"),
    memoryModel: profile.model,
    memoryProvider: profile.provider,
    retryAt,
    userId,
  });
}

export function clearMemoryEmbeddingTemporaryUnavailable({
  profile,
  userId,
}: {
  profile: MemoryEmbeddingProfile;
  userId: string;
}) {
  memoryEmbeddingFailureCircuit.delete(getCircuitKey(userId, profile));
}

export async function ensureMemoryProfileConfigured(
  userId: string,
  profile: MemoryEmbeddingProfile,
) {
  await getProviderConfig(userId, profile.provider);
  return profile;
}

export async function resolveConfiguredMemoryProfileFromSettings(
  userId: string,
  settings: MemorySettings,
) {
  const profile = resolveMemoryProfileFromSettings(settings);
  return ensureMemoryProfileConfigured(userId, profile);
}

export async function resolveConfiguredMemoryProfileFromId(
  userId: string,
  profileId: string,
) {
  const profile = getMemoryEmbeddingProfileById(profileId);

  if (!profile) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported memory embedding profile.",
    });
  }

  try {
    return await ensureMemoryProfileConfigured(userId, profile);
  } catch (error) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Configure and enable that provider before using it for memory.",
    });
  }
}

export const __internal = {
  MEMORY_EMBEDDING_FAILURE_TTL_MS,
  clearExpiredMemoryEmbeddingFailures(now = Date.now()) {
    for (const [key, retryAt] of memoryEmbeddingFailureCircuit.entries()) {
      if (retryAt <= now) {
        memoryEmbeddingFailureCircuit.delete(key);
      }
    }
  },
  clearMemoryEmbeddingFailureCircuit() {
    memoryEmbeddingFailureCircuit.clear();
  },
  getMemoryEmbeddingFailureCircuitSnapshot() {
    return new Map(memoryEmbeddingFailureCircuit);
  },
};
