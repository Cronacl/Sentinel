// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const aiTestState = ((globalThis as any).__sentinelAiTestState ??= {
  agentConfig: null,
});

const aiState = {
  assistantResponseMessage: {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  },
  streamChunks: [],
};

const createAgentUIStream = mock(async (args) => {
  if (aiTestState.agentConfig?.prepareCall && args.options) {
    aiTestState.prepared = aiTestState.agentConfig.prepareCall({
      options: args.options,
    });
  }
  return { kind: "agent-ui-stream" };
});
const createUIMessageStream = mock(({ execute, onFinish }) => {
  const writer = {
    merge: mock(() => {}),
    write: mock((chunk) => {
      aiState.streamChunks.push(chunk);
    }),
  };

  const done = (async () => {
    await execute({ writer });
    await onFinish?.({ responseMessage: aiState.assistantResponseMessage });
  })();

  return { done, writer };
});
const createUIMessageStreamResponse = mock(async ({ headers, stream }) => {
  await stream.done;
  return new Response("ok", { headers, status: 200 });
});
const generateId = mock(() => "stream-id");
const hasToolCall = mock((toolName) => ({ kind: "has-tool-call", toolName }));
const smoothStream = mock(() => undefined);
const stepCountIs = mock(() => ({ kind: "stop-when" }));
const tool = mock((config) => config);

class MockToolLoopAgent {
  constructor(config) {
    aiTestState.agentConfig = config;
  }
}

const attachmentDownloadHandler = { kind: "download-handler" };
const createAttachmentDownloadHandler = mock(() => attachmentDownloadHandler);

const resolvedChatModel = {
  languageModel: { kind: "chat-model" },
  providerId: "openai",
  providerOptions: { openai: { reasoningEffort: "high" } },
  requestedModelId: "openai:gpt-5.2",
  responseModelId: "gpt-5.2",
};
const resolveThreadChatModel = mock(async () => resolvedChatModel);

const resolvedTitleModel = {
  languageModel: { kind: "title-model" },
  providerId: "openai",
  requestedModelId: "openai:gpt-4.1-nano",
  responseModelId: "gpt-4.1-nano",
};
const resolveThreadTitleModel = mock(async () => resolvedTitleModel);
const generateThreadTitle = mock(async () => "Fast title");
const getSystemPrompt = mock(async () => "System prompt");
const retrieveRelevantMemories = mock(async () => []);
const buildMemoryPromptLines = mock(() => []);
const autosaveConversationMemories = mock(async () => []);

const buildPersistedAssistantMessage = mock(
  ({ assistantId, finalAssistant, placeholder }) =>
    finalAssistant
      ? { ...finalAssistant, id: assistantId }
      : { ...placeholder, id: assistantId },
);

const tracker = {
  finalize: mock((messages, responseMessage) => [...messages, responseMessage]),
  getMessageMetadata: mock(() => ({})),
};
const createReasoningMetadataTracker = mock(() => tracker);

const buildActiveThreadMessages = mock((records) => records);
const getLatestVisibleMessageId = mock(() => null);
const getMessageRecordById = mock(() => undefined);
const validateThreadUIMessage = mock(async (message) => message);
const validateThreadUIMessages = mock(async (messages) => messages);

const loadThreadMessages = mock(async () => []);
const loadThread = mock(async () => null);
const ensureThread = mock(async () => ({ created: true }));
const updateThreadChatSettings = mock(() => {});
const upsertMessage = mock(() => {});
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {});
const updateThreadTitle = mock(() => {});
const setActiveStream = mock(() => {});
const updateMessageMetadata = mock(async () => {});

