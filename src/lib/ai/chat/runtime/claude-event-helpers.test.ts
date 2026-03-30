import { describe, expect, it } from "bun:test";

import {
  extractClaudePromptResponse,
  extractClaudePromptResponseById,
  resolveClaudePromptResponse,
} from "./claude-event-helpers";

describe("extractClaudePromptResponse", () => {
  it("returns the latest responded Claude approval in a message", () => {
    const response = extractClaudePromptResponse([
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          { text: "Working...", type: "text" },
          {
            approval: { approved: true, id: "approval-1" },
            input: { command: "pwd" },
            state: "approval-responded",
            toolCallId: "tool-1",
            toolName: "claude_bash",
            type: "dynamic-tool",
          } as any,
          {
            approval: { approved: true, id: "approval-2" },
            input: { file_path: "a.ts" },
            state: "approval-responded",
            toolCallId: "tool-2",
            toolName: "claude_edit",
            type: "dynamic-tool",
          } as any,
        ],
        role: "assistant",
      },
    ]);

    expect(response).toEqual({
      approvalId: "approval-2",
      approved: true,
      decision: undefined,
      kind: "approval",
      reason: undefined,
      response: undefined,
    });
  });

  it("returns the responded Claude approval for an exact approval id", () => {
    const response = extractClaudePromptResponseById(
      [
        {
          id: "assistant-1",
          metadata: {},
          parts: [
            {
              approval: { approved: true, id: "approval-1" },
              input: { command: "pwd" },
              state: "approval-responded",
              toolCallId: "tool-1",
              toolName: "claude_bash",
              type: "dynamic-tool",
            } as any,
            {
              approval: { approved: false, id: "approval-2" },
              input: { file_path: "a.ts" },
              state: "approval-responded",
              toolCallId: "tool-2",
              toolName: "claude_edit",
              type: "dynamic-tool",
            } as any,
          ],
          role: "assistant",
        },
      ],
      "approval-1",
    );

    expect(response).toEqual({
      approvalId: "approval-1",
      approved: true,
      decision: undefined,
      kind: "approval",
      reason: undefined,
      response: undefined,
    });
  });

  it("returns Claude user input responses when present", () => {
    const response = extractClaudePromptResponse([
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          {
            approval: { id: "question-1", response: "continue" } as any,
            input: { questions: [] },
            state: "approval-responded",
            toolCallId: "tool-1",
            toolName: "claude_user_input",
            type: "dynamic-tool",
          } as any,
        ],
        role: "assistant",
      },
    ]);

    expect(response).toEqual({
      approvalId: "question-1",
      kind: "user-input",
      response: "continue",
    });
  });

  it("treats AskUserQuestion aliases as Claude user input responses", () => {
    const response = extractClaudePromptResponse([
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          {
            approval: { id: "question-2", response: "Critical fixes" } as any,
            input: { questions: [] },
            state: "approval-responded",
            toolCallId: "tool-2",
            toolName: "claude_askuserquestion",
            type: "dynamic-tool",
          } as any,
        ],
        role: "assistant",
      },
    ]);

    expect(response).toEqual({
      approvalId: "question-2",
      kind: "user-input",
      response: "Critical fixes",
    });
  });

  it("ignores pending Claude approvals without a response", () => {
    const response = extractClaudePromptResponse([
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          {
            approval: { id: "approval-1" },
            input: { command: "pwd" },
            state: "approval-requested",
            toolCallId: "tool-1",
            toolName: "claude_bash",
            type: "dynamic-tool",
          } as any,
        ],
        role: "assistant",
      },
    ]);

    expect(response).toBeNull();
  });

  it("resolves explicit approval payloads without scanning messages", () => {
    const response = resolveClaudePromptResponse({
      messages: undefined,
      toolApprovalResponse: {
        approved: false,
        id: "approval-1",
        reason: "User denied command",
      },
    });

    expect(response).toEqual({
      approvalId: "approval-1",
      approved: false,
      kind: "approval",
      reason: "User denied command",
    });
  });

  it("resolves explicit Claude user input payloads using the matching tool type", () => {
    const response = resolveClaudePromptResponse({
      messages: [
        {
          id: "assistant-1",
          metadata: {},
          parts: [
            {
              approval: { id: "question-1" },
              input: { questions: [] },
              state: "approval-requested",
              toolCallId: "tool-1",
              toolName: "claude_user_input",
              type: "dynamic-tool",
            } as any,
          ],
          role: "assistant",
        },
      ],
      toolApprovalResponse: {
        approved: true,
        id: "question-1",
        response: "continue",
      },
    });

    expect(response).toEqual({
      approvalId: "question-1",
      kind: "user-input",
      response: "continue",
    });
  });

  it("resolves explicit Claude user input payloads for AskUserQuestion aliases", () => {
    const response = resolveClaudePromptResponse({
      messages: [
        {
          id: "assistant-1",
          metadata: {},
          parts: [
            {
              approval: { id: "question-2" },
              input: { questions: [] },
              state: "approval-requested",
              toolCallId: "tool-2",
              toolName: "claude_askuserquestion",
              type: "dynamic-tool",
            } as any,
          ],
          role: "assistant",
        },
      ],
      toolApprovalResponse: {
        approved: true,
        id: "question-2",
        response: "Critical fixes",
      },
    });

    expect(response).toEqual({
      approvalId: "question-2",
      kind: "user-input",
      response: "Critical fixes",
    });
  });
});
