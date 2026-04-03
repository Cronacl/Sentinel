import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

import type { AIProvider } from "@/server/db/enums";

export const MEMORY_EMBEDDING_PROFILE_IDS = [
  "openai:text-embedding-3-small",
  "openai:text-embedding-3-large",
  "openai:text-embedding-ada-002",
  "google:gemini-embedding-001",
  "google_vertex:text-embedding-005",
  "google_vertex:text-multilingual-embedding-002",
  "cohere:embed-english-v3.0",
  "cohere:embed-multilingual-v3.0",
  "cohere:embed-english-light-v3.0",
  "cohere:embed-multilingual-light-v3.0",
  "cohere:embed-english-v2.0",
  "cohere:embed-english-light-v2.0",
  "cohere:embed-multilingual-v2.0",
  "mistral:mistral-embed",
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
  providerOptions?: SharedV3ProviderOptions;
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
  {
    description:
      "Legacy OpenAI embeddings for compatibility with older stores.",
    dimensions: 1536,
    displayName: "OpenAI text-embedding-ada-002",
    id: "openai:text-embedding-ada-002",
    model: "text-embedding-ada-002",
    provider: "openai",
  },
  {
    description:
      "Google Gemini embeddings for multilingual and code-aware recall.",
    dimensions: 3072,
    displayName: "Google gemini-embedding-001",
    id: "google:gemini-embedding-001",
    model: "gemini-embedding-001",
    provider: "google",
    providerOptions: {
      google: {
        outputDimensionality: 3072,
      },
    },
  },
  {
    description: "Vertex AI embeddings tuned for English and code retrieval.",
    dimensions: 768,
    displayName: "Vertex AI text-embedding-005",
    id: "google_vertex:text-embedding-005",
    model: "text-embedding-005",
    provider: "google_vertex",
    providerOptions: {
      vertex: {
        outputDimensionality: 768,
      },
    },
  },
  {
    description:
      "Vertex AI multilingual embeddings for cross-language memory recall.",
    dimensions: 768,
    displayName: "Vertex AI text-multilingual-embedding-002",
    id: "google_vertex:text-multilingual-embedding-002",
    model: "text-multilingual-embedding-002",
    provider: "google_vertex",
    providerOptions: {
      vertex: {
        outputDimensionality: 768,
      },
    },
  },
  {
    description: "Cohere English embeddings optimized for document search.",
    dimensions: 1024,
    displayName: "Cohere embed-english-v3.0",
    id: "cohere:embed-english-v3.0",
    model: "embed-english-v3.0",
    provider: "cohere",
  },
  {
    description:
      "Cohere multilingual embeddings for broader language coverage.",
    dimensions: 1024,
    displayName: "Cohere embed-multilingual-v3.0",
    id: "cohere:embed-multilingual-v3.0",
    model: "embed-multilingual-v3.0",
    provider: "cohere",
  },
  {
    description:
      "Compact Cohere English embeddings for lighter memory storage.",
    dimensions: 384,
    displayName: "Cohere embed-english-light-v3.0",
    id: "cohere:embed-english-light-v3.0",
    model: "embed-english-light-v3.0",
    provider: "cohere",
  },
  {
    description:
      "Compact Cohere multilingual embeddings for lighter cross-language recall.",
    dimensions: 384,
    displayName: "Cohere embed-multilingual-light-v3.0",
    id: "cohere:embed-multilingual-light-v3.0",
    model: "embed-multilingual-light-v3.0",
    provider: "cohere",
  },
  {
    description:
      "High-dimension Cohere English embeddings for legacy search flows.",
    dimensions: 4096,
    displayName: "Cohere embed-english-v2.0",
    id: "cohere:embed-english-v2.0",
    model: "embed-english-v2.0",
    provider: "cohere",
  },
  {
    description: "Balanced Cohere English embeddings for legacy compatibility.",
    dimensions: 1024,
    displayName: "Cohere embed-english-light-v2.0",
    id: "cohere:embed-english-light-v2.0",
    model: "embed-english-light-v2.0",
    provider: "cohere",
  },
  {
    description:
      "Legacy Cohere multilingual embeddings for older multilingual stores.",
    dimensions: 768,
    displayName: "Cohere embed-multilingual-v2.0",
    id: "cohere:embed-multilingual-v2.0",
    model: "embed-multilingual-v2.0",
    provider: "cohere",
  },
  {
    description: "Mistral embeddings for compact semantic memory retrieval.",
    dimensions: 1024,
    displayName: "Mistral mistral-embed",
    id: "mistral:mistral-embed",
    model: "mistral-embed",
    provider: "mistral",
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
