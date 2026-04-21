import { describe, expect, it } from "bun:test";

import type { AutomationEngineModel } from "./automation-form-helpers";
import {
  getAutomationEngineOptions,
  getAutomationModelOptions,
  getAutomationModelsForEngine,
  resolveAutomationSelection,
} from "./automation-form-helpers";

const sentinelModel: AutomationEngineModel = {
  contextWindow: undefined,
  defaultReasoningEffort: null,
  description: "Built-in model",
  displayName: "Sentinel Default",
  engine: "sentinel",
  inputModalities: [],
  isConnected: true,
  isEnabled: true,
  modelId: "sentinel-default",
  provider: "openai",
  rawModelId: "sentinel-default",
  supportedReasoningEfforts: [],
};

describe("automation form helpers", () => {
  it("keeps Copilot visible in generic engine option labels and descriptions", () => {
    expect(
      getAutomationEngineOptions([
        {
          description: "Copilot runtime",
          engine: "copilot",
          isAvailable: true,
          isCurrent: false,
          label: "Copilot",
        },
      ] as any),
    ).toEqual([
      {
        description: "Copilot runtime",
        isDisabled: false,
        label: "Copilot",
        value: "copilot",
      },
    ]);
  });

  it("keeps Cursor visible in generic engine option labels and descriptions", () => {
    expect(
      getAutomationEngineOptions([
        {
          description: "Cursor runtime",
          engine: "cursor",
          isAvailable: true,
          isCurrent: false,
          label: "Cursor",
        },
      ] as any),
    ).toEqual([
      {
        description:
          "Cursor runtime. Experimental integration; behavior may change or fail unexpectedly.",
        isDisabled: false,
        label: "Cursor",
        value: "cursor",
      },
    ]);
  });

  it("keeps OpenCode visible in generic engine option labels and descriptions", () => {
    expect(
      getAutomationEngineOptions([
        {
          description: "OpenCode runtime",
          engine: "opencode",
          isAvailable: true,
          isCurrent: false,
          label: "OpenCode",
        },
      ] as any),
    ).toEqual([
      {
        description: "OpenCode runtime",
        isDisabled: false,
        label: "OpenCode",
        value: "opencode",
      },
    ]);
  });

  it("describes OpenCode models as runtime-backed", () => {
    expect(
      getAutomationModelOptions([
        {
          ...sentinelModel,
          description: "OpenCode Auto",
          displayName: "OpenCode Auto",
          engine: "opencode",
          modelId: "opencode/default",
          provider: null,
          rawModelId: "opencode/default",
        },
      ]),
    ).toContainEqual({
      description: "OpenCode runtime",
      label: "OpenCode Auto",
      value: "opencode/default",
    });
  });

  it("returns an empty model list when the engine is not selected yet", () => {
    expect(
      getAutomationModelsForEngine(undefined, {
        sentinel: [sentinelModel],
      }),
    ).toEqual([]);
  });

  it("keeps model options safe when models are unavailable", () => {
    expect(getAutomationModelOptions(undefined, null)).toEqual([
      {
        description: "Use default model behavior.",
        label: "Use default model",
        value: "__default__",
      },
    ]);
  });

  it("falls back to the default automation selection when models are unavailable", () => {
    expect(
      resolveAutomationSelection(undefined, "missing-model", null),
    ).toEqual({
      modelId: "__default__",
      reasoningEffort: null,
    });
  });
});
