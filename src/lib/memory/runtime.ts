import { TRPCError } from "@trpc/server";

import type { MemorySettings } from "@/lib/memory";
import {
  getMemoryEmbeddingProfile,
  getMemoryEmbeddingProfileById,
  type MemoryEmbeddingProfile,
} from "@/lib/memory/profiles";
import { getProviderConfig } from "@/lib/ai/providers/resolver";

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
