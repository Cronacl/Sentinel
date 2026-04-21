import { describe, expect, it } from "bun:test";

import { ThreadActionError } from "@/hooks/use-thread-chat";

import type { ChatComposerModel } from "./chat-composer-helpers";
import {
  FALLBACK_CHAT_ENGINE_OPTIONS,
  filterSelectableModels,
  getReasoningEffortLabel,
  haveSameEngineOptionSet,
  haveSameSelectableModelSet,
  isUnstableChatEngine,
  resolveOpenCodeTraitValueForThreadMode,
  resolveReasoningEffort,
  resolveStableEngineOptions,
  resolveStableSelectableModels,
  shouldHideOpenCodeAgentSelector,
  shouldHideOpenCodeTraitSelector,
  shouldClearComposerAfterSend,
  shouldClearComposerAfterSendError,
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

  it("marks only Cursor as unstable", () => {
    expect(isUnstableChatEngine("cursor")).toBe(true);
    expect(isUnstableChatEngine("opencode")).toBe(false);
    expect(isUnstableChatEngine("codex")).toBe(false);
  });

  it("maps OpenCode plan mode to a matching plan trait when available", () => {
    expect(
      resolveOpenCodeTraitValueForThreadMode(
        [
          { isDefault: true, label: "Build", value: "build" },
          { label: "Plan", value: "plan" },
        ],
        "build",
        "plan",
      ),
    ).toBe("plan");
  });

  it("maps OpenCode plan mode to the max variant when High/Max variants are available", () => {
    expect(
      resolveOpenCodeTraitValueForThreadMode(
        [
          { isDefault: true, label: "High", value: "high" },
          { label: "Max", value: "max" },
        ],
        "high",
        "plan",
      ),
    ).toBe("max");
  });

  it("maps OpenCode chat mode back to a build-like trait when leaving plan mode", () => {
    expect(
      resolveOpenCodeTraitValueForThreadMode(
        [
          { isDefault: true, label: "Build", value: "build" },
          { label: "Plan", value: "plan" },
        ],
        "plan",
        "chat",
      ),
    ).toBe("build");
  });

  it("maps OpenCode chat mode back to the high variant when leaving Max mode", () => {
    expect(
      resolveOpenCodeTraitValueForThreadMode(
        [
          { isDefault: true, label: "High", value: "high" },
          { label: "Max", value: "max" },
        ],
        "max",
        "chat",
      ),
    ).toBe("high");
  });

  it("keeps non-plan OpenCode variants unchanged when no plan mapping exists", () => {
    expect(
      resolveOpenCodeTraitValueForThreadMode(
        [
          { label: "Low", value: "low" },
          { isDefault: true, label: "High", value: "high" },
        ],
        "high",
        "chat",
      ),
    ).toBe("high");
  });

  it("hides the OpenCode agent selector when agent options are only the plan/build mode pair", () => {
    expect(
      shouldHideOpenCodeAgentSelector([
        { isDefault: true, label: "Build", value: "build" },
        { label: "Plan", value: "plan" },
      ]),
    ).toBe(true);
  });

  it("keeps the OpenCode agent selector for non-mode agent sets", () => {
    expect(
      shouldHideOpenCodeAgentSelector([
        { isDefault: true, label: "Big Pickle", value: "big-pickle" },
        { label: "Code Reviewer", value: "reviewer" },
      ]),
    ).toBe(false);
  });

  it("hides the OpenCode variant selector when variant options are only the plan/build mode pair", () => {
    expect(
      shouldHideOpenCodeTraitSelector([
        { isDefault: true, label: "High", value: "high" },
        { label: "Max", value: "max" },
      ]),
    ).toBe(true);
  });

  it("keeps the OpenCode variant selector for non-mode variant sets", () => {
    expect(
      shouldHideOpenCodeTraitSelector([
        { isDefault: true, label: "Fast", value: "fast" },
        { label: "Balanced", value: "balanced" },
      ]),
    ).toBe(false);
  });

  it("clears the composer after committed turn failures", () => {
    expect(
      shouldClearComposerAfterSendError(
        new ThreadActionError("Request failed.", { committed: true }),
      ),
    ).toBe(true);
  });

  it("keeps the composer draft after uncommitted turn failures", () => {
    expect(
      shouldClearComposerAfterSendError(
        new ThreadActionError("Request failed."),
      ),
    ).toBe(false);
  });

  it("clears the composer after successful sends", () => {
    expect(shouldClearComposerAfterSend()).toBe(true);
  });

  it("renders human-friendly labels for the expanded effort set", () => {
    expect(getReasoningEffortLabel("none")).toBe("None");
    expect(getReasoningEffortLabel("minimal")).toBe("Minimal");
    expect(getReasoningEffortLabel("xhigh")).toBe("Extra high");
  });

  it("falls back to a supported reasoning effort when switching models", () => {
    expect(
      resolveReasoningEffort(
        createModel({
          defaultReasoningEffort: "none",
          supportedReasoningEfforts: ["none", "low", "medium", "high"],
        }),
        "xhigh",
      ),
    ).toBe("none");
  });
});
