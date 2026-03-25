import { beforeEach, describe, expect, it, mock } from "bun:test";

const getProviderConfig = mock(async () => ({ apiKey: "test-key" }));

mock.module("@/lib/ai/providers/resolver", () => ({
  getProviderConfig,
}));

const {
  __internal,
  clearMemoryEmbeddingTemporaryUnavailable,
  markMemoryEmbeddingTemporarilyUnavailable,
  resolveMemoryRuntimeState,
} = await import("./runtime");

const enabledSettings = {
  autoSaveEnabled: true,
  autoSavePerTurnLimit: 3,
  defaultScope: "global" as const,
  enabled: true,
  memoryDimensions: 1536,
  memoryModel: "text-embedding-3-small",
  memoryProvider: "openai" as const,
  retrievalLimit: 6,
};

beforeEach(() => {
  getProviderConfig.mockReset();
  getProviderConfig.mockImplementation(async () => ({ apiKey: "test-key" }));
  __internal.clearMemoryEmbeddingFailureCircuit();
});

describe("memory runtime availability", () => {
  it("returns unavailable when memory is disabled", async () => {
    const state = await resolveMemoryRuntimeState({
      settings: {
        ...enabledSettings,
        enabled: false,
      },
      userId: "user-1",
    });

    expect(state).toEqual({
      available: false,
      reason: "disabled",
      settings: {
        ...enabledSettings,
        enabled: false,
      },
    });
  });

  it("returns unavailable when provider credentials are missing", async () => {
    getProviderConfig.mockImplementation(async () => {
      throw new Error(
        'Provider "openai" is not configured. Add your credentials in Settings > Providers.',
      );
    });

    const state = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(state.available).toBe(false);
    expect(state.reason).toBe("missing_credentials");
  });

  it("returns unavailable when provider credentials are disabled", async () => {
    getProviderConfig.mockImplementation(async () => {
      throw new Error(
        'Provider "openai" is disabled. Enable it in Settings > Providers.',
      );
    });

    const state = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(state.available).toBe(false);
    expect(state.reason).toBe("provider_disabled");
  });

  it("returns unavailable when the configured profile is unsupported", async () => {
    const state = await resolveMemoryRuntimeState({
      settings: {
        ...enabledSettings,
        memoryDimensions: 999,
      },
      userId: "user-1",
    });

    expect(state.available).toBe(false);
    expect(state.reason).toBe("unsupported_profile");
  });

  it("returns available when settings and provider config are valid", async () => {
    const state = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(state).toEqual({
      available: true,
      settings: enabledSettings,
    });
  });

  it("opens and clears the temporary embedding circuit", async () => {
    const profile = {
      dimensions: 1536,
      displayName: "OpenAI text-embedding-3-small",
      id: "openai:text-embedding-3-small",
      model: "text-embedding-3-small",
      provider: "openai",
      description: "Compact OpenAI embeddings for durable memory recall.",
    } as const;

    markMemoryEmbeddingTemporarilyUnavailable({
      error: new Error("provider timeout"),
      profile,
      userId: "user-1",
    });

    const openState = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(openState.available).toBe(false);
    expect(openState.reason).toBe("embedding_temporarily_unavailable");
    expect(openState.retryAt).toBeGreaterThan(Date.now());

    __internal.clearExpiredMemoryEmbeddingFailures(
      Date.now() + __internal.MEMORY_EMBEDDING_FAILURE_TTL_MS + 1,
    );

    const recoveredState = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(recoveredState).toEqual({
      available: true,
      settings: enabledSettings,
    });
  });

  it("clears the temporary embedding circuit explicitly", async () => {
    const profile = {
      dimensions: 1536,
      displayName: "OpenAI text-embedding-3-small",
      id: "openai:text-embedding-3-small",
      model: "text-embedding-3-small",
      provider: "openai",
      description: "Compact OpenAI embeddings for durable memory recall.",
    } as const;

    markMemoryEmbeddingTemporarilyUnavailable({
      error: new Error("provider timeout"),
      profile,
      userId: "user-1",
    });
    clearMemoryEmbeddingTemporaryUnavailable({
      profile,
      userId: "user-1",
    });

    const state = await resolveMemoryRuntimeState({
      settings: enabledSettings,
      userId: "user-1",
    });

    expect(state).toEqual({
      available: true,
      settings: enabledSettings,
    });
  });
});
