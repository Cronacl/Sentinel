import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "./types";
import { validateThreadUIMessage, validateThreadUIMessages } from "./ui";

const assistantMessage = {
  id: "assistant-1",
  metadata: { status: "completed" },
  parts: [
    {
      approval: {
        approved: true,
        decision: "allow_always",
        id: "approval-1",
        reason: "Looks safe",
        response: "Go ahead",
      },
      input: { command: "ls" },
      state: "approval-responded",
      title: "Run ls",
      toolCallId: "call-1",
      toolName: "Bash",
      type: "dynamic-tool",
    },
    {
      approval: {
        approved: false,
        decision: "deny",
        id: "approval-2",
        response: "Not now",
      },
      input: { path: "a.ts" },
      state: "output-denied",
      toolCallId: "call-2",
      type: "tool-edit",
    },
    {
      input: { path: "a.ts" },
      output: { content: "export {};" },
      state: "output-available",
      toolCallId: "call-3",
      type: "tool-read",
    },
  ],
  role: "assistant",
} as ThreadUIMessage;

describe("validateThreadUIMessages", () => {
  it("keeps Sentinel approval fields and tool titles through AI SDK validation", async () => {
    const [validated] = await validateThreadUIMessages([assistantMessage]);

    expect(validated?.parts).toEqual(assistantMessage.parts);
  });

  it("keeps approval fields when validating a single message", async () => {
    const validated = await validateThreadUIMessage(assistantMessage);

    expect(validated.parts[0]).toEqual(
      expect.objectContaining({
        approval: expect.objectContaining({
          decision: "allow_always",
          response: "Go ahead",
        }),
        title: "Run ls",
      }),
    );
  });
});
