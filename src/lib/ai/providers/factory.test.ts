import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateText, tool, type LanguageModel } from "ai";
import { z } from "zod";

mock.module("server-only", () => ({}));

const { createProviderInstance, createProviderLanguageModel } =
  await import("./factory");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Sends one request through the real provider and returns the JSON body it
// posted. The stubbed API answers with an error; only the request matters.
async function captureRequestBody(model: unknown) {
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ error: { message: "stubbed" } }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }) as unknown as typeof fetch;

  await generateText({
    maxRetries: 0,
    model: model as LanguageModel,
    prompt: "List the files.",
    tools: {
      list: tool({
        inputSchema: z.object({
          path: z.string(),
          recursive: z.boolean().optional(),
        }),
      }),
    },
  }).catch(() => undefined);

  return body;
}

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

describe("createProviderLanguageModel", () => {
  it("uses the Chat Completions API for Ollama", () => {
    const model = createProviderLanguageModel(
      "ollama",
      { baseURL: "http://localhost:11434/v1" },
      "llama3.2",
    ) as { modelId: string; provider: string };

    expect(model.provider).toBe("openai.chat");
    expect(model.modelId).toBe("llama3.2");
  });

  it("keeps the Responses API for OpenAI and xAI", () => {
    const openai = createProviderLanguageModel(
      "openai",
      { apiKey: "openai-key" },
      "gpt-5.2",
    ) as { provider: string };
    const xai = createProviderLanguageModel(
      "xai",
      { apiKey: "xai-key" },
      "grok-4",
    ) as { provider: string };

    expect(openai.provider).toBe("openai.responses");
    expect(xai.provider).toBe("xai.responses");
  });
});

describe("provider request defaults", () => {
  it("turns off xAI response storage", async () => {
    const body = await captureRequestBody(
      createProviderLanguageModel("xai", { apiKey: "xai-key" }, "grok-4"),
    );

    expect(body).toMatchObject({
      include: ["reasoning.encrypted_content"],
      model: "grok-4",
      store: false,
    });
  });

  // AI SDK 6 left `strict` out, and the Responses API then applied its own
  // strict schema normalisation, which filled optional parameters with "".
  // AI SDK 7 sends strict: false unless a tool opts in; Sentinel keeps that.
  it("sends OpenAI and Azure Responses function tools as non-strict", async () => {
    const openaiBody = await captureRequestBody(
      createProviderLanguageModel(
        "openai",
        { apiKey: "openai-key" },
        "gpt-5.2",
      ),
    );
    const azureBody = await captureRequestBody(
      createProviderLanguageModel(
        "azure",
        {
          apiKey: "azure-key",
          baseURL: "https://sentinel-test.openai.azure.com/openai",
        },
        "gpt-5.2",
      ),
    );

    for (const body of [openaiBody, azureBody]) {
      expect(body?.tools).toEqual([
        expect.objectContaining({
          name: "list",
          strict: false,
          type: "function",
        }),
      ]);
    }
  });
});
