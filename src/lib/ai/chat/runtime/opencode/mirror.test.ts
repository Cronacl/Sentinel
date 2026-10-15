import { describe, expect, it } from "bun:test";

import { createOpenCodeMirror } from "./mirror";

const S = "ses_1";

describe("createOpenCodeMirror", () => {
  it("keeps each part where it was first seen and hides non-assistant text", () => {
    const mirror = createOpenCodeMirror({ assumeAssistant: false });
    mirror.apply({
      messageId: "u1",
      modelId: null,
      role: "user",
      sessionId: S,
      type: "message",
    });
    mirror.apply({
      field: "text",
      messageId: "u1",
      partId: "pu",
      sessionId: S,
      text: "prompt",
      type: "part.text",
    });
    mirror.apply({
      messageId: "a1",
      modelId: "openai/gpt-5",
      role: "assistant",
      sessionId: S,
      type: "message",
    });
    mirror.apply({
      field: "text",
      messageId: "a1",
      partId: "p1",
      sessionId: S,
      text: "",
      type: "part.text",
    });
    mirror.apply({
      delta: "First ",
      field: null,
      messageId: "a1",
      partId: "p1",
      sessionId: S,
      type: "part.delta",
    });
    mirror.apply({
      callId: "c1",
      messageId: "a1",
      sessionId: S,
      status: "running",
      tool: "bash",
      type: "tool",
    });
    mirror.apply({
      messageId: "a2",
      modelId: null,
      role: "assistant",
      sessionId: S,
      type: "message",
    });
    mirror.apply({
      field: "text",
      messageId: "a2",
      partId: "p2",
      sessionId: S,
      text: "Second",
      type: "part.text",
    });
    // The first part's full text arrives after later parts started.
    mirror.apply({
      field: "text",
      messageId: "a1",
      partId: "p1",
      sessionId: S,
      text: "First step.",
      type: "part.text",
    });

    expect(
      mirror.toParts().map((part: any) => part.text ?? part.toolName),
    ).toEqual(["First step.", "opencode_bash", "Second"]);
    expect(mirror.getResponseModelId()).toBe("openai/gpt-5");
  });

  it("puts an approval on the asking tool call and keeps it through updates", () => {
    const mirror = createOpenCodeMirror({ assumeAssistant: true });
    mirror.apply({
      callId: "c1",
      input: { command: "rm x" },
      messageId: "a1",
      sessionId: S,
      status: "running",
      tool: "bash",
      type: "tool",
    });
    const key = mirror.requestApproval({
      input: { permission: "bash" },
      name: "opencode_bash",
      requestId: "per_1",
      toolCallId: "c1",
    });
    expect(key).toBe("c1");
    mirror.apply({
      callId: "c1",
      messageId: "a1",
      sessionId: S,
      status: "running",
      tool: null,
      type: "tool",
    });
    expect(mirror.toParts()[0]).toEqual(
      expect.objectContaining({
        approval: { id: "per_1" },
        input: { command: "rm x" },
        state: "approval-requested",
      }),
    );
    mirror.respondToApproval(key, { approved: false, decision: "decline" });
    mirror.apply({
      callId: "c1",
      error: "rejected",
      messageId: "a1",
      sessionId: S,
      status: "error",
      tool: null,
      type: "tool",
    });
    expect(mirror.toParts()[0]).toEqual(
      expect.objectContaining({ state: "output-denied" }),
    );
  });
});
