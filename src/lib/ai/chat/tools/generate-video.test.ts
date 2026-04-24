import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const generateVideoMock = mock(
  async ({
    model,
    prompt,
    providerOptions,
  }: {
    model: { modelId: string };
    prompt: string | { image: Uint8Array; text: string };
    providerOptions?: Record<string, unknown>;
  }) => {
    if (model.modelId === "broken-model") {
      throw new Error("Provider failed");
    }

    return {
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
      videos: [
        {
          mediaType: "video/mp4",
          uint8Array:
            typeof prompt === "string"
              ? Uint8Array.from([1, 2, 3])
              : Uint8Array.from([prompt.image.length, 9, 9]),
        },
      ],
      warnings: providerOptions
        ? [
            {
              details: JSON.stringify(providerOptions),
              type: "provider-options",
            },
          ]
        : [{ details: "seed ignored", type: "unsupported-setting" }],
    };
  },
);

const writeGeneratedMediaArtifactMock = mock(
  async ({
    targetId,
    threadId,
    userId,
  }: {
    mediaType: string;
    targetId: string;
    threadId: string;
    userId: string;
  }) => ({
    absolutePath: `/tmp/${targetId}.mp4`,
    artifactPath: `${userId}/${threadId}/${targetId}.mp4`,
  }),
);

const loadThreadMessagesMock = mock(async () => []);

mock.module("ai", () => ({
  experimental_generateVideo: generateVideoMock,
  generateImage: mock(async () => {
    throw new Error("unexpected image generation call");
  }),
}));

mock.module("@/lib/ai/providers/factory", () => ({
  createProviderInstance: mock((_provider: string, _config: unknown) => ({
    videoModel: (modelId: string) => ({ modelId }),
  })),
}));

mock.module("@/lib/generated-media", () => ({
  writeGeneratedMediaArtifact: writeGeneratedMediaArtifactMock,
}));

mock.module("@/lib/ai/chat/persistence", () => ({
  loadThreadMessages: loadThreadMessagesMock,
}));

mock.module("@/lib/ai/messages/branches", () => ({
  buildActiveThreadMessages: (records: Array<any>) =>
    records.map((record) => ({
      id: record.messageId,
      metadata: {},
      parts: record.parts,
      role: record.role,
    })),
}));

const { __internal, executeGenerateVideo, toGenerateVideoModelOutput } =
  await import("./generate-video");

afterEach(() => {
  generateVideoMock.mockClear();
  writeGeneratedMediaArtifactMock.mockClear();
  loadThreadMessagesMock.mockReset();
  mock.restore();
});

const runtime = {
  sourceMessageId: "message-1",
  threadId: "thread-1",
  userId: "user-1",
  videoGeneration: {
    defaultProvider: "google_vertex" as const,
    providers: {
      google_vertex: {
        config: { apiKey: "vertex-key" },
        displayName: "Google Vertex",
        isCustom: false,
        modelId: "veo-3.1-fast-generate-preview",
        provider: "google_vertex" as const,
      },
      xai: {
        config: { apiKey: "xai-key" },
        displayName: "xAI",
        isCustom: false,
        modelId: "grok-imagine-video",
        provider: "xai" as const,
      },
      klingai: {
        config: { accessKey: "access", secretKey: "secret" },
        displayName: "Kling AI",
        isCustom: false,
        modelId: "kling-v3.0-t2v",
        provider: "klingai" as const,
      },
      bytedance: {
        config: { apiKey: "ark-key" },
        displayName: "ByteDance",
        isCustom: false,
        modelId: "dreamina-seedance-2-0-260128",
        provider: "bytedance" as const,
      },
      fal: {
        config: { apiKey: "fal-key" },
        displayName: "Fal",
        isCustom: false,
        modelId: "broken-model",
        provider: "fal" as const,
      },
    },
  },
};

function toDataUrl(value: Buffer, mediaType: string) {
  return `data:${mediaType};base64,${value.toString("base64")}`;
}

