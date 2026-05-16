import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  getExactContextWindowUsage,
  getLatestCompletedAssistantContextWindow,
  getLatestCompletedAssistantInputTokens,
} from "./context-window";

describe("context-window helpers", () => {
  it("returns null when no completed assistant has input tokens", () => {
    expect(
      getExactContextWindowUsage({
        contextWindow: 128_000,
        messages: [
          {
            id: "user-1",
            metadata: {},
            parts: [{ text: "hello", type: "text" }],
            role: "user",
          },
          {
            id: "assistant-1",
            metadata: { status: "streaming", usage: { inputTokens: 400 } },
            parts: [{ text: "working", type: "text" }],
            role: "assistant",
          },
        ],
      }),
    ).toBeNull();
  });

  it("reads the latest completed assistant input tokens", () => {
    const messages: ThreadUIMessage[] = [
      {
        id: "assistant-1",
        metadata: { status: "completed", usage: { inputTokens: 450 } },
        parts: [{ text: "first", type: "text" }],
        role: "assistant" as const,
      },
      {
        id: "assistant-2",
        metadata: { status: "error", usage: { inputTokens: 900 } },
        parts: [{ text: "second", type: "text" }],
        role: "assistant" as const,
      },
      {
        id: "assistant-3",
        metadata: { status: "completed", usage: { inputTokens: 600 } },
        parts: [{ text: "third", type: "text" }],
        role: "assistant" as const,
      },
    ];

    expect(getLatestCompletedAssistantInputTokens(messages)).toBe(600);
    expect(getLatestCompletedAssistantContextWindow(messages)).toBeNull();
    expect(
      getExactContextWindowUsage({
        contextWindow: 1_200,
        messages,
      }),
    ).toEqual({
      contextWindow: 1_200,
      inputTokens: 600,
      source: "model",
      usedPercent: 50,
      usedRatio: 0.5,
    });
  });

  it("prefers the provider-reported context window from the latest completed assistant", () => {
    const messages: ThreadUIMessage[] = [
      {
        id: "assistant-1",
        metadata: {
          status: "completed",
          usage: { contextWindow: 1_000_000, inputTokens: 600 },
        },
        parts: [{ text: "latest", type: "text" }],
        role: "assistant" as const,
      },
    ];

    expect(getLatestCompletedAssistantContextWindow(messages)).toBe(1_000_000);
    expect(
      getExactContextWindowUsage({
        contextWindow: 200_000,
        messages,
      }),
    ).toEqual({
      contextWindow: 1_000_000,
      inputTokens: 600,
      source: "provider",
      usedPercent: 0,
      usedRatio: 0.0006,
    });
  });

  it("uses the fixed window override when provided", () => {
    expect(
      getExactContextWindowUsage({
        contextWindow: 10_000,
        fixedWindowSize: 400,
        messages: [
          {
            id: "assistant-1",
            metadata: { status: "completed", usage: { inputTokens: 300 } },
            parts: [{ text: "done", type: "text" }],
            role: "assistant",
          },
        ],
        useFixedWindow: true,
      }),
    ).toEqual({
      contextWindow: 400,
      inputTokens: 300,
      source: "fixed",
      usedPercent: 75,
      usedRatio: 0.75,
    });
  });
});
