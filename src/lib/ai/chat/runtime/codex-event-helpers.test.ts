import { describe, expect, it } from "bun:test";

import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import {
  extractCodexPromptResponse,
  getCodexEventThreadId,
  redactCodexSecretUserInput,
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

describe("extractCodexPromptResponse with settled parts", () => {
  it("skips denied parts that keep their approval and finds the open prompt", () => {
    const response = extractCodexPromptResponse([
      createAssistantMessage([
        {
          approval: { approved: true, id: "61" },
          input: { command: "npm test" },
          state: "approval-responded",
          toolCallId: "cmd-1",
          toolName: "codex_command_execution",
          type: "dynamic-tool",
        } as any,
        // Answered earlier; the AI SDK keeps {approved:false} on denials.
        {
          approval: { approved: false, id: "52" },
          input: { message: "Allow?" },
          state: "output-denied",
          toolCallId: "server-approval-52",
          toolName: "codex_mcp_elicitation",
          type: "dynamic-tool",
        } as any,
      ]),
    ]);

    expect(response).toEqual({
      approvalId: "61",
      decision: "accept",
      kind: "approval",
    });
  });
});

describe("redactCodexSecretUserInput", () => {
  function userInputPart(isSecret: boolean) {
    return {
      approval: { approved: true, id: "req-1", response: "hunter2" },
      input: {
        prompt: "Token?",
        questions: [
          {
            header: "",
            id: "token",
            isOther: false,
            isSecret,
            options: [],
            question: "Token?",
          },
        ],
        requestId: "req-1",
      },
      output: { response: "hunter2" },
      state: "approval-responded",
      toolCallId: "user-input-req-1",
      toolName: "codex_user_input",
      type: "dynamic-tool",
    } as any;
  }

  it("drops answers to secret questions before persistence", () => {
    const message = createAssistantMessage([userInputPart(true)]);
    const redacted = redactCodexSecretUserInput(message);

    expect(redacted.parts[0]).toMatchObject({
      approval: { approved: true, id: "req-1" },
      output: { response: null },
    });
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
    // The caller's message (used to answer Codex) is left intact.
    expect(JSON.stringify(message)).toContain("hunter2");
  });

  it("keeps answers to ordinary questions", () => {
    const message = createAssistantMessage([userInputPart(false)]);
    expect(redactCodexSecretUserInput(message)).toBe(message);
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

describe("getCodexEventThreadId (0.160)", () => {
  it("reads conversationId from deprecated v1 approval requests", () => {
    expect(
      getCodexEventThreadId({
        method: "execCommandApproval",
        params: { callId: "c", command: ["ls"], conversationId: "thr-legacy" },
        type: "approval-request",
      }),
    ).toBe("thr-legacy");
  });

  it("prefers threadId when both are present", () => {
    expect(
      getCodexEventThreadId({
        method: "item/permissions/requestApproval",
        params: { conversationId: "other", threadId: "thr" },
        type: "approval-request",
      }),
    ).toBe("thr");
  });
});
