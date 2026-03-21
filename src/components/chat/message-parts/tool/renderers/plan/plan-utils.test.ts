import { describe, expect, it } from "bun:test";

import { getPlanDraft, getPlanToolName } from "./plan-utils";

describe("getPlanDraft", () => {
  it("reads partial create_plan input while the tool input is streaming", () => {
    const part = {
      input: {
        audience: "technical",
        document: "# Plan\n\nStreaming draft",
        goal: "Ship plan mode",
        summary: "Initial summary",
        tasks: [{ title: "Inspect renderer" }],
        title: "Drafting plan",
      },
      state: "input-streaming",
      toolCallId: "tool-1",
      type: "tool-create_plan",
    } as const;

    const draft = getPlanDraft(getPlanToolName(part), part);

    expect(draft).toMatchObject({
      audience: "technical",
      document: "# Plan\n\nStreaming draft",
      goal: "Ship plan mode",
      isStreaming: true,
      summary: "Initial summary",
      taskCount: 1,
      title: "Drafting plan",
    });
  });

  it("uses update_plan input when no streamed output is available yet", () => {
    const part = {
      input: {
        audience: "general",
        document: "# Updated plan",
        goal: "Explain work to stakeholders",
        summary: "Reframe the work",
        title: "Plan refresh",
      },
      state: "input-available",
      toolCallId: "tool-2",
      type: "tool-update_plan",
    } as const;

    const draft = getPlanDraft(getPlanToolName(part), part);

    expect(draft).toMatchObject({
      audience: "general",
      document: "# Updated plan",
      goal: "Explain work to stakeholders",
      isStreaming: true,
      summary: "Reframe the work",
      title: "Plan refresh",
    });
  });

  it("prefers streamed output and falls back to input for missing fields", () => {
    const part = {
      input: {
        audience: "technical",
        document: "# Draft from input",
        goal: "Keep the old goal",
        summary: "Keep the old summary",
        tasks: [{ title: "Existing task" }],
        title: "Input title",
      },
      output: {
        document: "# Draft from output",
        summary: "Streamed summary",
      },
      state: "input-available",
      toolCallId: "tool-3",
      type: "tool-create_plan",
    } as const;

    const draft = getPlanDraft(getPlanToolName(part), part);

    expect(draft).toMatchObject({
      audience: "technical",
      document: "# Draft from output",
      goal: "Keep the old goal",
      isStreaming: true,
      summary: "Streamed summary",
      taskCount: 1,
      title: "Input title",
    });
  });

  it("uses final output when the plan tool completes", () => {
    const part = {
      input: {
        audience: "technical",
        document: "# Old draft",
        goal: "Old goal",
        summary: "Old summary",
        title: "Old title",
      },
      output: {
        audience: "general",
        document: "# Final plan",
        goal: "Final goal",
        planId: "plan-1",
        status: "created",
        summary: "Final summary",
        taskCount: 2,
        title: "Final title",
      },
      state: "output-available",
      toolCallId: "tool-4",
      type: "tool-create_plan",
    } as const;

    const draft = getPlanDraft(getPlanToolName(part), part);

    expect(draft).toMatchObject({
      audience: "general",
      document: "# Final plan",
      goal: "Final goal",
      isStreaming: false,
      summary: "Final summary",
      taskCount: 2,
      title: "Final title",
    });
  });
});
