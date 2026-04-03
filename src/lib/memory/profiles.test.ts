import { describe, expect, it } from "bun:test";

import {
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

  it("keeps profile ids unique", () => {
    expect(
      new Set(MEMORY_EMBEDDING_PROFILES.map((profile) => profile.id)).size,
    ).toBe(MEMORY_EMBEDDING_PROFILES.length);
  });
});