describe("executeGenerateVideo", () => {
  it("generates videos for a single provider", async () => {
    const result = await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "a quiet camera push through a bookshop",
      },
      runtime,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.targets[0]).toMatchObject({
      modelId: "veo-3.1-fast-generate-preview",
      provider: "google_vertex",
      status: "success",
    });
  });

  it("supports image-to-video using the current source message attachment", async () => {
    loadThreadMessagesMock.mockResolvedValueOnce([
      {
        messageId: "message-1",
        parts: [
          {
            filename: "reference.png",
            mediaType: "image/png",
            type: "file",
            url: toDataUrl(Buffer.from("reference-image"), "image/png"),
          },
        ],
        role: "user",
      },
    ]);

    const result = await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "animate this image into a slow cinematic move",
        referenceImageFilename: "reference.png",
      },
      runtime,
    });

    expect(loadThreadMessagesMock).toHaveBeenCalledWith("thread-1");
    expect(generateVideoMock).toHaveBeenCalled();
    expect(result.successCount).toBe(1);
  });

  it("treats placeholder reference image values as absent", async () => {
    const result = await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "a short cinematic video of Socrates in Athens",
        referenceImageFilename: "none" as any,
      },
      runtime,
    });

    expect(loadThreadMessagesMock).not.toHaveBeenCalled();
    expect(generateVideoMock).toHaveBeenCalled();
    expect(result.successCount).toBe(1);
  });

  it("fails clearly when the requested reference image is missing", async () => {
    loadThreadMessagesMock.mockResolvedValueOnce([
      {
        messageId: "message-1",
        parts: [],
        role: "user",
      },
    ]);

    await expect(
      executeGenerateVideo({
        input: {
          count: 1,
          mode: "single",
          prompt: "a short cinematic video of Socrates in Athens",
          referenceImageFilename: "reference.png",
        },
        runtime,
      }),
    ).rejects.toThrow(/does not contain any image attachments/i);
  });

  it("returns per-target errors for incompatible multi-model image-to-video requests", async () => {
    loadThreadMessagesMock.mockResolvedValueOnce([
      {
        messageId: "message-1",
        parts: [
          {
            filename: "reference.png",
            mediaType: "image/png",
            type: "file",
            url: toDataUrl(Buffer.from("reference-image"), "image/png"),
          },
        ],
        role: "user",
      },
    ]);

    const result = await executeGenerateVideo({
      input: {
        count: 1,
        mode: "multi_model",
        prompt: "animate this image into a slow cinematic move",
        providers: ["google_vertex", "klingai"],
        referenceImageFilename: "reference.png",
      },
      runtime,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google_vertex",
          status: "success",
        }),
        expect.objectContaining({
          error: expect.stringMatching(/does not support image-to-video/i),
          provider: "klingai",
          status: "error",
        }),
      ]),
    );
  });

  it("supports multi-model fan-out with partial failures", async () => {
    const result = await executeGenerateVideo({
      input: {
        count: 1,
        mode: "multi_model",
        prompt: "a bright aerial sweep over the coastline",
        providers: ["google_vertex", "fal"],
      },
      runtime,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google_vertex",
          status: "success",
        }),
        expect.objectContaining({
          error: "Provider failed",
          provider: "fal",
          status: "error",
        }),
      ]),
    );
  });

  it("applies documented provider defaults for xAI, Kling AI, and ByteDance polling", async () => {
    await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "a chicken flying into the sunset",
        provider: "xai",
      },
      runtime,
    });

    await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "a neon cyberpunk alley",
        provider: "klingai",
      },
      runtime,
    });

    await executeGenerateVideo({
      input: {
        count: 1,
        mode: "single",
        prompt: "a serene mountain landscape at sunrise",
        provider: "bytedance",
      },
      runtime,
    });

    expect(generateVideoMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        providerOptions: { xai: { pollTimeoutMs: 600000 } },
      }),
    );
    expect(generateVideoMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        providerOptions: { klingai: { pollTimeoutMs: 600000 } },
      }),
    );
    expect(generateVideoMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        providerOptions: { bytedance: { pollTimeoutMs: 600000 } },
      }),
    );
  });

  it("rejects invalid single-provider model overrides", async () => {
    await expect(
      executeGenerateVideo({
        input: {
          count: 1,
          mode: "single",
          modelId: "not-a-real-video-model",
          prompt: "invalid model",
          provider: "google_vertex",
        },
        runtime,
      }),
    ).rejects.toThrow(/not a valid video model override/i);
  });

  it("omits artifact paths from model output", () => {
    const sanitized = toGenerateVideoModelOutput({
      failureCount: 0,
      mode: "single",
      prompt: "test",
      requestedCount: 1,
      successCount: 1,
      targets: [
        {
          modelId: "veo-3.1-fast-generate-preview",
          provider: "google_vertex",
          providerMetadataSummary: null,
          responseModelId: "veo-3.1-fast-generate-preview",
          status: "success",
          videos: [
            {
              artifactPath: "user-1/thread-1/google_vertex.mp4",
              mediaType: "video/mp4",
            },
          ],
          warnings: [],
        },
      ],
    });

    expect(
      (sanitized.targets[0] as { videos: Array<{ artifactPath: string }> })
        .videos[0]?.artifactPath,
    ).toBe(__internal.VIDEO_ARTIFACT_PATH_PLACEHOLDER);
  });
});
