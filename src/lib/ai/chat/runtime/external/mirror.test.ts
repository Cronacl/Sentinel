import { describe, expect, it } from "bun:test";
import { validateUIMessages } from "ai";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { createMirrorEmitter } from "./emitter";
import { outcomeFromStopReason } from "./lifecycle-outcome";
import { createAssistantMirror } from "./mirror";

function mirror() {
  return createAssistantMirror({
    agentLabel: "Work Cursor",
    toolPrefix: "cursor_",
  });
}

async function validate(parts: ThreadUIMessage["parts"]) {
  const [message] = await validateUIMessages({
    messages: [{ id: "a", parts, role: "assistant" }],
  });
  return message?.parts ?? [];
}

describe("assistant mirror approvals", () => {
  it("emits schema-valid parts through the whole approval life cycle", async () => {
    const target = mirror();
    target.upsertTool({
      id: "t",
      input: { cmd: "ls" },
      kind: "execute",
      status: "pending",
    });
    target.requestApproval({
      approvalId: "t",
      options: [
        { kind: "allow_once", name: "Allow", optionId: "a1" },
        { kind: "reject_once", name: "Reject", optionId: "r1" },
      ],
      patch: { id: "t" },
    });
    let [part] = (await validate(target.toParts())) as Array<
      Record<string, any>
    >;
    expect(part?.state).toBe("approval-requested");
    expect(part?.approval).toEqual({ id: "t" });
    expect(part?.callProviderMetadata.sentinel.permissionOptions).toHaveLength(
      2,
    );
    expect(part?.callProviderMetadata.sentinel.agentLabel).toBe("Work Cursor");

    target.respondToApproval("t", { approved: true, decision: "accept" });
    [part] = (await validate(target.toParts())) as Array<Record<string, any>>;
    expect(part?.state).toBe("approval-responded");

    target.upsertTool({ id: "t", status: "completed" });
    [part] = (await validate(target.toParts())) as Array<Record<string, any>>;
    expect(part?.state).toBe("output-available");
  });

  it("keeps a denied call denied when the agent reports it failed", async () => {
    const target = mirror();
    target.requestApproval({
      approvalId: "d",
      patch: { id: "d", kind: "edit" },
    });
    target.respondToApproval("d", { approved: false, reason: "No" });
    target.upsertTool({ id: "d", status: "failed" });
    const [part] = (await validate(target.toParts())) as Array<
      Record<string, any>
    >;
    expect(part?.state).toBe("output-denied");
    expect(part?.approval).toEqual(
      expect.objectContaining({ approved: false, id: "d" }),
    );
  });

  it("finishes dangling tools as errors at the end of a turn", async () => {
    const target = mirror();
    target.upsertTool({ id: "a", kind: "read", status: "in_progress" });
    target.upsertTool({ id: "b", kind: "read", status: "completed" });
    target.finishDanglingTools("Interrupted");
    const parts = (await validate(target.toParts())) as Array<
      Record<string, any>
    >;
    expect(parts.map((part) => [part.state, part.errorText])).toEqual([
      ["output-error", "Interrupted"],
      ["output-available", undefined],
    ]);
  });

  it("never regresses a running tool to pending", () => {
    const target = mirror();
    target.upsertTool({ id: "a", kind: "read", status: "in_progress" });
    target.upsertTool({ id: "a", status: "pending" });
    expect(target.getTool("a")?.state).toBe("input-available");
  });

  it("marks only the open text segment as streaming", () => {
    const target = mirror();
    target.appendText("one");
    target.upsertTool({ id: "x", kind: "read" });
    target.appendText("two");
    expect(
      target
        .toParts({ streaming: true })
        .map((part) => ("state" in part ? part.state : null)),
    ).toEqual(["done", "input-available", "streaming"]);
  });

  it("has a placeholder part when nothing arrived", () => {
    expect(mirror().toParts()).toEqual([{ text: " ", type: "text" }]);
  });
});

describe("createMirrorEmitter", () => {
  it("coalesces scheduled updates and flushes structural ones at once", () => {
    const timers: Array<() => void> = [];
    const emitted: number[] = [];
    let revision = 0;
    const emitter = createMirrorEmitter({
      emit: (message) => emitted.push(message.metadata?.revision ?? -1),
      persist: () => ({
        id: "a",
        metadata: { revision: ++revision },
        parts: [],
        role: "assistant",
      }),
      timers: {
        clearTimeout: () => {},
        setTimeout: (callback) => {
          timers.push(callback);
          return timers.length;
        },
      },
    });
    emitter.schedule();
    emitter.schedule();
    expect(timers).toHaveLength(1);
    emitter.flush();
    expect(emitted).toEqual([1]);
    timers[0]!();
    expect(emitted).toEqual([1, 2]);
  });
});

describe("outcomeFromStopReason", () => {
  it("maps every ACP stop reason", () => {
    expect(
      (
        [
          "end_turn",
          "max_tokens",
          "max_turn_requests",
          "refusal",
          "cancelled",
          null,
        ] as const
      ).map((reason) => outcomeFromStopReason(reason)),
    ).toEqual([
      { finishReason: "stop", status: "completed", statusLabel: null },
      { finishReason: "length", status: "completed", statusLabel: null },
      {
        finishReason: "other",
        status: "completed",
        statusLabel: "Turn limit reached",
      },
      {
        finishReason: "content-filter",
        status: "completed",
        statusLabel: null,
      },
      { finishReason: null, status: "cancelled", statusLabel: null },
      { finishReason: "stop", status: "completed", statusLabel: null },
    ]);
  });
});
