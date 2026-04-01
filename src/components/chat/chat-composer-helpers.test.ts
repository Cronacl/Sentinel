import { describe, expect, it } from "bun:test";

import type { ChatComposerModel } from "./chat-composer-helpers";
import {
  FALLBACK_CHAT_ENGINE_OPTIONS,
  filterSelectableModels,
  haveSameEngineOptionSet,
  haveSameSelectableModelSet,
  resolveStableEngineOptions,
  resolveStableSelectableModels,
} from "./chat-composer-helpers";

function createModel(
  overrides: Partial<ChatComposerModel> = {},
): ChatComposerModel {
  return {
    defaultReasoningEffort: "medium",
    description: "Test model",
    displayName: "Test model",
    engine: "codex",
    inputModalities: ["text"],
    isConnected: true,
    isEnabled: true,
    modelId: "gpt-5-codex",
    provider: null,
    rawModelId: "gpt-5-codex",
    supportedReasoningEfforts: ["medium"],
    ...overrides,
  };
}

describe("chat composer model helpers", () => {
  it("filters out disabled or disconnected models", () => {
    const selectableModels = filterSelectableModels([
      createModel(),
      createModel({ isConnected: false, modelId: "offline-model" }),
      createModel({ isEnabled: false, modelId: "disabled-model" }),
    ]);

    expect(selectableModels).toHaveLength(1);
    expect(selectableModels[0]?.modelId).toBe("gpt-5-codex");
  });

  it("reuses cached models when the live response has no selectable models", () => {
    const cachedModels = [createModel()];
    const stableModels = resolveStableSelectableModels(
      [createModel({ isConnected: false })],
      cachedModels,
    );

    expect(stableModels).toBe(cachedModels);
  });

  it("detects when selectable model sets are unchanged", () => {
    expect(
      haveSameSelectableModelSet(
        [createModel()],
        [createModel({ displayName: "Renamed model" })],
      ),
    ).toBe(true);
    expect(
      haveSameSelectableModelSet(
        [createModel()],
        [createModel({ modelId: "gpt-5.1-codex-mini" })],
      ),
    ).toBe(false);
  });

  it("reuses cached engine options when the live response is empty", () => {
    expect(resolveStableEngineOptions([], FALLBACK_CHAT_ENGINE_OPTIONS)).toBe(
      FALLBACK_CHAT_ENGINE_OPTIONS,
    );
  });

  it("detects when engine options are unchanged", () => {
    expect(
      haveSameEngineOptionSet(FALLBACK_CHAT_ENGINE_OPTIONS, [
        ...FALLBACK_CHAT_ENGINE_OPTIONS,
      ]),
    ).toBe(true);
    expect(
      haveSameEngineOptionSet(FALLBACK_CHAT_ENGINE_OPTIONS, [
        FALLBACK_CHAT_ENGINE_OPTIONS[0]!,
        { ...FALLBACK_CHAT_ENGINE_OPTIONS[1]!, isAvailable: false },
        FALLBACK_CHAT_ENGINE_OPTIONS[2]!,
      ]),
    ).toBe(false);
  });
});
