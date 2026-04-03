import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/ai/providers/encrypt", () => ({
  decrypt: mock((value: string) => value),
}));

mock.module("@/lib/ai/providers/config-schemas", () => ({
  validateProviderConfig: mock((_provider: string, value: unknown) => value),
}));

mock.module("@/lib/ai/providers/factory", () => ({
  createProviderInstance: mock((provider: string) => ({
    ...(provider === "anthropic"
      ? {}
      : { imageModel: (_modelId: string) => ({}) }),
  })),
}));

const { buildImageGenerationProviderEntries, buildImageGenerationRuntime } =
  await import("./images");

afterEach(() => {
  mock.restore();
});

describe("image generation provider runtime", () => {
  it("detects image-capable configured providers and resolves defaults", () => {
    const providerEntries = buildImageGenerationProviderEntries({
      credentials: [
        {
          encryptedConfig: JSON.stringify({ apiKey: "openai-key" }),
          isEnabled: true,
          provider: "openai",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "anthropic-key" }),
          isEnabled: true,
          provider: "anthropic",
        },
        {
          encryptedConfig: JSON.stringify({ apiKey: "google-key" }),
          isEnabled: false,
          provider: "google",
        },
      ],
      providerSettings: [
        {
          isCustom: false,
          isEnabled: true,
          modelId: "gpt-image-1",
          provider: "openai",
        },
        {
          isCustom: true,
          isEnabled: true,
          modelId: "imagen-4.0-generate-001",
          provider: "google",
        },
      ],
    });

    expect(providerEntries.map((entry) => entry.provider)).toEqual([
      "openai",
      "google",
    ]);
    expect(
      providerEntries.find((entry) => entry.provider === "anthropic"),
    ).toBe(undefined);

    const runtime = buildImageGenerationRuntime({
      providerEntries,
      settings: { defaultProvider: "anthropic" },
    });

    expect(Object.keys(runtime.providers)).toEqual(["openai"]);
    expect(runtime.defaultProvider).toBe("openai");
  });

  it("prioritizes OpenAI first and Google Vertex second", () => {
    const providerEntries = buildImageGenerationProviderEntries({
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
          encryptedConfig: JSON.stringify({ apiKey: "vercel-key" }),
          isEnabled: true,
          provider: "vercel",
        },
      ],
      providerSettings: [
        {
          isCustom: false,
          isEnabled: true,
          modelId: "gpt-image-1",
          provider: "openai",
        },
        {
          isCustom: false,
          isEnabled: true,
          modelId: "imagen-4.0-generate-001",
          provider: "google_vertex",
        },
        {
          isCustom: true,
          isEnabled: true,
          modelId: "gateway-image-model",
          provider: "vercel",
        },
      ],
    });

    expect(providerEntries.map((entry) => entry.provider)).toEqual([
      "openai",
      "google_vertex",
      "vercel",
    ]);
  });

  it("keeps custom-model providers invalid until a custom model is selected", () => {
    const providerEntries = buildImageGenerationProviderEntries({
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
});
