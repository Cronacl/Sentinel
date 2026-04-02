import { describe, expect, it } from "bun:test";

import { resolveThreadSelectionSyncInput } from "./thread-selection-sync";

describe("resolveThreadSelectionSyncInput", () => {
  it("does not sync thread mode before plan mode has hydrated", () => {
    const result = resolveThreadSelectionSyncInput({
      canPersistThreadSelection: true,
      planMode: false,
      planModeReady: false,
      selectedEngine: "codex",
      selectedModelKey: "gpt-5.4",
      selectedReasoningEffort: null,
      threadPersistenceReady: false,
      threadSelection: {
        engine: "codex",
        modelId: "gpt-5.4",
        mode: "plan",
        reasoningEffort: null,
      },
    });

    expect(result).toBeNull();
  });

  for (const testCase of [
    {
      engine: "sentinel" as const,
      modelId: "openai:gpt-5.2",
      reasoningEffort: "high" as const,
    },
    {
      engine: "codex" as const,
      modelId: "gpt-5.4",
      reasoningEffort: null,
    },
    {
      engine: "claude" as const,
      modelId: "claude-sonnet-4-20250514",
      reasoningEffort: null,
    },
  ]) {
    it(`keeps plan mode authoritative for ${testCase.engine} thread sync`, () => {
      const result = resolveThreadSelectionSyncInput({
        canPersistThreadSelection: true,
        planMode: true,
        planModeReady: true,
        selectedEngine: testCase.engine,
        selectedModelKey: testCase.modelId,
        selectedReasoningEffort: testCase.reasoningEffort,
        threadPersistenceReady: false,
        threadSelection: {
          engine: testCase.engine,
          modelId: testCase.modelId,
          mode: "chat",
          reasoningEffort: testCase.reasoningEffort,
        },
      });

      expect(result).toEqual({
        engine: testCase.engine,
        mode: "plan",
        modelId: testCase.modelId,
        reasoningEffort: testCase.reasoningEffort,
      });
    });
  }
});
