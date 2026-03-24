import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  extractCodexPromptResponse,
  getCodexEventThreadId,
} from "./codex-event-helpers";

function createAssistantMessage(
  parts: ThreadUIMessage["parts"],
): ThreadUIMessage {
  return {
    id: "assistant-1",
    metadata: {},
    parts,
    role: "assistant",
  };
}

describe("extractCodexPromptResponse", () => {
  it("extracts free-form responses for Codex user input prompts", () => {
    const response = extractCodexPromptResponse([
      createAssistantMessage([
        {
          approval: {
            id: "request-1",
            response: "Use the API key flow",
          },
          input: {
            prompt: "Which auth mode should I use?",
            requestId: "request-1",
          },
          output: { response: null },
          state: "approval-responded",
          toolCallId: "tool-call-1",
          toolName: "codex_user_input",
          type: "dynamic-tool",
        } as any,
      ]),
    ]);

    expect(response).toEqual({
      kind: "user-input",
      requestId: "request-1",
      response: "Use the API key flow",
    });
  });

  it("extracts approval decisions for standard Codex approvals", () => {
    const response = extractCodexPromptResponse([
      createAssistantMessage([
        {
          approval: {
            approved: false,
            decision: "cancel",
            id: "approval-1",
          },
          input: { command: "rm -rf /tmp/demo", cwd: "/tmp" },
          output: { output: "", status: "inProgress" },
          state: "approval-responded",
          toolCallId: "tool-call-2",
          toolName: "codex_command_execution",
          type: "dynamic-tool",
        } as any,
      ]),
    ]);

    expect(response).toEqual({
      approvalId: "approval-1",
      decision: "cancel",
      kind: "approval",
    });
  });
});

describe("getCodexEventThreadId", () => {
  it("reads thread ids from user input request payloads", () => {
    expect(
      getCodexEventThreadId({
        method: "tool/requestUserInput",
        params: {
          prompt: "Need a choice",
          threadId: "codex-thread-1",
        },
        type: "user-input-request",
      }),
    ).toBe("codex-thread-1");
  });

  it("falls back to the started thread id when notifications wrap it", () => {
    expect(
      getCodexEventThreadId({
        method: "thread/started",
        params: { thread: { id: "codex-thread-2" } },
        type: "notification",
      }),
    ).toBe("codex-thread-2");
  });
});
