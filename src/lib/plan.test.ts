import { describe, expect, it } from "bun:test";

import { buildPlanPromptLines } from "./plan";

describe("buildPlanPromptLines", () => {
  it("includes audience and markdown document in planner context", () => {
    const lines = buildPlanPromptLines({
      audience: "technical",
      document: "# Plan\n\n## Overview\n\nDetailed implementation document.",
      goal: "Ship richer plan mode",
      questions: null,
      summary: "Upgrade persistence and rendering",
      tasks: [
        {
          description: "Store a markdown plan document",
          status: "pending",
          title: "Update persistence",
        },
      ],
      title: "Richer plan mode",
    });

    expect(lines).toContain("Current plan audience: Technical");
    expect(lines).toContain("Current plan markdown document:");
    expect(lines.some((line) => line.includes("Detailed implementation document."))).toBe(
      true,
    );
  });
});
