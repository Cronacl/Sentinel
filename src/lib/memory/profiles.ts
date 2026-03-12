import type { AIProvider } from "@/server/db/enums";

export const MEMORY_EMBEDDING_PROFILE_IDS = [
  "openai:text-embedding-3-small",
  "openai:text-embedding-3-large",
] as const;

export type MemoryEmbeddingProfileId =
  (typeof MEMORY_EMBEDDING_PROFILE_IDS)[number];

export type MemoryEmbeddingProfile = {
  description: string;
  dimensions: number;
  displayName: string;
  id: MemoryEmbeddingProfileId;
  model: string;
  provider: AIProvider;
};

export const MEMORY_EMBEDDING_PROFILES = [
  {
    description: "Compact OpenAI embeddings for durable memory recall.",
    dimensions: 1536,
    displayName: "OpenAI text-embedding-3-small",
    id: "openai:text-embedding-3-small",
    model: "text-embedding-3-small",
    provider: "openai",
  },
  {
    description: "Higher-capacity OpenAI embeddings for richer recall.",
    dimensions: 3072,
    displayName: "OpenAI text-embedding-3-large",
    id: "openai:text-embedding-3-large",
    model: "text-embedding-3-large",
    provider: "openai",
  },
] as const satisfies readonly MemoryEmbeddingProfile[];

export const DEFAULT_MEMORY_EMBEDDING_PROFILE =
  MEMORY_EMBEDDING_PROFILES[0] satisfies MemoryEmbeddingProfile;

export function getMemoryEmbeddingProfile(
  provider: AIProvider,
  model: string,
): MemoryEmbeddingProfile | null {
  return (
    MEMORY_EMBEDDING_PROFILES.find(
      (profile) => profile.provider === provider && profile.model === model,
    ) ?? null
  );
}

export function getMemoryEmbeddingProfileById(
  profileId: string,
): MemoryEmbeddingProfile | null {
  return (
    MEMORY_EMBEDDING_PROFILES.find((profile) => profile.id === profileId) ??
    null
  );
}

export function getMemoryProfilesForProvider(provider: AIProvider) {
  return MEMORY_EMBEDDING_PROFILES.filter(
    (profile) => profile.provider === provider,
  );
}
