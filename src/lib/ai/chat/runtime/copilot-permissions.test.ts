import { describe, expect, it } from "bun:test";

import { toCopilotSdkReasoningEffort } from "./copilot/permissions";

describe("toCopilotSdkReasoningEffort", () => {
  it("maps levels Copilot lacks and passes the rest through", () => {
    expect(toCopilotSdkReasoningEffort("none")).toBe("low");
    expect(toCopilotSdkReasoningEffort("minimal")).toBe("low");
    expect(toCopilotSdkReasoningEffort("medium")).toBe("medium");
    expect(toCopilotSdkReasoningEffort(null)).toBeUndefined();
  });

  it("sends xhigh unless the model is known to lack it", () => {
    expect(toCopilotSdkReasoningEffort("xhigh")).toBe("xhigh");
    expect(toCopilotSdkReasoningEffort("xhigh", ["low", "high"])).toBe("high");
  });

  it("sends max only to a model that lists it, else the next level down", () => {
    expect(
      toCopilotSdkReasoningEffort("max", ["low", "high", "xhigh", "max"]),
    ).toBe("max");
    expect(toCopilotSdkReasoningEffort("max", ["low", "high", "xhigh"])).toBe(
      "xhigh",
    );
    expect(toCopilotSdkReasoningEffort("max", ["low", "high"])).toBe("high");
    // Efforts unknown: the same fallback as xhigh.
    expect(toCopilotSdkReasoningEffort("max")).toBe("xhigh");
  });
});
