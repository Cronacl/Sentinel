import { describe, expect, it } from "bun:test";

import { resolveOpenCodeTraitSelectionValue } from "./use-model-selection.helpers";

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
