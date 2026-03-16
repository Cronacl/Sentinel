import { describe, expect, it, mock } from "bun:test";

import { getIntegrationToolInteractionState } from "./state";

describe("getIntegrationToolInteractionState", () => {
  it("exposes approval actions for approval-requested integration tools", () => {
    const state = getIntegrationToolInteractionState(
      {
        approval: { id: "approval-1" },
        input: { summary: "Test event" },
        state: "approval-requested",
        toolCallId: "tool-call-1",
        toolName: "gcal_create_event",
        type: "dynamic-tool",
      } as const,
      {
        onApprove: mock(() => {}),
        onDeny: mock(() => {}),
      },
    );

    expect(state.needsApproval).toBe(true);
    expect(state.showApprovalActions).toBe(true);
    expect(state.isRunning).toBe(false);
    expect(state.hasInput).toBe(true);
  });

  it("treats approval-responded integration tools as running", () => {
    const state = getIntegrationToolInteractionState({
      approval: { approved: true, id: "approval-1" },
      input: { summary: "Test event" },
      state: "approval-responded",
      toolCallId: "tool-call-1",
      toolName: "gcal_create_event",
      type: "dynamic-tool",
    } as const);

    expect(state.isRunning).toBe(true);
    expect(state.needsApproval).toBe(false);
    expect(state.showApprovalActions).toBe(false);
  });

  it("treats denied integration tools as errors", () => {
    const state = getIntegrationToolInteractionState({
      approval: {
        approved: false,
        id: "approval-1",
        reason: "User denied command",
      },
      input: {
        body: "<p>Hi</p>",
        subject: "Test",
        to: "me@example.com",
      },
      state: "output-denied",
      toolCallId: "tool-call-1",
      toolName: "gmail_send",
      type: "dynamic-tool",
    } as const);

    expect(state.isDenied).toBe(true);
    expect(state.isError).toBe(true);
  });
});
