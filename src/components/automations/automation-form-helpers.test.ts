import { describe, expect, it } from "bun:test";

import { FALLBACK_CHAT_ENGINE_OPTIONS } from "@/components/chat/chat-composer-helpers";

import type { AutomationEngineModel } from "./automation-form-helpers";
import {
  AUTOMATION_INSTANCE_MISSING_DESCRIPTION,
  AUTOMATION_OPTION_DEFAULT,
  getAutomationDriverOptions,
  getAutomationInstanceOptions,
  getAutomationModelOptionChoices,
  getAutomationModelOptionDescriptors,
  getAutomationModelOptions,
  getAutomationModelsForInstance,
  getAutomationUnattendedNotice,
  pickAutomationInstanceForDriver,
  pruneAutomationOptionValues,
  resolveAutomationEngine,
  resolveAutomationInstanceId,
  resolveAutomationSelection,
  shouldShowAutomationInstancePicker,
  toAutomationModelOptions,
  toAutomationOptionValues,
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
const codexOption = FALLBACK_CHAT_ENGINE_OPTIONS.find(
  (option) => option.engine === "codex",
)!;
const codexWork = {
  ...codexOption,
  accentColor: "#16a34a",
  instanceId: "codex-work",
  isDefaultInstance: false,
  label: "Codex work",
};
const codexBroken = {
  ...codexOption,
  error: "Codex is not signed in.",
  instanceId: "codex-broken",
  isAvailable: false,
  isDefaultInstance: false,
  label: "Codex broken",
};

const agent = {
  choices: [
    { id: "build", isDefault: true, label: "Build" },
    { id: "plan", label: "Plan" },
  ],
  id: "agent",
  label: "Agent",
  role: "agent" as const,
  type: "select" as const,
};
const variant = {
  choices: [
    { id: "low", label: "Low" },
    { id: "high", label: "High" },
  ],
  id: "variant",
  label: "Variant",
  role: "variant" as const,
  type: "select" as const,
};
const effort = {
  choices: [{ id: "high", isDefault: true, label: "High" }],
  id: "effort",
  label: "Reasoning",
  role: "reasoning" as const,
  type: "select" as const,
};

describe("automation form helpers", () => {
  it("lists one engine option per driver, disabled when no instance can run", () => {
    expect(
      getAutomationDriverOptions([
        cursorOption,
        {
          ...cursorOption,
          instanceId: "cursor-work",
          isAvailable: false,
          isDefaultInstance: false,
          label: "Cursor (work)",
        },
        { ...codexOption, isAvailable: false },
      ]),
    ).toEqual([
      {
        description: "Use the locally configured Cursor Agent runtime.",
        isDisabled: false,
        label: "Cursor",
        value: "cursor",
      },
      {
        description: "Use the Codex CLI already configured on this machine.",
        isDisabled: true,
        label: "Codex",
        value: "codex",
      },
    ]);
  });

  it("keeps a stored engine the catalog no longer lists, disabled", () => {
    expect(getAutomationDriverOptions([cursorOption], "codex")).toContainEqual({
      description: "No instance of this engine is available.",
      isDisabled: true,
      label: "Codex",
      value: "codex",
    });
  });

  it("appends the stability notice of engines that are not stable yet", () => {
    expect(
      getAutomationDriverOptions([
        { ...cursorOption, stability: "experimental" },
      ])[0]?.description,
    ).toBe(
      "Use the locally configured Cursor Agent runtime. Experimental integration; behavior may change or fail unexpectedly.",
    );
  });

  it("lists a driver's instances with their accent colours", () => {
    expect(
      getAutomationInstanceOptions(
        [cursorOption, codexOption, codexWork, codexBroken],
        "codex",
        "codex-work",
      ),
    ).toEqual([
      {
        accentColor: null,
        description: "Default instance",
        isDisabled: false,
        label: "Codex",
        value: "codex",
      },
      {
        accentColor: "#16a34a",
        description: "codex-work",
        isDisabled: false,
        label: "Codex work",
        value: "codex-work",
      },
      {
        accentColor: null,
        description: "Codex is not signed in.",
        isDisabled: true,
        label: "Codex broken",
        value: "codex-broken",
      },
    ]);
    expect(
      getAutomationInstanceOptions([codexOption], "codex", "codex-gone").at(-1),
    ).toEqual({
      accentColor: null,
      description: AUTOMATION_INSTANCE_MISSING_DESCRIPTION,
      isDisabled: true,
      label: "codex-gone",
      value: "codex-gone",
    });
  });

  it("picks an instance when the engine changes", () => {
    const catalog = [cursorOption, codexOption, codexWork];

    expect(
      pickAutomationInstanceForDriver(catalog, "codex", "codex-work"),
    ).toBe("codex-work");
    expect(pickAutomationInstanceForDriver(catalog, "codex", "cursor")).toBe(
      "codex",
    );
    expect(
      pickAutomationInstanceForDriver(
        [{ ...codexOption, isAvailable: false }, codexWork],
        "codex",
        "cursor",
      ),
    ).toBe("codex-work");
    expect(pickAutomationInstanceForDriver([], "claude", "cursor")).toBe(
      "claude",
    );
  });

  it("shows the instance picker for several instances or a non-default one", () => {
    expect(
      shouldShowAutomationInstancePicker([codexOption], "codex", "codex"),
    ).toBe(false);
    expect(
      shouldShowAutomationInstancePicker(
        [codexOption, codexWork],
        "codex",
        "codex",
      ),
    ).toBe(true);
    expect(
      shouldShowAutomationInstancePicker([codexWork], "codex", "codex-work"),
    ).toBe(true);
    expect(shouldShowAutomationInstancePicker([], null, "codex-gone")).toBe(
      false,
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

  it("names the engine of an instance without sending the instance id as one", () => {
    const catalog = [{ engine: "codex", instanceId: "codex-work" }];

    expect(resolveAutomationEngine("codex-work", catalog)).toBe("codex");
    // A default instance's id is its driver kind.
    expect(resolveAutomationEngine("claude", [])).toBe("claude");
    // The stored automation still names a removed instance's engine.
    expect(
      resolveAutomationEngine("codex-gone", [], {
        chatEngine: "codex",
        chatEngineInstanceId: "codex-gone",
      }),
    ).toBe("codex");
    // Nothing says which engine "codex-gone" belongs to: the form asks.
    expect(resolveAutomationEngine("codex-gone", catalog)).toBeNull();
    expect(
      resolveAutomationEngine("codex-gone", [], {
        chatEngine: "codex",
        chatEngineInstanceId: "codex-work",
      }),
    ).toBeNull();
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

describe("automation model options", () => {
  it("offers a picker for every option but the reasoning effort", () => {
    expect(
      getAutomationModelOptionDescriptors({
        options: [effort, agent, variant],
      }).map((descriptor) => descriptor.id),
    ).toEqual(["agent", "variant"]);
    expect(getAutomationModelOptionDescriptors(null)).toEqual([]);
  });

  it("leads each option's choices with the model default", () => {
    expect(getAutomationModelOptionChoices(agent)).toEqual([
      {
        description: "Whatever the model uses when nothing is picked.",
        label: "Model default (Build)",
        value: AUTOMATION_OPTION_DEFAULT,
      },
      { label: "Build", value: "build" },
      { label: "Plan", value: "plan" },
    ]);
    expect(getAutomationModelOptionChoices(variant, "max").at(-1)).toEqual({
      description: "Currently saved value is unavailable.",
      isDisabled: true,
      label: "max",
      value: "max",
    });
  });

  it("stores only values the selected model offers", () => {
    expect(
      toAutomationModelOptions({ agent: "plan", variant: "max" }, [
        agent,
        variant,
      ]),
    ).toEqual([{ id: "agent", value: "plan" }]);
    expect(toAutomationModelOptions({}, [agent, variant])).toBeNull();
    expect(toAutomationModelOptions({ agent: "plan" }, [])).toBeNull();
  });

  it("reads stored model options back into the form", () => {
    expect(
      toAutomationOptionValues([
        { id: "agent", value: "plan" },
        { id: "fast", value: true },
        { id: "", value: "dropped" },
      ]),
    ).toEqual({ agent: "plan" });
    expect(toAutomationOptionValues(null)).toEqual({});
    expect(toAutomationOptionValues("not json")).toEqual({});
  });

  it("drops values the newly selected model does not offer", () => {
    expect(
      pruneAutomationOptionValues({ agent: "plan", variant: "high" }, [agent]),
    ).toEqual({ agent: "plan" });
  });
});