const createNewResumableStream = mock(async () => {});
const getWorkspaceRootPath = mock(async () => "/tmp/workspace-1");
const getSkillSnapshot = mock(async () => ({
  revision: 1,
  skillRoots: [],
  skills: [],
  updatedAt: Date.now(),
}));
const loadSkillByName = mock(async () => null);
const getMcpServerRuntime = mock(async () => []);
const getToolPermissionMode = mock(async () => "default");
const getMemorySettings = mock(async () => ({
  autoSaveEnabled: true,
  autoSavePerTurnLimit: 3,
  defaultScope: "global",
  enabled: false,
  memoryDimensions: 1536,
  memoryModel: "text-embedding-3-small",
  memoryProvider: "openai",
  retrievalLimit: 6,
}));
const getToolApprovalPolicies = mock(async () => ({
  list: false,
  glob: false,
  read: false,
  grep: false,
  edit: true,
  multiedit: true,
  create_file: true,
  delete_file: true,
  run_task: true,
  shell_command: true,
  search_memory: false,
  save_memory: false,
  forget_memory: false,
  websearch: true,
  webfetch: true,
}));
const getSearchSettings = mock(async () => ({
  defaultProvider: "exa",
  defaultResultCount: 5,
  maxResultCount: 10,
}));
const getSearchProviderRuntime = mock(async () => ({}));
const getWebFetchSettings = mock(async () => ({
  batchEnabled: false,
  batchLimit: 10,
}));
const getThreadPlanState = mock(async () => ({
  pendingQuestionSet: null,
  plan: null,
}));
const answerThreadPlanQuestionSet = mock(async () => ({
  answers: [],
  questionSetId: "question-set-1",
  status: "answered",
}));

mock.module("ai", () => ({
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  hasToolCall,
  smoothStream,
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
}));

mock.module("./runtime/attachments", () => ({
  createAttachmentDownloadHandler,
}));

mock.module("./model", () => ({
  resolveThreadChatModel,
}));

mock.module("./title/model", () => ({
  resolveThreadTitleModel,
}));

mock.module("./title/generate", () => ({
  generateThreadTitle,
}));

mock.module("./runtime/system-prompt", () => ({
  getSystemPrompt,
}));

