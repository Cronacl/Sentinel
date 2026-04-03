import { embed, embedMany } from "ai";

import type { MemoryEmbeddingProfile } from "@/lib/memory/profiles";
import {
  clearMemoryEmbeddingTemporaryUnavailable,
  describeMemoryProfileRuntimeUnavailability,
  markMemoryEmbeddingTemporarilyUnavailable,
  resolveMemoryProfileRuntimeState,
} from "@/lib/memory/runtime";

import { createProviderInstance } from "./factory";
import { getProviderConfig } from "./resolver";

async function getEmbeddingModel(
  userId: string,
  profile: MemoryEmbeddingProfile,
) {
  const config = await getProviderConfig(userId, profile.provider);
  const provider = createProviderInstance(profile.provider, config);
  return provider.embeddingModel(profile.model);
}

export async function embedTextForMemory({
  abortSignal,
  profile,
  text,
  userId,
}: {
  abortSignal?: AbortSignal;
  profile: MemoryEmbeddingProfile;
  text: string;
  userId: string;
}) {
  const runtimeState = await resolveMemoryProfileRuntimeState({
    profile,
    userId,
  });
  if (!runtimeState.available) {
    throw new Error(
      describeMemoryProfileRuntimeUnavailability({
        profile,
        reason: runtimeState.reason,
        ...(runtimeState.retryAt ? { retryAt: runtimeState.retryAt } : {}),
      }),
    );
  }

  const model = await getEmbeddingModel(userId, profile);
  try {
    const { embedding } = await embed({
      abortSignal,
      model,
      ...(profile.providerOptions
        ? { providerOptions: profile.providerOptions }
        : {}),
      value: text,
    });

    clearMemoryEmbeddingTemporaryUnavailable({ profile, userId });
    return embedding;
  } catch (error) {
    markMemoryEmbeddingTemporarilyUnavailable({ error, profile, userId });
    throw error;
  }
}

export async function embedTextsForMemory({
  abortSignal,
  profile,
  texts,
  userId,
}: {
  abortSignal?: AbortSignal;
  profile: MemoryEmbeddingProfile;
  texts: string[];
  userId: string;
}) {
  const runtimeState = await resolveMemoryProfileRuntimeState({
    profile,
    userId,
  });
  if (!runtimeState.available) {
    throw new Error(
      describeMemoryProfileRuntimeUnavailability({
        profile,
        reason: runtimeState.reason,
        ...(runtimeState.retryAt ? { retryAt: runtimeState.retryAt } : {}),
      }),
    );
  }

  const model = await getEmbeddingModel(userId, profile);
  try {
    const { embeddings } = await embedMany({
      abortSignal,
      ...(profile.providerOptions
        ? { providerOptions: profile.providerOptions }
        : {}),
      model,
      values: texts,
    });

    clearMemoryEmbeddingTemporaryUnavailable({ profile, userId });
    return embeddings;
  } catch (error) {
    markMemoryEmbeddingTemporarilyUnavailable({ error, profile, userId });
    throw error;
  }
}
