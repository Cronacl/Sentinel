// @ts-nocheck

import { describe, expect, it } from "bun:test";

import {
  getThreadMessageSyncToken,
  normalizeThreadUIMessage,
  prepareMessagesForModel,
} from "./types";

describe("thread message normalization", () => {
  it("preserves empty reasoning parts when provider metadata is present", () => {
    const message = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {},
      parts: [
        {
          providerMetadata: {
            openai: {
              itemId: "rs_123",
              reasoningEncryptedContent: null,
            },
          },
          state: "done",
          text: "",
          type: "reasoning",
        },
        {
          providerMetadata: {
            openai: {
              itemId: "msg_123",
            },
          },
          state: "done",
          text: "Final answer",
          type: "text",
        },
      ],
      role: "assistant",
    });

    expect(message.parts).toHaveLength(2);
    expect(message.parts[0]).toMatchObject({
      providerMetadata: {
        openai: {
          itemId: "rs_123",
        },
      },
      text: "",
      type: "reasoning",
    });
  });

  it("removes data and source parts from model messages", () => {
    const messages = prepareMessagesForModel([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: {},
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is the answer", state: "done" },
          {
            type: "data-thread-title",
            data: { threadId: "t1", title: "Test" },
          },
          {
            type: "data-thread-invalidation",
            data: { target: "all", threadId: "t1" },
          },
        ],
        metadata: {},
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toHaveLength(1);
    expect(messages[1].parts[0]).toMatchObject({
      type: "text",
      text: "Here is the answer",
    });
  });

  it("drops messages that only contain data parts", () => {
    const messages = prepareMessagesForModel([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: {},
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "data-thread-title",
            data: { threadId: "t1", title: "Test" },
          },
        ],
        metadata: {},
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("user-1");
  });

  it("keeps tool parts when data parts are stripped", () => {
    const messages = prepareMessagesForModel([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "check node" }],
        metadata: {},
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-shell_command",
            toolCallId: "tc-1",
            state: "output-available",
            input: { command: "node -v", rationale: "Check node version" },
            output: {
              cwd: "/home",
              durationMs: 100,
              exitCode: 0,
              stderr: "",
              stdout: "v20.0.0",
              truncated: false,
            },
          },
          {
            type: "data-thread-title",
            data: { threadId: "t1", title: "Node check" },
          },
        ],
        metadata: {},
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toHaveLength(1);
    expect(messages[1].parts[0].type).toBe("tool-shell_command");
  });

  it("preserves step-start and content parts", () => {
    const messages = prepareMessagesForModel([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: {},
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "text", text: "Step one result", state: "done" },
          { type: "step-start" },
          { type: "text", text: "Step two result", state: "done" },
        ],
        metadata: {},
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toHaveLength(4);
  });

  it("passes through messages with no non-model parts unchanged", () => {
    const original = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        metadata: {},
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hi", state: "done" }],
        metadata: {},
      },
    ];

    const result = prepareMessagesForModel(original);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(original[0]);
    expect(result[1]).toBe(original[1]);
  });

  it("updates the sync token when provider metadata changes", () => {
    const withoutProviderIds = {
      id: "assistant-1",
      metadata: {},
      parts: [
        {
          state: "done",
          text: "Thinking",
          type: "reasoning",
        },
        {
          state: "done",
          text: "Answer",
          type: "text",
        },
      ],
      role: "assistant",
    } as const;

    const withProviderIds = {
      ...withoutProviderIds,
      parts: [
        {
          ...withoutProviderIds.parts[0],
          providerMetadata: {
            openai: {
              itemId: "rs_123",
              reasoningEncryptedContent: null,
            },
          },
        },
        {
          ...withoutProviderIds.parts[1],
          providerMetadata: {
            openai: {
              itemId: "msg_123",
            },
          },
        },
      ],
    };

    expect(
      getThreadMessageSyncToken(normalizeThreadUIMessage(withoutProviderIds)),
    ).not.toBe(
      getThreadMessageSyncToken(normalizeThreadUIMessage(withProviderIds)),
    );
  });

  it("updates the sync token when input token usage changes", () => {
    const base = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {
        status: "completed",
        usage: {
          inputTokens: 400,
        },
      },
      parts: [{ text: "Answer", type: "text" }],
      role: "assistant",
    });

    const updated = normalizeThreadUIMessage({
      ...base,
      metadata: {
        ...base.metadata,
        usage: {
          ...base.metadata.usage,
          inputTokens: 800,
        },
      },
    });

    expect(getThreadMessageSyncToken(base)).not.toBe(
      getThreadMessageSyncToken(updated),
    );
  });

  it("updates the sync token when context window usage changes", () => {
    const base = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {
        status: "completed",
        usage: {
          contextWindow: 200_000,
          inputTokens: 400,
        },
      },
      parts: [{ text: "Answer", type: "text" }],
      role: "assistant",
    });

    const updated = normalizeThreadUIMessage({
      ...base,
      metadata: {
        ...base.metadata,
        usage: {
          ...base.metadata.usage,
          contextWindow: 1_000_000,
        },
      },
    });

    expect(getThreadMessageSyncToken(base)).not.toBe(
      getThreadMessageSyncToken(updated),
    );
  });

  it("updates the sync token when dynamic tool output changes", () => {
    const base = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {
        status: "streaming",
      },
      parts: [
        {
          input: { command: "ls -la" },
          state: "input-streaming",
          toolCallId: "tool-1",
          toolName: "claude_bash",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    });

    const updated = normalizeThreadUIMessage({
      ...base,
      parts: [
        {
          ...base.parts[0],
          state: "output-available",
          output: { elapsedTimeSeconds: 1 },
        },
      ],
    });

    expect(getThreadMessageSyncToken(base)).not.toBe(
      getThreadMessageSyncToken(updated),
    );
  });

  it("updates the sync token when dynamic tool approval metadata changes", () => {
    const base = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {
        status: "streaming",
      },
      parts: [
        {
          approval: { id: "tool-1", reason: "Need permission" },
          input: { command: "ls -la" },
          state: "approval-requested",
          toolCallId: "tool-1",
          toolName: "claude_bash",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    });

    const updated = normalizeThreadUIMessage({
      ...base,
      parts: [
        {
          ...base.parts[0],
          approval: { id: "tool-1", reason: "Need a different permission" },
        },
      ],
    });

    expect(getThreadMessageSyncToken(base)).not.toBe(
      getThreadMessageSyncToken(updated),
    );
  });

  it("sanitizes stale Claude dynamic-tool fields across state transitions", () => {
    const message = normalizeThreadUIMessage({
      id: "assistant-1",
      metadata: {},
      parts: [
        {
          approval: { approved: true, id: "tool-1", reason: "approved once" },
          errorText: "old error",
          input: { command: "ls -la" },
          output: "done",
          state: "output-available",
          toolCallId: "tool-1",
          toolName: "claude_bash",
          type: "dynamic-tool",
        },
        {
          approval: {
            approved: true,
            decision: "accept",
            id: "tool-2",
            reason: "Need permission",
            response: "run it",
          },
          errorText: "old error",
          input: { command: "cat file.txt" },
          output: "partial",
          state: "approval-responded",
          toolCallId: "tool-2",
          toolName: "claude_read",
          type: "dynamic-tool",
        },
        {
          approval: {
            approved: true,
            decision: "decline",
            id: "tool-3",
            reason: "unsafe",
            response: "No",
          },
          errorText: "denied",
          input: { command: "rm test.txt" },
          output: "should be removed",
          state: "output-denied",
          toolCallId: "tool-3",
          toolName: "claude_bash",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    });

    expect(message.parts[0]).toEqual({
      input: { command: "ls -la" },
      output: "done",
      state: "output-available",
      toolCallId: "tool-1",
      toolName: "claude_bash",
      type: "dynamic-tool",
    });

    expect(message.parts[1]).toEqual({
      approval: {
        approved: true,
        decision: "accept",
        id: "tool-2",
        reason: "Need permission",
        response: "run it",
      },
      input: { command: "cat file.txt" },
      state: "approval-responded",
      toolCallId: "tool-2",
      toolName: "claude_read",
      type: "dynamic-tool",
    });

    expect(message.parts[2]).toEqual({
      approval: {
        approved: false,
        decision: "decline",
        id: "tool-3",
        reason: "unsafe",
        response: "No",
      },
      input: { command: "rm test.txt" },
      state: "output-denied",
      toolCallId: "tool-3",
      toolName: "claude_bash",
      type: "dynamic-tool",
    });
  });
});
