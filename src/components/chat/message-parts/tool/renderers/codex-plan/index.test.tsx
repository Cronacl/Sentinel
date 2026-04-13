import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CodexPlanTool } from ".";

describe("CodexPlanTool", () => {
  it("renders nothing for an empty streaming shell", () => {
    const markup = renderToStaticMarkup(
      <CodexPlanTool
        part={
          {
            input: { kind: "plan" },
            output: { steps: null, text: "" },
            state: "input-streaming",
            toolCallId: "codex-plan-empty",
            toolName: "codex_plan",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toBe("");
  });

  it("renders markdown plan content once text is available", () => {
    const markup = renderToStaticMarkup(
      <CodexPlanTool
        part={
          {
            input: { kind: "plan" },
            output: { steps: null, text: "# Plan\n\nShip the fix" },
            state: "output-available",
            toolCallId: "codex-plan-filled",
            toolName: "codex_plan",
            type: "dynamic-tool",
          } as any
        }
      />,
    );

    expect(markup).toContain("Plan");
    expect(markup).toContain("Ship the fix");
    expect(markup).toContain("Expand plan");
  });
});
