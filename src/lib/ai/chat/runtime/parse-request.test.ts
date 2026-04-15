import { describe, expect, it, mock } from "bun:test";

mock.module("@/lib/ai/messages/ui", () => ({
  validateThreadUIMessage: mock(async (message: unknown) => message),
}));

const { parseRequest } = await import("./parse-request");

describe("parseRequest", () => {
  it("accepts follow-up message arrays that include prior plan tool parts", async () => {
    const result = await parseRequest(
      {
        id: "thread-1",
        messages: [
          {
            id: "user-1",
            metadata: {},
            parts: [{ text: "Plan this", type: "text" }],
            role: "user",
          },
          {
            id: "assistant-1",
            metadata: {},
            parts: [
              {
                input: {
                  questions: [
                    {
                      allowMultiple: true,
                      header: "Feature request",
                      options: [
                        { description: "One", label: "One" },
                        { description: "Two", label: "Two" },
                        { description: "Three", label: "Three" },
                        { description: "Four", label: "Four" },
                        { description: "Five", label: "Five" },
                      ],
                      question: "Pick features",
                    },
                  ],
                },
                output: {
                  answers: null,
                  questionSetId: "qs-1",
                  questions: [],
                  status: "pending",
                },
                state: "output-available",
                toolCallId: "tool-1",
                type: "tool-ask_question",
              },
            ],
            role: "assistant",
          },
        ],
        planAnswers: [
          {
            answer: "One",
            optionLabel: "One",
            questionId: "q-1",
          },
        ],
        planQuestionSetId: "qs-1",
        trigger: "submit-plan-answer",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(result.trigger).toBe("submit-plan-answer");
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[1]?.parts[0]).toMatchObject({
      toolCallId: "tool-1",
      type: "tool-ask_question",
    });
  });

  it("parses engine-scoped submit requests for Codex-backed threads", async () => {
    const result = await parseRequest(
      {
        engine: "codex",
        id: "thread-codex-1",
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Use my local Codex runtime", type: "text" }],
          role: "user",
        },
        modelId: "gpt-5-codex",
        trigger: "submit-user-message",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(result.engine).toBe("codex");
    expect(result.modelId).toBe("gpt-5-codex");
    expect(result.message?.parts[0]).toMatchObject({
      text: "Use my local Codex runtime",
      type: "text",
    });
  });

  it("parses engine-scoped submit requests for Claude-backed threads", async () => {
    const result = await parseRequest(
      {
        engine: "claude",
        id: "thread-claude-1",
        message: {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Use my local Claude runtime", type: "text" }],
          role: "user",
        },
        modelId: "claude-sonnet-4-5-20250929",
        trigger: "submit-user-message",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(result.engine).toBe("claude");
    expect(result.modelId).toBe("claude-sonnet-4-5-20250929");
    expect(result.message?.parts[0]).toMatchObject({
      text: "Use my local Claude runtime",
      type: "text",
    });
  });

  it("parses explicit tool approval responses additively", async () => {
    const result = await parseRequest(
      {
        id: "thread-claude-approval-1",
        toolApprovalResponse: {
          approved: false,
          id: "approval-1",
          reason: "User denied command",
        },
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(result.trigger).toBe("submit-tool-approval");
    expect(result.toolApprovalResponse).toEqual({
      approved: false,
      id: "approval-1",
      reason: "User denied command",
    });
  });

  it("accepts none and xhigh reasoning effort values", async () => {
    const noneResult = await parseRequest(
      {
        id: "thread-1",
        reasoningEffort: "none",
        trigger: "stop-stream",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    const xhighResult = await parseRequest(
      {
        id: "thread-2",
        reasoningEffort: "xhigh",
        trigger: "stop-stream",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(noneResult.reasoningEffort).toBe("none");
    expect(xhighResult.reasoningEffort).toBe("xhigh");
  });
});
