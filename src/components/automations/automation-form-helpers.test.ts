import { describe, expect, it } from "bun:test";

import { FALLBACK_CHAT_ENGINE_OPTIONS } from "@/components/chat/chat-composer-helpers";

import type { AutomationEngineModel } from "./automation-form-helpers";
import {
  getAutomationEngineOptions,
  getAutomationModelOptions,
  getAutomationModelsForInstance,
  getAutomationUnattendedNotice,
  resolveAutomationInstanceId,
  resolveAutomationSelection,
} from "./automation-form-helpers";

const sentinelModel: AutomationEngineModel = {
  contextWindow: undefined,
  defaultReasoningEffort: null,
  description: "Built-in model",
  displayName: "Sentinel Default",
  engine: "sentinel",
  inputModalities: [],
  instanceId: "sentinel",
  isConnected: true,
  isEnabled: true,
  modelId: "sentinel-default",
  options: [],
  provider: "openai",
  rawModelId: "sentinel-default",
  supportedReasoningEfforts: [],
};

const cursorOption = FALLBACK_CHAT_ENGINE_OPTIONS.find(
  (option) => option.engine === "cursor",
)!;

describe("automation form helpers", () => {
  it("lists one option per engine instance, keyed by instance id", () => {
    expect(
      getAutomationEngineOptions([
        cursorOption,
        {
          ...cursorOption,
          instanceId: "cursor-work",
          isAvailable: false,
          isDefaultInstance: false,
          label: "Cursor (work)",
        },
      ]),
    ).toEqual([
      {
        description: "Use the locally configured Cursor Agent runtime.",
        isDisabled: false,
        label: "Cursor",
        value: "cursor",
      },
      {
        description: "Use the locally configured Cursor Agent runtime.",
        isDisabled: true,
        label: "Cursor (work)",
        value: "cursor-work",
      },
    ]);
  });

  it("appends the stability notice of engines that are not stable yet", () => {
    expect(
      getAutomationEngineOptions([
        { ...cursorOption, stability: "experimental" },
      ])[0]?.description,
    ).toBe(
      "Use the locally configured Cursor Agent runtime. Experimental integration; behavior may change or fail unexpectedly.",
    );
  });

  it("describes runtime-backed models by their engine", () => {
    expect(
      getAutomationModelOptions([
        {
          ...sentinelModel,
          description: "OpenCode Auto",
          displayName: "OpenCode Auto",
          engine: "opencode",
          instanceId: "opencode",
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

  it("finds an instance's models, or none before an engine is picked", () => {
    expect(
      getAutomationModelsForInstance(undefined, {
        sentinel: [sentinelModel],
      }),
    ).toEqual([]);
    expect(
      getAutomationModelsForInstance("sentinel", {
        sentinel: [sentinelModel],
      }),
    ).toEqual([sentinelModel]);
  });

  it("resolves a stored automation to its instance, NULL meaning the default", () => {
    expect(
      resolveAutomationInstanceId({
        chatEngine: "codex",
        chatEngineInstanceId: "codex-work",
      }),
    ).toBe("codex-work");
    expect(
      resolveAutomationInstanceId({
        chatEngine: "codex",
        chatEngineInstanceId: null,
      }),
    ).toBe("codex");
    expect(resolveAutomationInstanceId({})).toBe("sentinel");
  });

  it("explains what happens to approvals in unattended runs", () => {
    expect(
      getAutomationUnattendedNotice("full", {
        engine: "codex",
        settlesUnattendedApprovals: true,
      }),
    ).toBeNull();
    expect(
      getAutomationUnattendedNotice("default", {
        engine: "codex",
        settlesUnattendedApprovals: true,
      }),
    ).toBe(
      "Automations run unattended: actions that need approval are declined unless the workspace allows full access.",
    );
    expect(
      getAutomationUnattendedNotice("default", {
        engine: "acp",
        settlesUnattendedApprovals: false,
      }),
    ).toBe(
      "Actions that need approval wait in the automation's thread until you answer, unless the workspace allows full access.",
    );
    // The built-in engine asks per tool policy, whatever the access mode.
    for (const mode of ["default", "full"] as const) {
      expect(
        getAutomationUnattendedNotice(mode, {
          engine: "sentinel",
          settlesUnattendedApprovals: true,
        }),
      ).toBe(
        "Automations run unattended: tools whose approval policy asks first are declined.",
      );
    }
    expect(getAutomationUnattendedNotice("default", null)).toBeNull();
  });

  it("settles approvals of unattended runs on every implemented engine", () => {
    for (const option of FALLBACK_CHAT_ENGINE_OPTIONS) {
      expect(option.settlesUnattendedApprovals).toBe(true);
    }
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
