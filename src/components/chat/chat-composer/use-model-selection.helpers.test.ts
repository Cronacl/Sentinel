import { describe, expect, it } from "bun:test";

import {
  findPreferredModel,
  resolveOpenCodeTraitSelectionValue,
} from "./use-model-selection.helpers";

describe("resolveOpenCodeTraitSelectionValue", () => {
  const options = [{ isDefault: true, value: "builder" }, { value: "planner" }];

  it("preserves an explicit preferred handoff selection instead of falling back to the default", () => {
    expect(resolveOpenCodeTraitSelectionValue(options, null, "planner")).toBe(
      "planner",
    );
  });

  it("keeps the current selection when it remains valid", () => {
    expect(
      resolveOpenCodeTraitSelectionValue(options, "planner", "builder"),
    ).toBe("planner");
  });

  it("falls back to the default option when neither current nor preferred values are valid", () => {
    expect(
      resolveOpenCodeTraitSelectionValue(options, "missing", "also-missing"),
    ).toBe("builder");
  });
});

describe("findPreferredModel", () => {
  const models = [
    { modelId: "openai:gpt-6-astra" },
    { modelId: "anthropic:claude-sonnet-5-5" },
    { modelId: "gpt-5-codex" },
  ];

  it("returns the exact stored selection", () => {
    expect(findPreferredModel(models, "anthropic:claude-sonnet-5-5")).toBe(
      models[1],
    );
  });

  it("selects the successor of a retired built-in model", () => {
    expect(
      findPreferredModel(models, "anthropic:claude-3-7-sonnet-latest"),
    ).toBe(models[1]);
  });

  it("leaves other engines' ids and unknown ids alone", () => {
    expect(findPreferredModel(models, "gpt-5-codex")).toBe(models[2]);
    expect(findPreferredModel(models, "openai:gpt-5-codex")).toBe(undefined);
    expect(findPreferredModel(models, "anthropic:unknown")).toBe(undefined);
    expect(findPreferredModel(models, null)).toBe(undefined);
  });
});
