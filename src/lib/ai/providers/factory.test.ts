import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { createProviderInstance } = await import("./factory");

describe("createProviderInstance", () => {
  it("creates native Black Forest Labs, Fal, and Replicate providers", () => {
    const blackForestLabs = createProviderInstance("black_forest_labs", {
      apiKey: "bfl-key",
    }) as {
      imageModel?: (modelId: string) => unknown;
    };
    const fal = createProviderInstance("fal", {
      apiKey: "fal-key",
    }) as {
      imageModel?: (modelId: string) => unknown;
      videoModel?: (modelId: string) => unknown;
    };
    const replicate = createProviderInstance("replicate", {
      apiToken: "replicate-token",
    }) as {
      imageModel?: (modelId: string) => unknown;
      videoModel?: (modelId: string) => unknown;
    };

    expect(typeof blackForestLabs.imageModel).toBe("function");
    expect(typeof fal.imageModel).toBe("function");
    expect(typeof fal.videoModel).toBe("function");
    expect(typeof replicate.imageModel).toBe("function");
    expect(typeof replicate.videoModel).toBe("function");
  });

  it("creates a Kling AI video provider", () => {
    const klingai = createProviderInstance("klingai", {
      accessKey: "access-key",
      secretKey: "secret-key",
    }) as {
      videoModel?: (modelId: string) => unknown;
    };

    expect(typeof klingai.videoModel).toBe("function");
  });

  it("creates a ByteDance video provider", () => {
    const bytedance = createProviderInstance("bytedance", {
      apiKey: "ark-key",
    }) as {
      video?: (modelId: string) => unknown;
      videoModel?: (modelId: string) => unknown;
    };

    expect(
      typeof bytedance.video === "function" ||
        typeof bytedance.videoModel === "function",
    ).toBe(true);
  });

  it("creates a DeepSeek language provider", () => {
    const deepseek = createProviderInstance("deepseek", {
      apiKey: "deepseek-key",
    }) as {
      languageModel?: (modelId: string) => unknown;
    };

    expect(typeof deepseek.languageModel).toBe("function");
  });

  it("creates a DeepSeek language provider with a custom base URL", () => {
    const deepseek = createProviderInstance("deepseek", {
      apiKey: "deepseek-key",
      baseURL: "https://deepseek.example.test",
    }) as {
      languageModel?: (modelId: string) => unknown;
    };

    expect(typeof deepseek.languageModel).toBe("function");
  });
});
