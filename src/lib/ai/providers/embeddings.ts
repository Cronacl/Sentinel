import { embed, embedMany } from "ai";

import type { MemoryEmbeddingProfile } from "@/lib/memory/profiles";

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
  const model = await getEmbeddingModel(userId, profile);
  const { embedding } = await embed({
    abortSignal,
    model,
    value: text,
  });

  return embedding;
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
  const model = await getEmbeddingModel(userId, profile);
  const { embeddings } = await embedMany({
    abortSignal,
    model,
    values: texts,
  });

  return embeddings;
}
