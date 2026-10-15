import { describe, expect, it } from "bun:test";

import {
  DEFAULT_MEMORY_EMBEDDING_PROFILE,
  getMemoryEmbeddingProfileById,
  MEMORY_EMBEDDING_PROFILE_IDS,
  MEMORY_EMBEDDING_PROFILES,
} from "./profiles";

describe("memory embedding profiles", () => {
  it("includes additional provider-backed embedding profiles", () => {
    expect(MEMORY_EMBEDDING_PROFILE_IDS).toContain(
      "google:gemini-embedding-001",
    );
    expect(MEMORY_EMBEDDING_PROFILE_IDS).toContain(
      "google_vertex:text-embedding-005",
    );
    expect(MEMORY_EMBEDDING_PROFILE_IDS).toContain("cohere:embed-english-v3.0");
    expect(MEMORY_EMBEDDING_PROFILE_IDS).toContain("mistral:mistral-embed");
  });

  it("pins explicit dimensions for providers that support configurable output sizes", () => {
    expect(
      getMemoryEmbeddingProfileById("google:gemini-embedding-001"),
    ).toMatchObject({
      dimensions: 3072,
      providerOptions: {
        google: {
          outputDimensionality: 3072,
        },
      },
    });

    expect(
      getMemoryEmbeddingProfileById("google_vertex:text-embedding-005"),
    ).toMatchObject({
      dimensions: 768,
      providerOptions: {
        vertex: {
          outputDimensionality: 768,
        },
      },
    });
  });

  it("adds the current Gemini and Cohere embedding models with pinned sizes", () => {
    expect(
      getMemoryEmbeddingProfileById("google:gemini-embedding-2"),
    ).toMatchObject({
      dimensions: 3072,
      model: "gemini-embedding-2",
      providerOptions: { google: { outputDimensionality: 3072 } },
    });
    expect(
      getMemoryEmbeddingProfileById("google_vertex:gemini-embedding-2"),
    ).toMatchObject({
      dimensions: 3072,
      providerOptions: { vertex: { outputDimensionality: 3072 } },
    });
    expect(getMemoryEmbeddingProfileById("cohere:embed-v4.0")).toMatchObject({
      dimensions: 1536,
      providerOptions: { cohere: { outputDimension: 1536 } },
    });
  });

  it("keeps the default and every existing profile id so stored memory still resolves", () => {
    expect(DEFAULT_MEMORY_EMBEDDING_PROFILE.id).toBe(
      "openai:text-embedding-3-small",
    );
    for (const profileId of [
      "openai:text-embedding-ada-002",
      "google:gemini-embedding-001",
      "google_vertex:text-embedding-005",
      "cohere:embed-english-v2.0",
      "mistral:mistral-embed",
    ]) {
      expect(MEMORY_EMBEDDING_PROFILE_IDS).toContain(profileId);
    }
    expect(MEMORY_EMBEDDING_PROFILES.map((profile) => profile.id)).toEqual([
      ...MEMORY_EMBEDDING_PROFILE_IDS,
    ]);
  });

  it("keeps profile ids unique", () => {
    expect(
      new Set(MEMORY_EMBEDDING_PROFILES.map((profile) => profile.id)).size,
    ).toBe(MEMORY_EMBEDDING_PROFILES.length);
  });
});
