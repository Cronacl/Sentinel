import { describe, expect, it, mock } from "bun:test";

const getLanguageModel = mock(async (_userId: string, compositeId: string) => ({
  compositeId,
}));

mock.module("../../../providers/resolver", () => ({ getLanguageModel }));

const { getToolSelectionModelId, resolveToolSelectionModel } =
  await import("./model");

describe("tool selection model", () => {
  it("uses provider-prefixed ids for gateway providers", () => {
    expect(getToolSelectionModelId("vercel")).toBe(
      "google/gemini-3.5-flash-lite",
    );
    expect(getToolSelectionModelId("openrouter")).toBe(
      "google/gemini-3.5-flash-lite",
    );
  });

  it("asks Gemini helpers for minimal thinking, as the router used to", async () => {
    await expect(
      resolveToolSelectionModel({ providerId: "google", userId: "user-1" }),
    ).resolves.toMatchObject({
      providerOptions: {
        google: {
          thinkingConfig: { includeThoughts: true, thinkingLevel: "minimal" },
        },
      },
      requestedModelId: "google:gemini-3.5-flash-lite",
    });
  });

  it("uses a Bedrock inference profile id for Claude Haiku 4.5", () => {
    expect(getToolSelectionModelId("amazon_bedrock")).toBe(
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("has a DeepSeek model instead of falling back to an OpenAI id", async () => {
    expect(getToolSelectionModelId("deepseek")).toBe("deepseek-flash");
    await expect(
      resolveToolSelectionModel({ providerId: "deepseek", userId: "user-1" }),
    ).resolves.toMatchObject({
      requestedModelId: "deepseek:deepseek-flash",
      responseModelId: "deepseek-flash",
    });
  });
});
