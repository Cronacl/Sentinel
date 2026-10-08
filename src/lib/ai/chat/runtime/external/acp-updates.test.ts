import { describe, expect, it } from "bun:test";
import { validateUIMessages } from "ai";

import type { AcpRawUpdate } from "@/lib/ai/chat/engines/acp/schema";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { applyAcpUpdate, readToolContent } from "./acp-updates";
import { createAssistantMirror } from "./mirror";

function mirror() {
  let now = 1_000;
  return createAssistantMirror({
    agentLabel: "Cursor",
    now: () => (now += 100),
    toolPrefix: "cursor_",
  });
}

function update(value: Record<string, unknown>) {
  return value as AcpRawUpdate;
}

function text(value: string, messageId?: string) {
  return update({
    content: { text: value, type: "text" },
    ...(messageId ? { messageId } : {}),
    sessionUpdate: "agent_message_chunk",
  });
}

async function expectValidParts(parts: ThreadUIMessage["parts"]) {
  const [message] = await validateUIMessages({
    messages: [{ id: "a", parts, role: "assistant" }],
  });
  expect(message?.parts.length).toBe(parts.length);
}

describe("applyAcpUpdate", () => {
  it("interleaves text and tools in arrival order", async () => {
    const target = mirror();
    applyAcpUpdate(target, text("Let me look. "));
    applyAcpUpdate(target, text("Reading now."));
    applyAcpUpdate(
      target,
      update({
        kind: "read",
        sessionUpdate: "tool_call",
        status: "pending",
        title: "Read README.md",
        toolCallId: "t1",
      }),
    );
    applyAcpUpdate(target, text("Done reading."));
    applyAcpUpdate(
      target,
      update({
        sessionUpdate: "tool_call_update",
        status: "completed",
        toolCallId: "t1",
      }),
    );
    applyAcpUpdate(target, text(" All good."));

    const parts = target.toParts();
    expect(parts.map((part) => part.type)).toEqual([
      "text",
      "dynamic-tool",
      "text",
    ]);
    expect(parts[0]).toEqual(
      expect.objectContaining({ text: "Let me look. Reading now." }),
    );
    // Updating an earlier tool does not split the open text segment.
    expect(parts[2]).toEqual(
      expect.objectContaining({ text: "Done reading. All good." }),
    );
    await expectValidParts(parts);
  });

  it("starts a new text segment when the messageId changes", () => {
    const target = mirror();
    applyAcpUpdate(target, text("first", "m1"));
    applyAcpUpdate(target, text("second", "m2"));
    expect(
      target.toParts().map((part) => (part as { text: string }).text),
    ).toEqual(["first", "second"]);
  });

  it("maps thoughts to reasoning parts with timings", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        content: { text: "Thinking…", type: "text" },
        sessionUpdate: "agent_thought_chunk",
      }),
    );
    expect(target.reasoningMetadata()).toEqual(
      expect.objectContaining({ isActive: true }),
    );
    applyAcpUpdate(target, text("Answer"));

    const parts = target.toParts();
    expect(parts.map((part) => part.type)).toEqual(["reasoning", "text"]);
    expect(target.reasoningMetadata()).toEqual(
      expect.objectContaining({ isActive: false, segmentDurationsMs: [100] }),
    );
  });

  it("merges tool updates partially: an absent status keeps the state", async () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        content: [
          { path: "/w/a.ts", newText: "b", oldText: "a", type: "diff" },
        ],
        kind: "edit",
        locations: [{ line: 3, path: "/w/a.ts" }],
        rawInput: { path: "/w/a.ts" },
        sessionUpdate: "tool_call",
        status: "in_progress",
        title: "Edit a.ts",
        toolCallId: "e1",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        sessionUpdate: "tool_call_update",
        title: "Edited a.ts",
        toolCallId: "e1",
      }),
    );

    let [part] = target.toParts() as Array<Record<string, any>>;
    expect(part?.state).toBe("input-available");
    expect(part?.title).toBe("Edited a.ts");
    expect(part?.input).toEqual({ path: "/w/a.ts" });
    expect(part?.output).toBeUndefined();
    expect(part?.toolName).toBe("cursor_edit");
    expect(part?.callProviderMetadata.sentinel).toEqual(
      expect.objectContaining({
        agentLabel: "Cursor",
        kind: "edit",
        locations: [{ line: 3, path: "/w/a.ts" }],
        preview: {
          diffs: [{ newText: "b", oldText: "a", path: "/w/a.ts" }],
        },
      }),
    );

    applyAcpUpdate(
      target,
      update({
        rawOutput: { ok: true },
        sessionUpdate: "tool_call_update",
        status: "completed",
        toolCallId: "e1",
      }),
    );
    [part] = target.toParts() as Array<Record<string, any>>;
    expect(part?.state).toBe("output-available");
    expect(part?.output).toEqual({
      diffs: [{ newText: "b", oldText: "a", path: "/w/a.ts" }],
      rawOutput: { ok: true },
    });
    await expectValidParts(target.toParts());
  });

  it("fails a tool with its text content as the error", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        kind: "execute",
        sessionUpdate: "tool_call",
        title: "npm test",
        toolCallId: "x1",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        content: [
          { content: { text: "exit 1", type: "text" }, type: "content" },
        ],
        sessionUpdate: "tool_call_update",
        status: "failed",
        toolCallId: "x1",
      }),
    );
    expect(target.toParts()[0]).toEqual(
      expect.objectContaining({ errorText: "exit 1", state: "output-error" }),
    );
  });

  it("renames a tool when its kind arrives later and creates unknown ids", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        sessionUpdate: "tool_call_update",
        status: "pending",
        toolCallId: "late",
      }),
    );
    expect((target.toParts()[0] as { toolName: string }).toolName).toBe(
      "cursor_other",
    );
    applyAcpUpdate(
      target,
      update({
        kind: "search",
        sessionUpdate: "tool_call_update",
        toolCallId: "late",
      }),
    );
    expect((target.toParts()[0] as { toolName: string }).toolName).toBe(
      "cursor_search",
    );
  });

  it("keeps plan entry statuses on the plan card", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        entries: [
          { content: "Read", priority: "high", status: "completed" },
          { content: "Write", priority: "medium", status: "in_progress" },
        ],
        sessionUpdate: "plan",
      }),
    );
    const [part] = target.toParts() as Array<Record<string, any>>;
    expect(part?.toolName).toBe("update_plan");
    expect(part?.callProviderMetadata).toBeUndefined();
    expect(part?.output.tasks).toEqual([
      {
        description: "Completed",
        priority: "high",
        status: "completed",
        title: "Read",
      },
      {
        description: "In progress",
        priority: "medium",
        status: "in_progress",
        title: "Write",
      },
    ]);
  });

  it("turns plan_update markdown into a create_plan card and plan_removed removes it", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        plan: { content: "# Plan", planId: "p1", type: "markdown" },
        sessionUpdate: "plan_update",
      }),
    );
    expect(target.toParts()[0]).toEqual(
      expect.objectContaining({
        output: expect.objectContaining({ document: "# Plan" }),
        toolName: "create_plan",
      }),
    );
    applyAcpUpdate(
      target,
      update({ planId: "p1", sessionUpdate: "plan_removed" }),
    );
    expect(target.isEmpty()).toBe(true);
  });

  it("records usage_update as context usage and cost", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        cost: { amount: 0.42, currency: "USD" },
        sessionUpdate: "usage_update",
        size: 200_000,
        used: 12_345,
      }),
    );
    expect(target.getUsage()).toEqual({
      contextWindow: 200_000,
      cost: { amount: 0.42, currency: "USD" },
      inputTokens: 12_345,
    });
  });

  it("returns session-state effects instead of touching the transcript", () => {
    const target = mirror();
    expect(
      applyAcpUpdate(
        target,
        update({
          availableCommands: [{ description: "Review", name: "review" }],
          sessionUpdate: "available_commands_update",
        }),
      ),
    ).toEqual([
      {
        commands: [{ description: "Review", inputHint: null, name: "review" }],
        type: "commands",
      },
    ]);
    expect(
      applyAcpUpdate(
        target,
        update({ currentModeId: "plan", sessionUpdate: "current_mode_update" }),
      ),
    ).toEqual([{ modeId: "plan", type: "mode" }]);
    expect(
      applyAcpUpdate(
        target,
        update({
          configOptions: [
            {
              category: "model",
              currentValue: "a",
              id: "model",
              name: "Model",
              options: [{ name: "A", value: "a" }],
              type: "select",
            },
          ],
          sessionUpdate: "config_option_update",
        }),
      )[0],
    ).toEqual(expect.objectContaining({ type: "config" }));
    expect(
      applyAcpUpdate(
        target,
        update({ sessionUpdate: "session_info_update", title: "Fix tests" }),
      ),
    ).toEqual([{ title: "Fix tests", type: "title" }]);
    expect(
      applyAcpUpdate(target, update({ sessionUpdate: "vendor_thing" }))[0],
    ).toEqual(
      expect.objectContaining({ kind: "vendor_thing", type: "unknown" }),
    );
    expect(target.isEmpty()).toBe(true);
  });

  it("maps session_message(_chunk) to a subagent card, never to the assistant text (G21)", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        content: { text: "partial ", type: "text" },
        messageId: "sm1",
        senderSessionId: "child-1",
        sessionUpdate: "session_message_chunk",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        content: { text: "result", type: "text" },
        messageId: "sm1",
        senderSessionId: "child-1",
        sessionUpdate: "session_message_chunk",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        content: [{ text: "whole message", type: "text" }],
        messageId: "sm2",
        sessionUpdate: "session_message",
      }),
    );
    const parts = target.toParts() as Array<Record<string, any>>;
    expect(parts.map((part) => part.type)).toEqual([
      "dynamic-tool",
      "dynamic-tool",
    ]);
    expect(parts[0]?.output.text).toBe("partial result");
    expect(parts[0]?.callProviderMetadata.sentinel.kind).toBe("subagent");
    expect(parts[1]?.output.text).toBe("whole message");
  });

  it("maps notices, compaction and subagents", async () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        description: "Slow network",
        sessionUpdate: "notice",
        severity: "warning",
        title: "Heads up",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        compactionId: "c1",
        sessionUpdate: "compaction_update",
        status: "in_progress",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        compactionId: "c1",
        content: { text: "Summary", type: "text" },
        sessionUpdate: "compaction_summary_chunk",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        compactionId: "c1",
        sessionUpdate: "compaction_update",
        status: "completed",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        sessionId: "child-2",
        sessionUpdate: "subagent_update",
        state: { state: "running" },
        title: "Explorer",
      }),
    );
    const parts = target.toParts() as Array<Record<string, any>>;
    expect(
      parts.map((part) => part.callProviderMetadata?.sentinel.kind),
    ).toEqual(["notice", "compaction", "subagent"]);
    expect(parts[1]?.output.text).toBe("Summary");
    expect(parts[2]?.state).toBe("input-available");
    await expectValidParts(parts as ThreadUIMessage["parts"]);
  });

  it("drops transcript updates while a session/load replays history", () => {
    const target = mirror();
    expect(
      applyAcpUpdate(target, text("old answer"), { replaying: true }),
    ).toEqual([]);
    expect(
      applyAcpUpdate(
        target,
        update({
          currentModeId: "agent",
          sessionUpdate: "current_mode_update",
        }),
        { replaying: true },
      ),
    ).toEqual([{ modeId: "agent", type: "mode" }]);
    expect(target.isEmpty()).toBe(true);
  });

  it("turns image chunks into file parts and resource links into text", () => {
    const target = mirror();
    applyAcpUpdate(
      target,
      update({
        content: { data: "aGk=", mimeType: "image/png", type: "image" },
        sessionUpdate: "agent_message_chunk",
      }),
    );
    applyAcpUpdate(
      target,
      update({
        content: {
          name: "spec.md",
          type: "resource_link",
          uri: "file:///w/spec.md",
        },
        sessionUpdate: "agent_message_chunk",
      }),
    );
    expect(target.toParts()).toEqual([
      {
        mediaType: "image/png",
        type: "file",
        url: "data:image/png;base64,aGk=",
      },
      { state: "done", text: "[spec.md](file:///w/spec.md)", type: "text" },
    ]);
  });
});

describe("readToolContent", () => {
  it("joins text, keeps diffs and terminals", () => {
    expect(
      readToolContent([
        { content: { text: "a", type: "text" }, type: "content" },
        { content: { text: "b", type: "text" }, type: "content" },
        { newText: "n", path: "/x", type: "diff" },
        { terminalId: "term-1", type: "terminal" },
        { type: "mystery" },
      ]),
    ).toEqual({
      diffs: [{ newText: "n", oldText: null, path: "/x" }],
      terminals: [{ terminalId: "term-1" }],
      text: "a\nb",
    });
  });
});
