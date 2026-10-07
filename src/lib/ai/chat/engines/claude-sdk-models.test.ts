import { describe, expect, it } from "bun:test";

import {
  buildClaudeFallbackModels,
  resolveClaudeContextWindow,
  resolveClaudeSdkEffort,
  toClaudeModelInfo,
} from "./claude-sdk/models";

describe("toClaudeModelInfo", () => {
  it("keeps xhigh, drops max until Sentinel can carry it, and defaults from the manifest", () => {
    const model = toClaudeModelInfo({
      description: "Opus 5.5 · Most capable for complex work",
      displayName: "Opus 5.5",
      supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
      supportsEffort: true,
      value: "claude-opus-5-5",
    });

    expect(
      model.supportedReasoningEfforts.map((option) => option.effort),
    ).toEqual(["low", "medium", "high", "xhigh"]);
    expect(model.supportedReasoningEfforts[3]?.label).toBe("Extra high");
    expect(model.defaultReasoningEffort).toBe("medium");
    expect(model.contextWindow).toBe(200_000);
  });

  it("resolves aliases through resolvedModel and the [1m] suffix", () => {
    expect(
      toClaudeModelInfo({
        description: "Sonnet 5.5 with 1M context",
        displayName: "Sonnet (1M context)",
        resolvedModel: "claude-sonnet-5-5",
        supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
        value: "sonnet[1m]",
      }),
    ).toEqual(
      expect.objectContaining({
        contextWindow: 1_000_000,
        defaultReasoningEffort: "high",
        id: "sonnet[1m]",
      }),
    );
    expect(
      toClaudeModelInfo({
        description: "Opus 4.8",
        displayName: "Opus 4.8",
        resolvedModel: "claude-opus-4-8",
        supportedEffortLevels: ["low", "medium", "high", "xhigh"],
        value: "opus",
      }).contextWindow,
    ).toBe(1_000_000);
  });

  it("offers no effort for models that do not support it", () => {
    const model = toClaudeModelInfo({
      description: "Haiku 4.5 · Fastest",
      displayName: "Haiku 4.5",
      supportsEffort: false,
      value: "claude-haiku-4-5",
    });

    expect(model.supportedReasoningEfforts).toEqual([]);
    expect(model.defaultReasoningEffort).toBe("medium");
  });

  it("keeps the legacy low/medium/high list for CLIs that predate effort metadata", () => {
    const model = toClaudeModelInfo({
      description: "Vision-capable Claude model",
      displayName: "Claude Sonnet 4.5",
      value: "claude-sonnet-4-5",
    });

    expect(
      model.supportedReasoningEfforts.map((option) => option.effort),
    ).toEqual(["low", "medium", "high"]);
    expect(model.defaultReasoningEffort).toBe("high");
    expect(model.inputModalities).toEqual(["text", "image"]);
  });
});

describe("resolveClaudeContextWindow", () => {
  it("returns undefined for unknown models", () => {
    expect(resolveClaudeContextWindow({ value: "my-proxy-model" })).toBe(
      undefined,
    );
  });
});

describe("buildClaudeFallbackModels", () => {
  it("offers the current Claude lineup with Fable 5.1 as the default", () => {
    const models = buildClaudeFallbackModels();

    expect(models.map((model) => model.id)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-fable-5-1",
      "claude-haiku-4-5",
    ]);
    expect(
      models.filter((model) => model.isDefault).map((model) => model.id),
    ).toEqual(["claude-fable-5-1"]);
    expect(models.every((model) => model.contextWindow === 200_000)).toBe(true);
    expect(
      models.find((model) => model.id === "claude-haiku-4-5")
        ?.supportedReasoningEfforts,
    ).toEqual([]);
    expect(models.find((model) => model.id === "claude-opus-5-5")).toEqual(
      expect.objectContaining({
        defaultReasoningEffort: "medium",
        inputModalities: ["text", "image"],
      }),
    );
  });
});

describe("resolveClaudeSdkEffort", () => {
  const models = [
    toClaudeModelInfo({
      description: "Opus 5.5",
      displayName: "Opus 5.5",
      supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
      value: "claude-opus-5-5",
    }),
    toClaudeModelInfo({
      description: "Sonnet 4.6",
      displayName: "Sonnet 4.6",
      supportedEffortLevels: ["low", "medium", "high", "max"],
      value: "claude-sonnet-4-6",
    }),
    toClaudeModelInfo({
      description: "Haiku",
      displayName: "Haiku 4.5",
      supportsEffort: false,
      value: "claude-haiku-4-5",
    }),
  ];

  it("sends nothing when no effort is set", () => {
    expect(
      resolveClaudeSdkEffort({
        modelId: "claude-opus-5-5",
        models,
        reasoningEffort: null,
      }),
    ).toBeUndefined();
  });

  it("passes supported levels through", () => {
    expect(
      resolveClaudeSdkEffort({
        modelId: "claude-opus-5-5",
        models,
        reasoningEffort: "xhigh",
      }),
    ).toBe("xhigh");
  });

  it("clamps to the highest supported level at or below the request", () => {
    expect(
      resolveClaudeSdkEffort({
        modelId: "claude-sonnet-4-6",
        models,
        reasoningEffort: "xhigh",
      }),
    ).toBe("high");
  });

  it("omits effort for models without effort support", () => {
    expect(
      resolveClaudeSdkEffort({
        modelId: "claude-haiku-4-5",
        models,
        reasoningEffort: "high",
      }),
    ).toBeUndefined();
  });

  it("lets the CLI decide for unknown models and maps Sentinel-only levels", () => {
    expect(
      resolveClaudeSdkEffort({
        modelId: "claude-future-6",
        models,
        reasoningEffort: "high",
      }),
    ).toBe("high");
    expect(
      resolveClaudeSdkEffort({
        modelId: null,
        models: null,
        reasoningEffort: "none",
      }),
    ).toBe("low");
  });
});
