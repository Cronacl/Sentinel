import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: mock((value: string) => value),
}));

mock.module("@/lib/ai/providers/config-schemas", () => ({
  validateProviderConfig: mock((_provider: string, value: unknown) => value),
}));

mock.module("@/lib/ai/providers/factory", () => ({
  createProviderInstance: mock((provider: string) => {
    if (provider === "openai") {
      return {};
    }

    const callableProvider = (() => ({})) as (() => object) & {
      videoModel?: (modelId: string) => object;
    };
    callableProvider.videoModel = (_modelId: string) => ({});
    return callableProvider;
  }),
}));

const {
  buildVideoGenerationProviderEntries,
  buildVideoGenerationRuntime,
  getVideoModelsForProvider,
} = await import("./videos");

afterEach(() => {
  mock.restore();
});

describe("video generation provider runtime", () => {
  it("detects video-capable configured providers and resolves defaults", () => {
    const providerEntries = buildVideoGenerationProviderEntries({
      credentials: [
        {
          encryptedConfig: JSON.stringify({ apiKey: "vertex-key" }),
          isEnabled: true,
          provider: "google_vertex",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "openai-key" }),
          isEnabled: true,
          provider: "openai",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "xai-key" }),
          isEnabled: false,
          provider: "xai",
        },
      ],
      providerSettings: [
        {
          isCustom: false,
          isEnabled: true,
          modelId: "veo-3.1-fast-generate-preview",
          provider: "google_vertex",
        },
        {
          isCustom: false,
          isEnabled: true,
          modelId: "grok-imagine-video",
          provider: "xai",
        },
      ],
    });

    expect(providerEntries.map((entry) => entry.provider)).toEqual([
      "google_vertex",
      "xai",
    ]);
    expect(providerEntries.find((entry) => entry.provider === "openai")).toBe(
      undefined,
    );

    const runtime = buildVideoGenerationRuntime({
      providerEntries,
      settings: { defaultProvider: "openai" },
    });

    expect(Object.keys(runtime.providers)).toEqual(["google_vertex"]);
    expect(runtime.defaultProvider).toBe("google_vertex");
  });

  it("keeps Google Vertex first, then Google, then xAI", () => {
    const providerEntries = buildVideoGenerationProviderEntries({
      credentials: [
        {
          encryptedConfig: JSON.stringify({ apiKey: "google-key" }),
          isEnabled: true,
          provider: "google",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "xai-key" }),
          isEnabled: true,
          provider: "xai",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "vertex-key" }),
          isEnabled: true,
          provider: "google_vertex",
        },
      ],
      providerSettings: [
        {
          isCustom: false,
          isEnabled: true,
          modelId: "veo-3.1-generate-preview",
          provider: "google",
        },
        {
          isCustom: false,
          isEnabled: true,
          modelId: "grok-imagine-video",
          provider: "xai",
        },
        {
          isCustom: false,
          isEnabled: true,
          modelId: "veo-3.1-fast-generate-preview",
          provider: "google_vertex",
        },
      ],
    });

    expect(providerEntries.map((entry) => entry.provider)).toEqual([
      "google_vertex",
      "google",
      "xai",
    ]);
  });

  it("keeps custom-model providers invalid until a custom model is selected", () => {
    const providerEntries = buildVideoGenerationProviderEntries({
      credentials: [
        {
          encryptedConfig: JSON.stringify({ apiKey: "gateway-key" }),
          isEnabled: true,
          provider: "vercel",
        },
      ],
      providerSettings: [],
    });

    expect(providerEntries[0]?.provider).toBe("vercel");
    expect(providerEntries[0]?.hasValidModel).toBe(false);
    expect(providerEntries[0]?.modelId).toBe(null);
  });

  it("includes Veo 2 for Google AI Studio", () => {
    expect(getVideoModelsForProvider("google")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Veo 2",
          id: "veo-2.0-generate-001",
        }),
      ]),
    );
  });
});
