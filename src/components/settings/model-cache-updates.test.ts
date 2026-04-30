import { describe, expect, it } from "bun:test";

import type { RouterOutputs } from "@/trpc/react";
import {
  addSentinelCustomModel,
  removeSentinelCustomModel,
  setSentinelModelEnabled,
  setSentinelProviderConnected,
} from "./model-cache-updates";

type SentinelEngineModels = RouterOutputs["engines"]["models"];

const sentinelModels = [
  {
    contextWindow: 128_000,
    defaultReasoningEffort: "none",
    description: "Latest frontier agentic coding model.",
    displayName: "GPT-5.5",
    engine: "sentinel",
    inputModalities: ["text", "image"],
    isConnected: true,
    isEnabled: true,
    modelId: "openai:gpt-5.5",
    provider: "openai",
    rawModelId: "gpt-5.5",
    supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
  },
  {
    contextWindow: 200_000,
    defaultReasoningEffort: null,
    description: "Anthropic model.",
    displayName: "Claude",
    engine: "sentinel",
    inputModalities: ["text"],
    isConnected: true,
    isEnabled: true,
    modelId: "anthropic:claude-sonnet-4-5",
    provider: "anthropic",
    rawModelId: "claude-sonnet-4-5",
    supportedReasoningEfforts: [],
  },
] satisfies SentinelEngineModels;

describe("model cache updates", () => {
  it("toggles only the matching sentinel provider model", () => {
    const result = setSentinelModelEnabled(sentinelModels, {
      isEnabled: false,
      modelId: "gpt-5.5",
      provider: "openai",
    });

    expect(result?.[0]?.isEnabled).toBe(false);
    expect(result?.[1]?.isEnabled).toBe(true);
  });

  it("toggles every sentinel model for a provider connection state", () => {
    const result = setSentinelProviderConnected(sentinelModels, {
      isConnected: false,
      provider: "openai",
    });

    expect(result?.[0]?.isConnected).toBe(false);
    expect(result?.[1]?.isConnected).toBe(true);
  });

  it("adds custom models in the sentinel engine cache", () => {
    const result = addSentinelCustomModel(sentinelModels, {
      modelId: "gpt-custom",
      provider: "openai",
    });

    expect(result?.at(-1)).toMatchObject({
      displayName: "gpt-custom",
      engine: "sentinel",
      isConnected: true,
      isEnabled: true,
      modelId: "openai:gpt-custom",
      provider: "openai",
      rawModelId: "gpt-custom",
    });
  });

  it("removes custom models from the sentinel engine cache", () => {
    const withCustom = addSentinelCustomModel(sentinelModels, {
      modelId: "gpt-custom",
      provider: "openai",
    });
    const result = removeSentinelCustomModel(withCustom, {
      modelId: "gpt-custom",
      provider: "openai",
    });

    expect(result?.some((model) => model.modelId === "openai:gpt-custom")).toBe(
      false,
    );
    expect(result).toHaveLength(sentinelModels.length);
  });
});
