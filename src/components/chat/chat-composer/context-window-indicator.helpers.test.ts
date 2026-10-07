import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  CODEX_CONTEXT_WARNING_PERCENT,
  resolveComposerContextWindowIndicator,
} from "./context-window-indicator.helpers";

function assistantMessage(usage: {
  contextWindow?: number;
  inputTokens?: number;
}): ThreadUIMessage {
  return {
    id: "assistant-1",
    metadata: { status: "completed", usage },
    parts: [{ text: "done", type: "text" }],
    role: "assistant",
  } as ThreadUIMessage;
}

const compactionSettings = {
  contextCompactionEnabled: true,
  contextCompactionFixedWindowSize: 50_000,
  contextCompactionUseFixedWindow: true,
  contextCompactionWindowPercent: 70,
};

describe("resolveComposerContextWindowIndicator", () => {
  it("shows Codex usage from the window Codex reported", () => {
    const indicator = resolveComposerContextWindowIndicator({
      engine: "codex",
      // Sentinel's fixed compaction window must not apply to Codex.
      generalSettings: compactionSettings,
      hasSelectedModel: true,
      messages: [
        assistantMessage({ contextWindow: 272_000, inputTokens: 68_000 }),
      ],
      modelContextWindow: undefined,
    });

    expect(indicator).toEqual({
      compactionEnabled: true,
      compactionNote: "Codex compacts its own context when the window fills.",
      compactionWindowPercent: CODEX_CONTEXT_WARNING_PERCENT,
      contextWindow: 272_000,
      contextWindowMode: "provider",
      inputTokens: 68_000,
      modelContextWindow: undefined,
      usedPercent: 25,
    });
  });

  it("hides the Codex indicator rather than guessing a window", () => {
    expect(
      resolveComposerContextWindowIndicator({
        engine: "codex",
        hasSelectedModel: true,
        messages: [assistantMessage({ inputTokens: 68_000 })],
      }),
    ).toBeNull();
    expect(
      resolveComposerContextWindowIndicator({
        engine: "codex",
        hasSelectedModel: true,
        messages: [],
      }),
    ).toBeNull();
  });

  it("keeps the Sentinel indicator on its compaction settings", () => {
    const indicator = resolveComposerContextWindowIndicator({
      engine: "sentinel",
      generalSettings: compactionSettings,
      hasSelectedModel: true,
      messages: [assistantMessage({ inputTokens: 25_000 })],
      modelContextWindow: 200_000,
    });

    expect(indicator).toEqual({
      compactionEnabled: true,
      compactionWindowPercent: 70,
      contextWindow: 50_000,
      contextWindowMode: "fixed",
      inputTokens: 25_000,
      modelContextWindow: 200_000,
      usedPercent: 50,
    });
  });

  it("shows nothing without a selected model or for other engines", () => {
    const messages = [
      assistantMessage({ contextWindow: 200_000, inputTokens: 10_000 }),
    ];

    expect(
      resolveComposerContextWindowIndicator({
        engine: "codex",
        hasSelectedModel: false,
        messages,
      }),
    ).toBeNull();
    expect(
      resolveComposerContextWindowIndicator({
        engine: "copilot",
        hasSelectedModel: true,
        messages,
      }),
    ).toBeNull();
  });
});
