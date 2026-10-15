import { describe, expect, it } from "bun:test";

import type { EngineOptionDescriptor } from "@/lib/ai/chat/engines/contract";

import {
  getComposerSelectOptions,
  isModeMappingOption,
  mapsPlanModeToOptions,
  resolveOptionSelectionValue,
  resolveOptionValueForThreadMode,
  toComposerOptionValues,
  toModelOptionSelections,
  toOptionChoices,
} from "./option-descriptors";

const buildPlan = [
  { isDefault: true, label: "Build", value: "build" },
  { label: "Plan", value: "plan" },
];
const highMax = [
  { isDefault: true, label: "High", value: "high" },
  { label: "Max", value: "max" },
];

const descriptors: EngineOptionDescriptor[] = [
  {
    choices: [
      { id: "medium", isDefault: true, label: "Medium" },
      { id: "high", label: "High" },
    ],
    id: "effort",
    label: "Reasoning effort",
    role: "reasoning",
    type: "select",
  },
  {
    choices: [
      { id: "build", isDefault: true, label: "Build" },
      { id: "plan", label: "Plan" },
    ],
    id: "agent",
    label: "Agent",
    role: "agent",
    type: "select",
  },
  { choices: [], id: "variant", label: "Variant", type: "select" },
  { id: "fast", label: "Fast", type: "boolean" },
];

describe("composer select options", () => {
  it("offers every select option but the reasoning effort and empty ones", () => {
    const options = getComposerSelectOptions(descriptors);
    expect(options.map((option) => option.id)).toEqual(["agent"]);
    expect(toOptionChoices(options[0]!)).toEqual(buildPlan);
  });

  it("maps plan mode onto options for agent-select drivers only", () => {
    expect(mapsPlanModeToOptions("agent-select")).toBe(true);
    expect(mapsPlanModeToOptions("native")).toBe(false);
    expect(mapsPlanModeToOptions(false)).toBe(false);
  });
});

describe("resolveOptionValueForThreadMode", () => {
  it("picks a plan choice in plan mode", () => {
    expect(resolveOptionValueForThreadMode(buildPlan, "build", "plan")).toBe(
      "plan",
    );
    expect(resolveOptionValueForThreadMode(highMax, "high", "plan")).toBe(
      "max",
    );
  });

  it("returns to a build choice when leaving plan mode", () => {
    expect(resolveOptionValueForThreadMode(buildPlan, "plan", "chat")).toBe(
      "build",
    );
    expect(resolveOptionValueForThreadMode(highMax, "max", "chat")).toBe(
      "high",
    );
  });

  it("keeps values that have no plan mapping", () => {
    expect(
      resolveOptionValueForThreadMode(
        [
          { label: "Low", value: "low" },
          { isDefault: true, label: "High", value: "high" },
        ],
        "high",
        "chat",
      ),
    ).toBe("high");
    expect(resolveOptionValueForThreadMode([], "high", "plan")).toBeNull();
  });
});

describe("isModeMappingOption", () => {
  it("hides pickers that only mirror the plan toggle", () => {
    expect(isModeMappingOption(buildPlan)).toBe(true);
    expect(isModeMappingOption(highMax)).toBe(true);
  });

  it("keeps real choices", () => {
    expect(
      isModeMappingOption([
        { isDefault: true, label: "Big Pickle", value: "big-pickle" },
        { label: "Code Reviewer", value: "reviewer" },
      ]),
    ).toBe(false);
    expect(
      isModeMappingOption([
        { isDefault: true, label: "Fast", value: "fast" },
        { label: "Balanced", value: "balanced" },
      ]),
    ).toBe(false);
    expect(isModeMappingOption([buildPlan[0]!])).toBe(false);
  });
});

describe("resolveOptionSelectionValue", () => {
  const choices = [{ isDefault: true, value: "builder" }, { value: "planner" }];

  it("prefers a preferred (handoff) value over the default", () => {
    expect(resolveOptionSelectionValue(choices, null, "planner")).toBe(
      "planner",
    );
  });

  it("keeps the current value while it is offered", () => {
    expect(resolveOptionSelectionValue(choices, "planner", "builder")).toBe(
      "planner",
    );
  });

  it("falls back to the default when neither is offered", () => {
    expect(resolveOptionSelectionValue(choices, "missing", "gone")).toBe(
      "builder",
    );
    expect(resolveOptionSelectionValue([], "x", "y")).toBeNull();
  });
});

describe("selections", () => {
  it("turns composer values into the selections a turn carries", () => {
    expect(
      toModelOptionSelections(
        { agent: "plan", stale: "x", variant: null },
        getComposerSelectOptions(descriptors),
      ),
    ).toEqual([{ id: "agent", value: "plan" }]);
  });

  it("restores composer values from stored selections", () => {
    expect(
      toComposerOptionValues([
        { id: "agent", value: "plan" },
        { id: "fast", value: true },
      ]),
    ).toEqual({ agent: "plan" });
    expect(toComposerOptionValues(null)).toEqual({});
  });
});