mock.module("@/lib/memory/service", () => ({
  autosaveConversationMemories,
  buildMemoryPromptLines,
  extractLatestUserText: (messages: Array<any>) =>
    messages
      .filter((message) => message.role === "user")
      .flatMap((message) => message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
  retrieveRelevantMemories,
}));

mock.module("./tools/search-memory", () => ({
  executeSearchMemory: mock(async () => ({
    query: "query",
    resolvedScope: "global",
    resultCount: 0,
    results: [],
  })),
  searchMemoryInputSchema: z.object({}),
  searchMemoryOutputSchema: z.object({}),
}));

mock.module("./tools/save-memory", () => ({
  executeSaveMemory: mock(async () => ({
    kind: "preference",
    memoryId: "memory-1",
    scope: "global",
    status: "created",
    summary: null,
  })),
  saveMemoryInputSchema: z.object({}),
  saveMemoryOutputSchema: z.object({}),
}));

mock.module("./tools/forget-memory", () => ({
  executeForgetMemory: mock(async () => ({
    deleted: true,
    kind: "preference",
    memoryId: "memory-1",
    summary: null,
  })),
  forgetMemoryInputSchema: z.object({}),
  forgetMemoryOutputSchema: z.object({}),
}));

mock.module("./tools/create-plan", () => ({
  createPlanInputSchema: z.object({}),
  createPlanOutputSchema: z.object({}),
  executeCreatePlan: mock(async () => ({
    audience: "technical",
    document: "# Plan\n\n## Overview\n\nSummary",
    goal: "Goal",
    planId: "plan-1",
    status: "created",
    summary: "Summary",
    taskCount: 2,
    title: "Plan",
  })),
}));

mock.module("./tools/update-plan", () => ({
  executeUpdatePlan: mock(async () => ({
    audience: "technical",
    document: "# Plan\n\n## Overview\n\nSummary",
    goal: "Goal",
    planId: "plan-1",
    summary: "Summary",
    title: "Plan",
  })),
  updatePlanInputSchema: z.object({}),
  updatePlanOutputSchema: z.object({}),
}));

mock.module("./tools/manage-task", () => ({
  executeManageTask: mock(async () => ({
    action: "update",
    planId: "plan-1",
    task: {
      description: null,
      id: "task-1",
      status: "pending",
      title: "Task",
    },
  })),
  manageTaskInputSchema: z.object({}),
  manageTaskOutputSchema: z.object({}),
}));

mock.module("./tools/ask-question", () => {
  const askQuestionInputItemSchema = z.object({
    allowMultiple: z.boolean().optional().describe("When true the user can select multiple options."),
    header: z.string().trim().min(1).max(80),
    id: z.string().trim().min(1).max(80).optional(),
    options: z.array(z.object({
      description: z.string().trim().min(1).max(400),
      label: z.string().trim().min(1).max(160),
    })).min(2).max(8),
    question: z.string().trim().min(1).max(400),
  });

  const askQuestionInputSchema = z.object({
    questions: z.array(askQuestionInputItemSchema).min(1).max(6),
  });

  const askQuestionOutputSchema = z.object({
    answers: z.any().nullable(),
    questionSetId: z.string(),
    questions: z.any().array().min(1).max(3),
    status: z.enum(["pending", "answered"]),
  });

  function trimToLength(v, max) { return v.trim().slice(0, max).trim(); }

  function sanitizeAskQuestionInput(input) {
    const questions = input.questions.slice(0, 3).map((q) => {
      const seen = new Set();
      const options = q.options
        .map((o) => ({ description: trimToLength(o.description, 240), label: trimToLength(o.label, 80) }))
        .filter((o) => o.label.length > 0 && o.description.length > 0 && !seen.has(o.label.toLowerCase()) && seen.add(o.label.toLowerCase()))
        .slice(0, 4);
      return {
        ...(q.allowMultiple ? { allowMultiple: true } : {}),
        header: trimToLength(q.header, 24),
        id: q.id ? trimToLength(q.id, 80) : undefined,
        options,
        question: trimToLength(q.question, 240),
      };
    }).filter((q) => q.options.length >= 2);
    if (questions.length === 0) throw new Error("Need at least one question with 2+ options");
    return { questions };
  }

  async function executeAskQuestion({ input, runtime }) {
    const sanitized = sanitizeAskQuestionInput(input);
    const { createThreadPlanQuestionSet } = await import("@/lib/plan/service");
    const questions = sanitized.questions.map((q, i) => ({ ...q, id: q.id || `q-${i}` }));
    const qs = await createThreadPlanQuestionSet({ questions, threadId: runtime.threadId });
    return { answers: null, questionSetId: qs.id, questions: qs.questions, status: "pending" };
  }

  return {
    askQuestionInputSchema,
    askQuestionOutputSchema,
    executeAskQuestion,
    sanitizeAskQuestionInput,
  };
});

mock.module("./runtime/finalize", () => ({
  buildPersistedAssistantMessage,
}));

mock.module("./runtime/reasoning", () => ({
  createReasoningMetadataTracker,
}));

mock.module("../messages/branches", () => ({
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
}));

mock.module("../messages/ui", () => ({
  validateThreadUIMessage,
  validateThreadUIMessages,
}));

mock.module("./persistence", () => ({
  clearActiveStream,
  ensureThread,
  loadThread,
  loadThreadMessages,
  setActiveMessage,
  setActiveStream,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadTitle,
  upsertMessage,
}));

mock.module("@/lib/streams", () => ({
  streamContext: {
    createNewResumableStream,
  },
}));

mock.module("@/lib/plan/service", () => ({
  answerThreadPlanQuestionSet,
  createThreadPlanQuestionSet: mock(
    async ({ questions }: { questions: unknown[] }) => ({
      id: "qs-1",
      questions,
    }),
  ),
  getThreadPlanState,
}));

mock.module("./runtime/workspace", () => ({
  getMemorySettings,
  getMcpServerRuntime,
  getSearchProviderRuntime,
  getSearchSettings,
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWebFetchSettings,
  getWorkspaceRootPath,
}));

mock.module("@/lib/skills", () => ({
  getSkillSnapshot,
  loadSkillByName,
}));

const { runThreadChat } = await import("./index");

function createUserMessage(text: string) {
  return {
    id: "user-message-1",
    metadata: {},
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

function createAssistantApprovalMessage() {
  return {
    id: "assistant-existing",
    metadata: {
      branchId: "branch-1",
      parentMessageId: "user-message-1",
      status: "completed",
    },
    parts: [
      {
        approval: { id: "approval-1" },
        input: { command: "pwd", rationale: "Confirm workspace path" },
        state: "approval-responded",
        toolCallId: "tool-call-1",
        type: "tool-shell_command",
      },
    ],
    role: "assistant",
  };
}

function createPersistedUserMessage(text: string) {
  return {
    createdAt: new Date("2026-03-10T10:00:00.000Z"),
    id: "db-user-message-1",
    messageId: "user-message-1",
    metadata: { isActive: true, status: "completed" },
    parts: [{ text, type: "text" }],
    role: "user",
    updatedAt: new Date("2026-03-10T10:00:00.000Z"),
  };
}

function createPersistedAssistantToolMessage() {
  return {
    createdAt: new Date("2026-03-10T10:00:01.000Z"),
    id: "assistant-tool-1",
    messageId: "assistant-tool-1",
    metadata: {
      branchId: "user-message-1",
      isActive: true,
      parentMessageId: "user-message-1",
      status: "completed",
    },
    parts: [
      {
        input: { command: "pwd", rationale: "Confirm workspace path" },
        output: {
          cwd: "/tmp/workspace-1",
          durationMs: 24,
          exitCode: 0,
          phase: "completed",
          stderr: "",
          stdout: "/tmp/workspace-1",
          truncated: false,
        },
        state: "output-available",
        toolCallId: "tool-call-regenerate",
        type: "tool-shell_command",
      },
      { text: "Workspace confirmed", type: "text" },
    ],
    role: "assistant",
    updatedAt: new Date("2026-03-10T10:00:01.000Z"),
  };
}

function createSubmitRequest({
  message = createUserMessage("Summarize the refactor"),
  messages,
  messageId,
  modelId = "openai:gpt-5.2",
  reasoningEffort = "high",
  trigger = "submit-user-message",
} = {}) {
  return {
    id: "thread-1",
    message,
    ...(messages ? { messages } : {}),
    ...(messageId ? { messageId } : {}),
    modelId,
    reasoningEffort,
    trigger,
    workspaceId: "workspace-1",
  };
}

function createRetryRequest(
  trigger: "retry-assistant-message" | "regenerate-assistant-message",
) {
  return {
    id: "thread-1",
    messageId: "assistant-1",
    messages: [createPersistedUserMessage("Existing conversation")],
    modelId: "openai:gpt-5.2",
    workspaceId: "workspace-1",
    trigger,
  };
}

beforeEach(() => {
  aiTestState.agentConfig = null;
  aiTestState.prepared = null;
  aiState.streamChunks = [];
  aiState.assistantResponseMessage = {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  };

  loadThreadMessages.mockImplementation(async () => []);
  loadThread.mockImplementation(async () => null);
  resolveThreadTitleModel.mockImplementation(async () => resolvedTitleModel);
  generateThreadTitle.mockImplementation(async () => "Fast title");
  retrieveRelevantMemories.mockImplementation(async () => []);
  buildMemoryPromptLines.mockImplementation(() => []);
  autosaveConversationMemories.mockImplementation(async () => []);
  getToolPermissionMode.mockImplementation(async () => "default");
  getMemorySettings.mockImplementation(async () => ({
    autoSaveEnabled: true,
    autoSavePerTurnLimit: 3,
    defaultScope: "global",
    enabled: false,
    memoryDimensions: 1536,
    memoryModel: "text-embedding-3-small",
    memoryProvider: "openai",
    retrievalLimit: 6,
  }));
  getToolApprovalPolicies.mockImplementation(async () => ({
    list: false,
    glob: false,
    read: false,
    grep: false,
    edit: true,
    multiedit: true,
    create_file: true,
    delete_file: true,
    run_task: true,
    shell_command: true,
    search_memory: false,
    save_memory: false,
    forget_memory: false,
    websearch: true,
    webfetch: true,
  }));
  getSearchSettings.mockImplementation(async () => ({
    defaultProvider: "exa",
    defaultResultCount: 5,
    maxResultCount: 10,
  }));
  getSearchProviderRuntime.mockImplementation(async () => ({}));
  getWebFetchSettings.mockImplementation(async () => ({
    batchEnabled: false,
    batchLimit: 10,
  }));
  getThreadPlanState.mockImplementation(async () => ({
    pendingQuestionSet: null,
    plan: null,
  }));
  answerThreadPlanQuestionSet.mockImplementation(async () => ({
    answers: [],
    questionSetId: "question-set-1",
    status: "answered",
  }));
  getWorkspaceRootPath.mockImplementation(async () => "/tmp/workspace-1");
});

afterEach(() => {
  mock.clearAllMocks();
  mock.restore();
});

describe("runThreadChat title generation", () => {
  it("uses the provider-specific fast title model and keeps thread chat settings on the selected model", async () => {
    const response = await runThreadChat(createSubmitRequest(), "user-1");

    expect(response.status).toBe(200);
    expect(resolveThreadTitleModel).toHaveBeenCalledWith({
      providerId: "openai",
      userId: "user-1",
    });
    expect(generateThreadTitle).toHaveBeenCalledTimes(1);
    expect(generateThreadTitle.mock.calls[0][0]).toEqual({
      firstUserText: "Summarize the refactor",
      model: resolvedTitleModel,
    });
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      mode: "chat",
      modelId: "openai:gpt-5.2",
      reasoningEffort: "high",
    });
    expect(updateThreadTitle).toHaveBeenCalledWith("thread-1", "Fast title");
    expect(aiTestState.prepared?.instructions).toContain(
      "Default directory: /tmp/workspace-1",
    );
    expect(aiTestState.prepared?.instructions).toContain(
      "Permission mode: default",
    );
    expect(aiTestState.prepared?.tools).toHaveProperty("list");
    expect(aiTestState.prepared?.tools).toHaveProperty("grep");
    expect(aiTestState.prepared?.tools).toHaveProperty("shell_command");
    expect(aiTestState.prepared?.tools).toHaveProperty("search_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("save_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("forget_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("websearch");
  });

  it("skips title generation for non-new threads", async () => {
    loadThread.mockImplementation(async () => ({
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
    }));
    loadThreadMessages.mockImplementation(async () => [
      createPersistedUserMessage("Existing conversation"),
    ]);

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });

  it("skips title generation for retry, regenerate, and edit flows", async () => {
    await runThreadChat(
      createRetryRequest("retry-assistant-message"),
      "user-1",
    );
    await runThreadChat(
      createRetryRequest("regenerate-assistant-message"),
      "user-1",
    );
    await runThreadChat(
      createSubmitRequest({
        message: createUserMessage("Edited prompt"),
        messageId: "user-message-1",
        trigger: "edit-user-message",
      }),
      "user-1",
    );

    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });

  it("keeps the fallback title when the first user text is empty", async () => {
    await runThreadChat(
      createSubmitRequest({
        message: {
          id: "user-message-1",
          metadata: {},
          parts: [{ text: "   ", type: "text" }],
          role: "user",
        },
      }),
      "user-1",
    );

    expect(ensureThread).toHaveBeenCalledWith(
      "thread-1",
      "user-1",
      "workspace-1",
      "   ",
      "chat",
    );
    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });
});

describe("runThreadChat approvals and lifecycle", () => {
  it("reuses the existing assistant id for approval continuation", async () => {
    const assistantMessage = createAssistantApprovalMessage();
    const responseMessage = {
      ...assistantMessage,
      parts: [
        ...assistantMessage.parts,
        { text: "Approved command result", type: "text" },
      ],
    };
    aiState.assistantResponseMessage = responseMessage;

    const request = {
      id: "thread-1",
      messages: [createUserMessage("inspect workspace"), assistantMessage],
      trigger: "submit-tool-approval",
      workspaceId: "workspace-1",
    };

    const response = await runThreadChat(request, "user-1");

    expect(response.status).toBe(200);
    expect(createAgentUIStream).toHaveBeenCalledWith(
      expect.objectContaining({
        generateMessageId: expect.any(Function),
        uiMessages: request.messages,
      }),
    );
    expect(setActiveMessage).toHaveBeenCalledWith(
      "thread-1",
      "assistant-existing",
    );
    expect(buildPersistedAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantId: "assistant-existing",
      }),
    );
  });

  it("disposes shell sessions when the stream is stopped", async () => {
    const response = await runThreadChat(
      {
        id: "thread-1",
        messageId: "assistant-1",
        trigger: "stop-stream",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(response.status).toBe(204);
    expect(updateMessageMetadata).toHaveBeenCalledWith(
      "thread-1",
      "assistant-1",
      {
        errorMessage: "Generation stopped.",
        status: "cancelled",
      },
    );
  });

  it("disables shell tooling when the workspace root is unavailable", async () => {
    getWorkspaceRootPath.mockImplementation(async () => null);

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(aiTestState.prepared?.tools).toMatchObject({
      search_memory: expect.any(Object),
      save_memory: expect.any(Object),
      forget_memory: expect.any(Object),
      websearch: expect.any(Object),
      webfetch: expect.any(Object),
    });
    const toolNames = Object.keys(aiTestState.prepared?.tools ?? {});
    expect(toolNames).toContain("search_memory");
    expect(toolNames).toContain("save_memory");
    expect(toolNames).toContain("forget_memory");
    expect(toolNames).toContain("websearch");
    expect(toolNames).toContain("webfetch");
    expect(toolNames).not.toContain("create_plan");
    expect(toolNames).not.toContain("update_plan");
    expect(toolNames).not.toContain("manage_task");
    expect(toolNames).not.toContain("ask_question");
    expect(toolNames).not.toContain("list");
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toContain("shell_command");
    expect(aiTestState.prepared?.instructions).toContain(
      "Workspace tools are currently unavailable because there is no selected workspace root.",
    );
  });

  it("applies stored tool approval overrides to the runtime agent", async () => {
    getToolApprovalPolicies.mockImplementation(async () => ({
      list: true,
      glob: false,
      read: false,
      grep: false,
      edit: false,
      multiedit: false,
      create_file: true,
      delete_file: true,
      run_task: true,
      shell_command: true,
      search_memory: false,
      save_memory: false,
      forget_memory: false,
      websearch: true,
      webfetch: true,
    }));

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(
      await aiTestState.prepared?.tools.list.needsApproval({}, {}),
    ).toBe(true);
    expect(
      await aiTestState.prepared?.tools.edit.needsApproval({}, {}),
    ).toBe(false);
  });

  it("builds a planning-only agent for plan-mode threads", async () => {
    await runThreadChat(
      {
        ...createSubmitRequest(),
        threadMode: "plan",
      },
      "user-1",
    );

    expect(Object.keys(aiTestState.prepared?.tools ?? {})).toEqual([
      "list",
      "glob",
      "read",
      "grep",
      "create_plan",
      "update_plan",
      "manage_task",
      "ask_question",
    ]);
    expect(aiTestState.prepared?.instructions).toContain(
      "This thread is in plan mode.",
    );
    expect(aiTestState.prepared?.instructions).toContain(
      "Gather context from available tools first",
    );
    expect(ensureThread).toHaveBeenCalledWith(
      "thread-1",
      "user-1",
      "workspace-1",
      "Summarize the refactor",
      "plan",
    );
  });

  it("applies a requested mode change before building an existing thread turn", async () => {
    loadThread.mockImplementation(async () => ({
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
    }));

    await runThreadChat(
      {
        ...createSubmitRequest(),
        threadMode: "plan",
      },
      "user-1",
    );

    expect(Object.keys(aiTestState.prepared?.tools ?? {})).toEqual([
      "list",
      "glob",
      "read",
      "grep",
      "create_plan",
      "update_plan",
      "manage_task",
      "ask_question",
    ]);
    expect(updateThreadChatSettings).toHaveBeenCalledWith("thread-1", {
      mode: "plan",
      modelId: "openai:gpt-5.2",
      reasoningEffort: "high",
    });
  });

  it("persists plan answers before continuing a plan-mode assistant turn", async () => {
    loadThread.mockImplementation(async () => ({
      archivedAt: null,
      id: "thread-1",
      mode: "plan",
    }));

    const assistantMessage = {
      id: "assistant-plan",
      metadata: {
        branchId: "branch-1",
        parentMessageId: "user-message-1",
        status: "completed",
      },
      parts: [
        {
          output: {
            answers: [
              {
                answer: "Thread-scoped",
                optionLabel: "Thread-scoped",
                questionId: "q-1",
              },
            ],
            questionSetId: "question-set-1",
            questions: [],
            status: "answered",
          },
          state: "output-available",
          toolCallId: "tool-call-plan-1",
          type: "tool-ask_question",
        },
      ],
      role: "assistant",
    };

    await runThreadChat(
      {
        id: "thread-1",
        messages: [createUserMessage("Plan this"), assistantMessage],
        planAnswers: [
          {
            answer: "Thread-scoped",
            optionLabel: "Thread-scoped",
            questionId: "q-1",
          },
        ],
        planQuestionSetId: "question-set-1",
        trigger: "submit-plan-answer",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(answerThreadPlanQuestionSet).toHaveBeenCalledWith({
      answers: [
        {
          answer: "Thread-scoped",
          optionLabel: "Thread-scoped",
          questionId: "q-1",
        },
      ],
      questionSetId: "question-set-1",
      threadId: "thread-1",
    });
    expect(setActiveMessage).toHaveBeenCalledWith("thread-1", "assistant-plan");
  });

  it("retrieves memory for the system prompt and autosaves after success", async () => {
    getMemorySettings.mockImplementation(async () => ({
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: true,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 6,
    }));
    retrieveRelevantMemories.mockImplementation(async () => [
      {
        content: "Prefers concise answers.",
        id: "memory-1",
        kind: "preference",
        scope: "global",
        score: 0.9,
        summary: "Prefers concise answers.",
        workspaceId: null,
      },
    ]);
    buildMemoryPromptLines.mockImplementation(() => [
      "[Global] preference: Prefers concise answers.",
    ]);

    await runThreadChat(createSubmitRequest(), "user-1");

    expect(retrieveRelevantMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Summarize the refactor",
        settings: expect.objectContaining({ enabled: true }),
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    );
    expect(getSystemPrompt).toHaveBeenCalledWith("user-1", {
      memory: ["[Global] preference: Prefers concise answers."],
    });
    expect(autosaveConversationMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ enabled: true }),
        threadId: "thread-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("regenerates tool-bearing assistant messages from persisted transcript instead of stale client messages", async () => {
    const persistedUser = createPersistedUserMessage("Inspect the workspace");
    const persistedAssistant = createPersistedAssistantToolMessage();

    loadThreadMessages.mockImplementation(async () => [
      persistedUser,
      persistedAssistant,
    ]);
    getMessageRecordById.mockImplementation(() => ({
      parentMessageId: "user-message-1",
    }));

    const staleClientMessages = [
      createUserMessage("Inspect the workspace"),
      {
        id: "assistant-tool-1",
        metadata: {
          branchId: "user-message-1",
          parentMessageId: "user-message-1",
          status: "completed",
        },
        parts: [
          {
            approval: { id: "approval-stale" },
            input: { command: "pwd", rationale: "Confirm workspace path" },
            state: "approval-requested",
            toolCallId: "tool-call-regenerate",
            type: "tool-shell_command",
          },
        ],
        role: "assistant",
      },
    ];

    await runThreadChat(
      {
        id: "thread-1",
        messageId: "assistant-tool-1",
        messages: staleClientMessages,
        trigger: "regenerate-assistant-message",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(createAgentUIStream).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMessages: [persistedUser],
        uiMessages: [persistedUser],
      }),
    );
  });
});
