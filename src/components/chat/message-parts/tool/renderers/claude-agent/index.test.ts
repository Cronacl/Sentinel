import { describe, expect, it } from "bun:test";

import { getAgentResultText } from ".";

describe("getAgentResultText", () => {
  it("preserves markdown-formatted agent output text", () => {
    const result = getAgentResultText({
      agentId: "agent-1",
      content: [
        {
          text: "Here is a breakdown.\n\n## `/src/main.tsx`\n\nNo issues found.",
          type: "text",
        },
      ],
      prompt: "Review the app",
      status: "completed",
    });

    expect(result).toContain("## `/src/main.tsx`");
    expect(result).toContain("No issues found.");
  });
});
