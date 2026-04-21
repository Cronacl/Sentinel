import { describe, expect, it } from "bun:test";

import { resolveCursorPromptResponse } from "./cursor-event-helpers";

describe("resolveCursorPromptResponse", () => {
  it("reads stored cursor user-input responses from assistant messages", () => {
    const response = resolveCursorPromptResponse({
      messages: [
        {
          id: "assistant-1",
          metadata: {},
          parts: [
            {
              approval: {
                id: "question-1",
                response: "Workspace",
              },
              input: {
                questions: [
                  {
                    header: "Question",
                    options: [{ description: "Workspace", label: "Workspace" }],
                    question: "Which scope?",
                  },
                ],
              },
              state: "input-available",
              toolCallId: "question-1",
              toolName: "cursor_ask_question",
              type: "dynamic-tool",
            },
          ],
          role: "assistant",
        },
      ] as any,
    });

    expect(response).toEqual({
      approvalId: "question-1",
      kind: "user-input",
      response: "Workspace",
    });
  });

  it("uses the submitted tool approval payload for normal approval prompts", () => {
    const response = resolveCursorPromptResponse({
      messages: [],
      toolApprovalResponse: {
        approved: true,
        decision: "allow_once",
        id: "approval-1",
        response: "Proceed",
      },
    });

    expect(response).toEqual({
      approvalId: "approval-1",
      approved: true,
      decision: "allow_once",
      kind: "approval",
      response: "Proceed",
    });
  });
});
