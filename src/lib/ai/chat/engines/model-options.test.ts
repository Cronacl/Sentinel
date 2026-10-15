import { describe, expect, it } from "bun:test";

import {
  MAX_ENGINE_OPTION_SELECTIONS,
  buildEngineOptionSelections,
  getEngineOptionValue,
  legacyRequestOptionsFromSelections,
  parseEngineOptionSelections,
  withEngineOptionValue,
} from "./model-options";

describe("parseEngineOptionSelections", () => {
  it("keeps valid selections, last value per id", () => {
    expect(
      parseEngineOptionSelections([
        { id: "effort", value: "low" },
        { id: "fast", value: true },
        { id: "effort", value: " high " },
        { id: "", value: "x" },
        { id: "agent", value: "" },
        { id: "agent", value: 3 },
        "nope",
        null,
      ]),
    ).toEqual([
      { id: "fast", value: true },
      { id: "effort", value: "high" },
    ]);
  });

  it("returns null for anything that is not a non-empty list", () => {
    expect(parseEngineOptionSelections(null)).toBeNull();
    expect(parseEngineOptionSelections({ id: "effort" })).toBeNull();
    expect(parseEngineOptionSelections([{ id: "" }])).toBeNull();
  });

  it("caps the number of selections", () => {
    const many = Array.from({ length: 50 }, (_, index) => ({
      id: `option-${index}`,
      value: "on",
    }));
    expect(parseEngineOptionSelections(many)).toHaveLength(
      MAX_ENGINE_OPTION_SELECTIONS,
    );
  });
});

describe("selection helpers", () => {
  it("sets, replaces and removes one value", () => {
    const base = [
      { id: "effort", value: "low" },
      { id: "agent", value: "build" },
    ];
    expect(withEngineOptionValue(base, "effort", "high")).toEqual([
      { id: "agent", value: "build" },
      { id: "effort", value: "high" },
    ]);
    expect(withEngineOptionValue(base, "agent", null)).toEqual([
      { id: "effort", value: "low" },
    ]);
    expect(getEngineOptionValue(base, "agent")).toBe("build");
    expect(getEngineOptionValue(null, "agent")).toBeUndefined();
  });

  it("completes explicit selections with the legacy request fields", () => {
    expect(
      buildEngineOptionSelections({
        modelOptions: [{ id: "agent", value: "plan" }],
        openCode: { agent: "build", variant: "high" },
        reasoningEffort: "medium",
      }),
    ).toEqual([
      { id: "agent", value: "plan" },
      { id: "effort", value: "medium" },
      { id: "variant", value: "high" },
    ]);
    expect(buildEngineOptionSelections({})).toBeNull();
  });

  it("maps selections back onto the legacy request fields", () => {
    expect(
      legacyRequestOptionsFromSelections([
        { id: "effort", value: "max" },
        { id: "agent", value: "plan" },
        { id: "fast", value: true },
      ]),
    ).toEqual({ openCode: { agent: "plan" }, reasoningEffort: "max" });
    // Values that are not reasoning efforts never reach the runtimes as one.
    expect(
      legacyRequestOptionsFromSelections([{ id: "effort", value: "turbo" }]),
    ).toEqual({});
  });
});
