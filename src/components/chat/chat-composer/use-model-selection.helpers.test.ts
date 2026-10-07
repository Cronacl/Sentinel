import { describe, expect, it } from "bun:test";

import { findPreferredModel } from "./use-model-selection.helpers";

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
