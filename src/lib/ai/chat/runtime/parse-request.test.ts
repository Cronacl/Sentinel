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
});
