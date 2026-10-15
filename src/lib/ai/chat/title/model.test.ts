import { describe, expect, it, mock } from "bun:test";

import { AI_PROVIDERS, type AIProvider } from "@/server/db/enums";

const getLanguageModel = mock(async (_userId: string, compositeId: string) => ({
  compositeId,
}));

mock.module("../../providers/resolver", () => ({ getLanguageModel }));

const { findModel, getModelsForProvider } =
  await import("../../providers/models");
const { getThreadTitleModelId, resolveThreadTitleModel } =
  await import("./model");
const { getToolSelectionModelId } = await import("../tools/selection/model");

const CHAT_PROVIDERS = AI_PROVIDERS.filter(
  (provider) => getModelsForProvider(provider).length > 0,
);

describe("helper model maps", () => {
  it("maps every provider to its dedicated fast title model", () => {
    expect(
      Object.fromEntries(
        CHAT_PROVIDERS.map((provider) => [
          provider,
          getThreadTitleModelId(provider),
        ]),
      ),
    ).toEqual({
      amazon_bedrock: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      anthropic: "claude-haiku-4-5",
      azure: "gpt-4.1-mini",
      cohere: "command-r7b-12-2024",
      deepseek: "deepseek-flash",
      google: "gemini-3.5-flash-lite",
      google_vertex: "gemini-3.5-flash-lite",
      groq: "llama-3.1-8b-instant",
      mistral: "mistral-small-latest",
      moonshotai: "kimi-k2.6",
      ollama: "llama3.2",
      openai: "gpt-6-luna",
      openrouter: "google/gemini-3.5-flash-lite",
      vercel: "google/gemini-3.5-flash-lite",
      xai: "grok-4.20-non-reasoning",
    });
  });

  it("only points at built-in catalog models", () => {
    for (const provider of CHAT_PROVIDERS) {
      // Azure ids are deployment names chosen by the user.
      if (provider === "azure") {
        continue;
      }
      expect(
        findModel(provider, getThreadTitleModelId(provider)),
      ).toBeDefined();
      expect(
        findModel(provider, getToolSelectionModelId(provider)),
      ).toBeDefined();
    }
  });

  it("falls back to the OpenAI helper model for media-only providers", () => {
    const mediaProvider: AIProvider = "fal";
    expect(getThreadTitleModelId(mediaProvider)).toBe("gpt-6-luna");
    expect(getToolSelectionModelId(mediaProvider)).toBe("gpt-6-luna");
  });

  it("resolves the title model through the provider resolver", async () => {
    await expect(
      resolveThreadTitleModel({ providerId: "deepseek", userId: "user-1" }),
    ).resolves.toEqual({
      languageModel: { compositeId: "deepseek:deepseek-flash" },
      providerId: "deepseek",
      // Helper calls ask for the least reasoning the model accepts.
      providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      requestedModelId: "deepseek:deepseek-flash",
      responseModelId: "deepseek-flash",
    });
    expect(getLanguageModel).toHaveBeenCalledWith(
      "user-1",
      "deepseek:deepseek-flash",
    );
  });

  it("switches reasoning off on OpenAI helper models and leaves Claude Haiku alone", async () => {
    await expect(
      resolveThreadTitleModel({ providerId: "openai", userId: "user-1" }),
    ).resolves.toMatchObject({
      providerOptions: {
        openai: { reasoningEffort: "none", reasoningSummary: "detailed" },
      },
      requestedModelId: "openai:gpt-6-luna",
    });

    const anthropic = await resolveThreadTitleModel({
      providerId: "anthropic",
      userId: "user-1",
    });
    expect(anthropic.requestedModelId).toBe("anthropic:claude-haiku-4-5");
    expect(anthropic.providerOptions).toBe(undefined);
  });
});
