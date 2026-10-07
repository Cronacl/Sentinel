import { describe, expect, it, mock } from "bun:test";
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

// Runs the real ToolLoopAgent from createThreadAgent against a mock model.
// Tool assembly, routing and the instruction builder are stubbed so the test
// only exercises the agent loop: prepareStep and the stop conditions.

const BASE_INSTRUCTIONS = "Base thread instructions.";

const taskStatuses = new Map<string, string>();

mock.module("server-only", () => ({}));

mock.module("../tools", () => ({
  buildTools: () => ({
    edit: tool({
      execute: async () => ({ applied: true }),
      inputSchema: z.object({ path: z.string() }),
    }),
    manage_task: tool({
      execute: async ({ status, taskId }) => {
        taskStatuses.set(taskId, status);
        return {
          action: "update" as const,
          planId: "plan-1",
          task: { description: null, id: taskId, status, title: taskId },
        };
      },
      inputSchema: z.object({ status: z.string(), taskId: z.string() }),
    }),
    read: tool({
      execute: async () => ({ content: "" }),
      inputSchema: z.object({ path: z.string() }),
    }),
  }),
}));

mock.module("../tools/router", () => ({
  buildToolRoutingEvidence: () => ({
    executionFailed: false,
    inspectionPerformed: false,
    integrationNamespaces: [],
    localInspectionWasInsufficient: false,
    mcpNamespaces: [],
    missingCommand: null,
    missingToolchain: false,
    projectContextFound: false,
    suggestedNextAction: null,
    targetFilesFound: false,
  }),
  routeToolExposure: async ({
    availableToolNames,
  }: {
    availableToolNames: string[];
  }) => ({ activeToolNames: availableToolNames, audit: null }),
}));

mock.module("../tools/selection", () => ({
  computeLatentToolSummary: () => ({
    categories: [],
    integrationNamespaces: [],
    mcpNamespaces: [],
  }),
}));

mock.module("../context/instructions", () => ({
  buildThreadAgentInstructions: () => BASE_INSTRUCTIONS,
}));

const { createThreadAgent } = await import("./index");

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 10, total: 10 },
  outputTokens: { reasoning: 0, text: 5, total: 5 },
};

type ModelTurn =
  { text: string } | { toolName: string; input: Record<string, unknown> };

function turnStream(turn: ModelTurn, index: number) {
  const parts: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
  ];
  if ("text" in turn) {
    parts.push(
      { id: "text-1", type: "text-start" },
      { delta: turn.text, id: "text-1", type: "text-delta" },
      { id: "text-1", type: "text-end" },
      { finishReason: { raw: "stop", unified: "stop" }, type: "finish", usage },
    );
  } else {
    parts.push(
      {
        input: JSON.stringify(turn.input),
        toolCallId: `call-${index}`,
        toolName: turn.toolName,
        type: "tool-call",
      },
      {
        finishReason: { raw: "tool_calls", unified: "tool-calls" },
        type: "finish",
        usage,
      },
    );
  }
  return convertArrayToReadableStream(parts);
}

// Replays the given turns in order, then answers with text.
function createScriptedModel(turns: ModelTurn[]) {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const index = calls++;
      return {
        stream: turnStream(turns[index] ?? { text: "Done." }, index),
      };
    },
  });
}

function callOptions(planTasks: Array<{ id: string; status: string }> = []) {
  return {
    availableSkills: [],
    imageGenerationRuntime: { defaultProvider: null, providers: {} },
    memoryRuntime: { available: false },
    permissionMode: "default",
    planTasks,
    promptContext: {},
    searchProviders: {},
    searchSettings: {},
    skillRoots: [],
    systemPrompt: "System prompt",
    threadId: "thread-1",
    threadMode: "chat",
    toolApprovalPolicies: {},
    toolsEnabled: true,
    userId: "user-1",
    videoGenerationRuntime: { defaultProvider: null, providers: {} },
    webFetchSettings: {},
  } as never;
}

async function runAgent(
  model: MockLanguageModelV4,
  planTasks?: Array<{ id: string; status: string }>,
) {
  taskStatuses.clear();
  const agent = createThreadAgent({ languageModel: model });
  const result = await agent.stream({
    options: callOptions(planTasks),
    prompt: "Fix a.ts",
  });
  await result.consumeStream();
  return model.doStreamCalls;
}

function getSystemText(call: LanguageModelV4CallOptions | undefined) {
  const system = call?.prompt.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

function updateTask(taskId: string, status: string): ModelTurn {
  return { input: { status, taskId }, toolName: "manage_task" };
}

describe("thread agent loop", () => {
  it("sends a step directive to one model call only", async () => {
    const calls = await runAgent(
      createScriptedModel([
        { input: { path: "a.ts" }, toolName: "edit" },
        { input: { path: "a.ts" }, toolName: "read" },
      ]),
    );

    expect(calls).toHaveLength(3);
    expect(getSystemText(calls[0])).toBe(BASE_INSTRUCTIONS);
    expect(getSystemText(calls[1])).toContain(
      "## Step Directive: Validate Your Changes",
    );
    // AI SDK 7 carries prepareStep instructions forward unless reset.
    expect(getSystemText(calls[2])).toBe(BASE_INSTRUCTIONS);
  });

  it("keeps going while plan tasks from earlier runs are still open", async () => {
    const calls = await runAgent(
      createScriptedModel([
        updateTask("task-1", "completed"),
        { input: { path: "b.ts" }, toolName: "edit" },
      ]),
      [
        { id: "task-1", status: "in_progress" },
        { id: "task-2", status: "pending" },
        { id: "task-3", status: "pending" },
      ],
    );

    expect(taskStatuses.get("task-1")).toBe("completed");
    expect(calls).toHaveLength(3);
    expect(getSystemText(calls[1])).toContain(
      "Tasks: 1/3 completed, 2 remaining.",
    );
  });

  it("does not stop on plan tasks that were already resolved", async () => {
    const calls = await runAgent(
      createScriptedModel([
        { input: { path: "a.ts" }, toolName: "read" },
        { input: { path: "b.ts" }, toolName: "read" },
      ]),
      [{ id: "task-1", status: "completed" }],
    );

    expect(calls).toHaveLength(3);
    expect(getSystemText(calls[1])).toBe(BASE_INSTRUCTIONS);
  });

  it("gives the model one step to report after the last task resolves", async () => {
    const reportCalls = await runAgent(
      createScriptedModel([updateTask("task-1", "completed")]),
      [{ id: "task-1", status: "in_progress" }],
    );
    // The closing text answer ends the loop on its own.
    expect(reportCalls).toHaveLength(2);

    const busyCalls = await runAgent(
      createScriptedModel([
        updateTask("task-1", "completed"),
        { input: { path: "a.ts" }, toolName: "read" },
        { input: { path: "b.ts" }, toolName: "read" },
      ]),
      [{ id: "task-1", status: "in_progress" }],
    );
    // A tool call in that step ends the run instead of continuing.
    expect(busyCalls).toHaveLength(2);
  });
});
