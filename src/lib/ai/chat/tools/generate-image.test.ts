import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const generateImageMock = mock(
  async ({ model }: { model: { modelId: string } }) => {
    if (model.modelId === "broken-model") {
      throw new Error("Provider failed");
    }

    return {
      images: [
        {
          base64: "aGVsbG8=",
          mediaType: "image/png",
        },
      ],
      providerMetadata: {
        provider: {
          quality: "high",
        },
      },
      responses: [
        {
          modelId: model.modelId,
          timestamp: new Date("2026-04-03T12:00:00.000Z"),
        },
      ],
      warnings: [{ message: "seed ignored", type: "unsupported-setting" }],
    };
  },
);

mock.module("ai", () => ({
  generateImage: generateImageMock,
}));

mock.module("@/lib/ai/providers/factory", () => ({
  createProviderInstance: mock((_provider: string, _config: unknown) => ({
    imageModel: (modelId: string) => ({ modelId }),
  })),
}));

const { __internal, executeGenerateImage, toGenerateImageModelOutput } =
  await import("./generate-image");

afterEach(() => {
  generateImageMock.mockClear();
  mock.restore();
});

const runtime = {
  imageGeneration: {
    defaultProvider: "openai" as const,
    providers: {
      openai: {
        config: { apiKey: "openai-key" },
        displayName: "OpenAI",
        isCustom: false,
        modelId: "gpt-image-1",
        provider: "openai" as const,
      },
      google: {
        config: { apiKey: "google-key" },
        displayName: "Google",
        isCustom: false,
        modelId: "broken-model",
        provider: "google" as const,
      },
    },
  },
};

describe("executeGenerateImage", () => {
  it("generates images for a single provider", async () => {
    const result = await executeGenerateImage({
      input: {
        count: 1,
        mode: "single",
        prompt: "a lighthouse in fog",
      },
      runtime,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.targets[0]).toMatchObject({
      modelId: "gpt-image-1",
      provider: "openai",
      status: "success",
    });
  });

  it("supports multi-model fan-out with partial failures", async () => {
    const result = await executeGenerateImage({
      input: {
        count: 1,
        mode: "multi_model",
        prompt: "retro travel poster",
        providers: ["openai", "google"],
      },
      runtime,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          status: "success",
        }),
        expect.objectContaining({
          error: "Provider failed",
          provider: "google",
          status: "error",
        }),
      ]),
    );
  });

  it("rejects requests that exceed the total image cap", async () => {
    await expect(
      executeGenerateImage({
        input: {
          count: __internal.MAX_IMAGE_GENERATION_TOTAL_IMAGES,
          mode: "multi_model",
          prompt: "too many",
          providers: ["openai", "google"],
        },
        runtime,
      }),
    ).rejects.toThrow(/safety cap/i);
  });

  it("rejects invalid single-provider model overrides", async () => {
    await expect(
      executeGenerateImage({
        input: {
          count: 1,
          mode: "single",
          modelId: "not-a-real-openai-model",
          prompt: "invalid model",
          provider: "openai",
        },
        runtime,
      }),
    ).rejects.toThrow(/not a valid image model override/i);
  });

  it("omits raw data URLs from model output", () => {
    const sanitized = toGenerateImageModelOutput({
      failureCount: 0,
      mode: "single",
      prompt: "test",
      requestedCount: 1,
      successCount: 1,
      targets: [
        {
          images: [
            {
              dataUrl: "data:image/png;base64,aGVsbG8=",
              mediaType: "image/png",
            },
          ],
          modelId: "gpt-image-1",
          provider: "openai",
          providerMetadataSummary: null,
          responseModelId: "gpt-image-1",
          status: "success",
          warnings: [],
        },
      ],
    });

    expect(
      (sanitized.targets[0] as { images: Array<{ dataUrl: string }> }).images[0]
        ?.dataUrl,
    ).toBe(__internal.IMAGE_DATA_URL_PLACEHOLDER);
  });
});
