import { describe, expect, it, mock } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

const lastAssistantMessageIsCompleteWithApprovalResponses = mock(
  () => false,
);

mock.module("ai", () => ({
  createAgentUIStream: mock(async () => ({ kind: "agent-ui-stream" })),
  createUIMessageStream: mock(() => new ReadableStream()),
  createUIMessageStreamResponse: mock(() => new Response()),
  generateId: mock(() => "mock-id"),
  hasToolCall: mock((name: string) => ({ kind: "has-tool-call", toolName: name })),
  lastAssistantMessageIsCompleteWithApprovalResponses,
  smoothStream: mock(() => ({})),
  stepCountIs: mock(() => ({ kind: "stop-when" })),
  tool: mock((config: unknown) => config),
  ToolLoopAgent: class { constructor() {} },
}));

const { prepareThreadChatRequestBody } = await import("./thread-chat-transport");

describe("prepareThreadChatRequestBody", () => {
  it("includes threadMode on first user message submissions", () => {
    const userMessage: ThreadUIMessage = {
      id: "user-1",
      metadata: {},
      parts: [{ text: "make a plan", type: "text" }],
      role: "user",
    };

    const result = prepareThreadChatRequestBody({
      body: {
        modelId: "openai:gpt-5.2",
        threadMode: "plan",
        trigger: "submit-user-message",
      },
      id: "thread-1",
      messages: [userMessage],
      trigger: "submit-message",
      workspaceId: "workspace-1",
    });

    expect(result.body).toMatchObject({
      id: "thread-1",
      message: userMessage,
      modelId: "openai:gpt-5.2",
      threadMode: "plan",
      trigger: "submit-user-message",
      workspaceId: "workspace-1",
    });
    expect(result.body).not.toHaveProperty("messages");
  });

  it("preserves plan mode on plan-answer submissions", () => {
    const userMessage: ThreadUIMessage = {
      id: "user-1",
      metadata: {},
      parts: [{ text: "make a plan", type: "text" }],
      role: "user",
    };
    const assistantMessage: ThreadUIMessage = {
      id: "assistant-1",
      metadata: {},
      parts: [
        {
          input: {
            questions: [
              {
                header: "Scope",
                id: "scope",
                options: [
                  { description: "Keep it small", label: "Small" },
                  { description: "Go broad", label: "Broad" },
                ],
                question: "What scope do you want?",
              },
            ],
          },
          output: {
            answers: null,
            questionSetId: "question-set-1",
            questions: [
              {
                header: "Scope",
                id: "scope",
                options: [
                  { description: "Keep it small", label: "Small" },
                  { description: "Go broad", label: "Broad" },
                ],
                question: "What scope do you want?",
              },
            ],
            status: "pending",
          },
          state: "output-available",
          toolCallId: "tool-call-1",
          type: "tool-ask_question",
        },
      ],
      role: "assistant",
    };

    const result = prepareThreadChatRequestBody({
      body: {
        planAnswers: [
          {
            answer: "Small",
            optionLabel: "Small",
            questionId: "scope",
          },
        ],
        planQuestionSetId: "question-set-1",
        threadMode: "plan",
        trigger: "submit-plan-answer",
      },
      id: "thread-1",
      messageId: "assistant-1",
      messages: [userMessage, assistantMessage],
      trigger: "regenerate-message",
      workspaceId: "workspace-1",
    });

    expect(result.body).toMatchObject({
      id: "thread-1",
      messageId: "assistant-1",
      planQuestionSetId: "question-set-1",
      threadMode: "plan",
      trigger: "submit-plan-answer",
      workspaceId: "workspace-1",
    });
  });
});
