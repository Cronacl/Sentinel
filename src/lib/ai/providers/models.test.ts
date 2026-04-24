import { describe, expect, it } from "bun:test";

import {
  getModelsForProvider,
  getDefaultReasoningEffort,
  getModelAttachmentCapabilities,
  getReasoningProviderOptions,
  getSupportedReasoningEfforts,
} from "./models";

describe("model attachment capabilities", () => {
  it("returns explicit native file support for known multimodal models", () => {
    expect(getModelAttachmentCapabilities("openai", "gpt-5.2")).toEqual({
      supportsImages: true,
      supportsPdf: true,
      supportsTextFiles: true,
    });
  });

  it("defaults unknown models to conservative no-file support", () => {
    expect(
      getModelAttachmentCapabilities("openai", "custom-unknown-model"),
    ).toEqual({
      supportsImages: false,
      supportsPdf: false,
      supportsTextFiles: false,
    });
  });

  it("keeps DeepSeek text models on conservative no-file support", () => {
    expect(getModelAttachmentCapabilities("deepseek", "deepseek-chat")).toEqual(
      {
        supportsImages: false,
        supportsPdf: false,
        supportsTextFiles: false,
      },
    );
  });
});

describe("DeepSeek model catalog", () => {
  it("includes the native DeepSeek chat and reasoner models", () => {
    expect(getModelsForProvider("deepseek").map((model) => model.id)).toEqual([
      "deepseek-chat",
      "deepseek-reasoner",
    ]);
  });

  it("maps DeepSeek reasoner controls to thinking provider options", () => {
    expect(getDefaultReasoningEffort("deepseek", "deepseek-reasoner")).toBe(
      "high",
    );
    expect(
      getSupportedReasoningEfforts("deepseek", "deepseek-reasoner"),
    ).toEqual(["none", "high"]);
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-reasoner", "high"),
    ).toEqual({
      deepseek: {
        thinking: { type: "enabled" },
      },
    });
    expect(
      getReasoningProviderOptions("deepseek", "deepseek-reasoner", "none"),
    ).toEqual({
      deepseek: {
        thinking: { type: "disabled" },
      },
    });
  });
});

describe("OpenAI reasoning configs", () => {
  it("keeps frontier GPT-5.4 models on the full OpenAI effort set", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.4")).toBe("none");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.4")).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("keeps GPT-5.2 on the full OpenAI effort set", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.2")).toBe("none");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.2")).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("limits GPT-5.2 Pro to medium and above", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.2-pro")).toBe("medium");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.2-pro")).toEqual([
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("uses none as the default for GPT-5.1 models", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.1")).toBe("none");
    expect(getSupportedReasoningEfforts("openai", "gpt-5.1")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("keeps GPT-5 Pro fixed to high reasoning", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5-pro")).toBe("high");
    expect(getSupportedReasoningEfforts("openai", "gpt-5-pro")).toEqual([
      "high",
    ]);
  });

  it("preserves legacy GPT-5 minimal reasoning behavior", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5")).toBe("minimal");
    expect(getSupportedReasoningEfforts("openai", "gpt-5")).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
  });
});
