import { describe, expect, it } from "bun:test";

import {
  getDefaultReasoningEffort,
  getModelAttachmentCapabilities,
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
