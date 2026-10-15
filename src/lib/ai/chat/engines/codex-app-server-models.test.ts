import { describe, expect, it } from "bun:test";

import { REASONING_EFFORTS } from "@/lib/ai/providers/models";

import { toCodexReasoningEffort } from "./codex-app-server/models";

describe("toCodexReasoningEffort", () => {
  it("sends max as xhigh, the Codex family's top level", () => {
    expect(toCodexReasoningEffort("max")).toBe("xhigh");
  });

  it("passes every other level through and keeps no effort as null", () => {
    for (const effort of REASONING_EFFORTS) {
      if (effort !== "max") {
        expect(toCodexReasoningEffort(effort)).toBe(effort);
      }
    }
    expect(toCodexReasoningEffort(null)).toBeNull();
    expect(toCodexReasoningEffort(undefined)).toBeNull();
  });
});
