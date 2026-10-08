import { describe, expect, it, spyOn } from "bun:test";
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import {
  readUIMessageStream,
  ToolLoopAgent,
  tool,
  type UIMessageChunk,
} from "ai";
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV4,
} from "ai/test";
import { z } from "zod";

import { getErrorMessage } from "@/lib/errors";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

import { planContextCompaction } from "../runtime/context-compaction";
import { createReasoningMetadataTracker } from "../runtime/reasoning";
import { createThreadAgentUIStream } from "./ui-stream";

const usage = {
  inputTokens: { cacheRead: 4, cacheWrite: 0, noCache: 6, total: 10 },
  outputTokens: { reasoning: 15, text: 5, total: 20 },
};

function textResponse(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { id: "text-1", type: "text-start" },
    { delta: text, id: "text-1", type: "text-delta" },
    { id: "text-1", type: "text-end" },
    { finishReason: { raw: "stop", unified: "stop" }, type: "finish", usage },
  ];
}

function createModel(text = "Done.") {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(textResponse(text)),
    }),
  });
}

// Mirrors the thread agent: no constructor-level tools; they are built per
// call in prepareCall, so `agent.tools` is empty when the UI stream starts.
function createAgent(
  model: MockLanguageModelV4,
  executeEdit: () => Promise<unknown>,
) {
  return new ToolLoopAgent({
    allowSystemInMessages: true,
    callOptionsSchema: z.object({ threadId: z.string() }),
    model,
    prepareCall: ({ options: _options, ...settings }) => ({
      ...settings,
      tools: {
        edit: tool({
          execute: executeEdit,
          inputSchema: z.object({ path: z.string() }),
          needsApproval: true,
        }),
        read: tool({
          execute: async () => ({ content: "" }),
          inputSchema: z.object({ path: z.string() }),
        }),
      },
    }),
  });
}

function streamAgent(
  agent: ReturnType<typeof createAgent>,
  uiMessages: ThreadUIMessage[],
  overrides: Partial<Parameters<typeof createThreadAgentUIStream>[0]> = {},
) {
  return createThreadAgentUIStream({
    agent,
    onError: (error) => getErrorMessage(error, "Unknown error"),
    options: { threadId: "thread-1" },
    originalMessages: uiMessages,
    uiMessages,
    ...overrides,
  });
}

function getPromptText(call: LanguageModelV4CallOptions | undefined) {
  return JSON.stringify(call?.prompt ?? []);
}

const userMessage: ThreadUIMessage = {
  id: "user-1",
  metadata: {},
  parts: [{ text: "Fix a.ts", type: "text" }],
  role: "user",
};

describe("createThreadAgentUIStream", () => {
  it("runs an approved tool call and keeps earlier tool outputs for the model", async () => {
    const model = createModel();
    let editCalls = 0;
    const agent = createAgent(model, async () => {
      editCalls += 1;
      return { applied: true };
    });
    const messages: ThreadUIMessage[] = [
      userMessage,
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          { type: "step-start" },
          {
            input: { path: "a.ts" },
            output: { content: "export const answer = 42;" },
            state: "output-available",
            toolCallId: "call-read",
            type: "tool-read",
          },
          { type: "step-start" },
          {
            approval: { approved: true, id: "approval-1" },
            input: { path: "a.ts" },
            state: "approval-responded",
            toolCallId: "call-edit",
            type: "tool-edit",
          },
        ],
        role: "assistant",
      },
    ];

    const chunks = await convertReadableStreamToArray(
      await streamAgent(agent, messages),
    );

    expect(editCalls).toBe(1);
    expect(chunks).toContainEqual(
      expect.objectContaining({
        output: { applied: true },
        toolCallId: "call-edit",
        type: "tool-output-available",
      }),
    );
    const promptText = getPromptText(model.doStreamCalls[0]);
    expect(promptText).toContain("export const answer = 42;");
    expect(promptText).not.toContain("Tool output omitted");
  });

  it("still asks for approval for tools that set needsApproval", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: "stream-start", warnings: [] },
          {
            input: JSON.stringify({ path: "a.ts" }),
            toolCallId: "call-edit",
            toolName: "edit",
            type: "tool-call",
          },
          {
            finishReason: { raw: "tool_calls", unified: "tool-calls" },
            type: "finish",
            usage,
          },
        ]),
      }),
    });
    let editCalls = 0;
    const agent = createAgent(model, async () => {
      editCalls += 1;
      return { applied: true };
    });

    const chunks = await convertReadableStreamToArray(
      await streamAgent(agent, [userMessage]),
    );

    expect(chunks).toContainEqual(
      expect.objectContaining({
        toolCallId: "call-edit",
        type: "tool-approval-request",
      }),
    );
    expect(editCalls).toBe(0);
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("keeps provider error text instead of the redacted default", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("Provider exploded: rate limited");
      },
    });
    const agent = createAgent(model, async () => ({}));
    // streamText logs stream errors by default; this one is expected.
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const chunks = await convertReadableStreamToArray(
      await streamAgent(agent, [userMessage]),
    ).finally(() => consoleError.mockRestore());

    expect(chunks).toContainEqual({
      errorText: "Provider exploded: rate limited",
      type: "error",
    } satisfies UIMessageChunk);
  });

  it("accepts the context compaction summary system message", async () => {
    const model = createModel();
    const agent = createAgent(model, async () => ({}));
    const assistantMessage: ThreadUIMessage = {
      id: "assistant-1",
      metadata: { status: "completed" },
      parts: [{ text: "Earlier answer", type: "text" }],
      role: "assistant",
    };
    const { transcript } = planContextCompaction({
      checkpoint: {
        coveredThroughMessageId: "assistant-1",
        summary: "The user is fixing a.ts.",
        updatedAt: null,
      },
      enabled: false,
      transcript: [userMessage, assistantMessage, { ...userMessage, id: "u2" }],
      windowPercent: 80,
    });
    expect(transcript[0]?.role).toBe("system");

    const chunks = await convertReadableStreamToArray(
      await streamAgent(agent, transcript),
    );

    expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
    expect(model.doStreamCalls[0]?.prompt[0]).toEqual(
      expect.objectContaining({
        content: expect.stringContaining("The user is fixing a.ts."),
        role: "system",
      }),
    );
  });

  it("maps AI SDK 7 usage details into thread message metadata", async () => {
    const model = createModel();
    const agent = createAgent(model, async () => ({}));
    const tracker = createReasoningMetadataTracker({
      clock: { now: () => 0 },
      providerId: "openai",
      requestedModelId: "openai:gpt-5.2",
    });
    let stepInputTokens: number | undefined;

    const stream = await streamAgent(agent, [userMessage], {
      generateMessageId: () => "assistant-2",
      messageMetadata: ({ part }) => tracker.getMessageMetadata(part),
      onStepEnd: ({ usage: stepUsage }) => {
        stepInputTokens = stepUsage.inputTokens;
      },
    });
    let finalMessage: ThreadUIMessage | undefined;
    for await (const message of readUIMessageStream<ThreadUIMessage>({
      stream,
    })) {
      finalMessage = message;
    }

    expect(stepInputTokens).toBe(10);
    expect(finalMessage?.metadata?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 15,
      totalTokens: 30,
    });
  });
});
