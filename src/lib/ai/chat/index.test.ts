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
    aiTestState.prepared = await aiTestState.agentConfig.prepareCall({
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
const createUIMessageStreamResponse = mock(
  async ({ consumeSseStream, headers, stream }) => {
    if (consumeSseStream) {
      await consumeSseStream({
        stream: new ReadableStream<string>({
          start(controller) {
            controller.close();
          },
        }),
      });
    }

    await stream.done;
    return new Response("ok", { headers, status: 200 });
  },
);
const generateId = mock(() => "stream-id");
const hasToolCall = mock((toolName) => ({ kind: "has-tool-call", toolName }));
const Output = {
  object: mock(({ schema }) => ({ schema })),
};
const readUIMessageStream = mock(async function* () {
  yield aiState.assistantResponseMessage;
});
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
  contextWindow: 128_000,
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
const buildToolRoutingEvidence = mock(() => ({
  executionFailed: false,
  explicitInstallRequest: false,
  inspectionPerformed: false,
  integrationNamespaces: [],
  lastExitCode: null,
  localInspectionWasInsufficient: false,
  mcpNamespaces: [],
  missingCommand: null,
  missingToolchain: false,
  projectContextFound: false,
  suggestedNextAction: null,
  targetFilesFound: false,
}));
const routeToolExposure = mock(async ({ availableToolNames, stage }) => ({
  activeToolNames: availableToolNames,
  audit: {
    decision: null,
    evidence: null,
    finalActiveToolCount: availableToolNames.length,
    mode: "deterministic-fallback",
    reason: "test-router",
    remediationTriggerSource: null,
    rejectedSelections: [],
    routerModelId: null,
    selectedCategories: [],
    selectedIntegrationNamespaces: [],
    selectedMcpNamespaces: [],
    stage,
    usedFallbackModel: true,
  },
}));

const buildActiveThreadMessages = mock((records) => records);
const getLatestVisibleMessageId = mock(() => null);
const getMessageRecordById = mock(() => undefined);
const validateThreadUIMessage = mock(async (message) => message);
const validateThreadUIMessages = mock(async (messages) => messages);
const mapThreadMessagesToUIMessages = mock(async (messages) => messages);

const loadThreadMessages = mock(async () => []);
const loadThread = mock(async () => null);
const getThreadContextCompactionCheckpoint = mock(async () => ({
  coveredThroughMessageId: null,
  summary: null,
  updatedAt: null,
}));
const ensureThread = mock(async () => ({ created: true }));
const enqueueThreadFollowUp = mock(() => {});
const enqueueThreadFollowUpAtFront = mock(() => {});
const claimNextThreadFollowUp = mock(() => null);
const deleteThreadFollowUp = mock(() => {});
const getLatestAssistantMessageId = mock(async () => "assistant-1");
const listThreadFollowUps = mock(async () => []);
const moveThreadFollowUpToFront = mock(() => {});
const removeThreadFollowUp = mock(() => {});
const requeueThreadFollowUp = mock(() => {});
const resetProcessingThreadFollowUps = mock(() => {});
const sessionSnapshotState = {
  activeRunId: null as string | null,
  threadStatus: "idle" as "idle" | "streaming" | "awaiting_approval",
  threadTitle: "New thread",
};
const setThreadStatus = mock(
  (_threadId: string, status: "idle" | "streaming" | "awaiting_approval") => {
    sessionSnapshotState.threadStatus = status;
  },
);
const updateThreadChatSettings = mock(() => {});
const updateThreadContextCompactionCheckpoint = mock(() => {});
const upsertMessage = mock((_threadId, message) => message);
const setActiveMessage = mock(async () => {});
const clearActiveStream = mock(() => {
  sessionSnapshotState.activeRunId = null;
});
const updateThreadTitle = mock((_threadId: string, title: string) => {
  sessionSnapshotState.threadTitle = title;
});
const setActiveStream = mock((_threadId: string, streamId: string) => {
  sessionSnapshotState.activeRunId = streamId;
});
const updateMessageMetadata = mock(async () => {});
const loadThreadSessionSnapshot = mock(async (threadId: string) => ({
  activeRunId: sessionSnapshotState.activeRunId,
  messages: [],
  queuedFollowUps: [],
  threadId,
  threadTitle: sessionSnapshotState.threadTitle,
  threadStatus: sessionSnapshotState.threadStatus,
}));
const serializeThreadStreamEvent = mock(
  (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
);

const createNewResumableStream = mock(async () => {});
const discoverProjectAwareness = mock(async () => ({
  preferredProjectRoot: "/tmp/workspace-1",
  projectCandidates: [],
  shellStartDirectory: "/tmp/workspace-1",
}));
const getWorkspaceRootPath = mock(async () => "/tmp/workspace-1");
const getSkillSnapshot = mock(async () => ({
  revision: 1,
  skillRoots: [],
  skills: [],
  updatedAt: Date.now(),
}));
const loadSkillByName = mock(async () => null);
const loadMcpTools = mock(async () => ({
  closeAll: async () => {},
  tools: {},
}));
const buildIntegrationContext = mock(async () => ({
  databases: {},
  tokens: {},
}));
const countIntegrationTools = mock(() => 0);
const getEnabledIntegrations = mock(async () => []);
const getIntegrationLabel = mock((provider) => provider);
const loadIntegrationTools = mock(async () => ({}));
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
  diff: false,
  batch_read: false,
  edit: true,
  multiedit: true,
  create_file: true,
  delete_file: true,
  move_file: true,
  apply_patch: true,
  run_task: true,
  shell_command: true,
  git: true,
  diagnostics: true,
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
const getContextCompactionSettings = mock(async () => ({
  enabled: false,
  fixedWindowSize: 128_000,
  useFixedWindow: false,
  windowPercent: 70,
}));
const getSearchProviderRuntime = mock(async () => ({}));
const getSkillsBasePath = mock(async () => null);
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
const generateText = mock(async () => ({ text: "{}" }));

mock.module("ai", () => ({
  Output,
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  generateId,
  hasToolCall,
  readUIMessageStream,
  smoothStream,
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
}));

mock.module("server-only", () => ({}));

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

mock.module("./runtime/project-discovery", () => ({
  discoverProjectAwareness,
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
    allowMultiple: z
      .boolean()
      .optional()
      .describe("When true the user can select multiple options."),
    header: z.string().trim().min(1).max(80),
    id: z.string().trim().min(1).max(80).optional(),
    options: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(400),
          label: z.string().trim().min(1).max(160),
        }),
      )
      .min(2)
      .max(8),
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

  function trimToLength(v, max) {
    return v.trim().slice(0, max).trim();
  }

  function sanitizeAskQuestionInput(input) {
    const questions = input.questions
      .slice(0, 3)
      .map((q) => {
        const seen = new Set();
        const options = q.options
          .map((o) => ({
            description: trimToLength(o.description, 240),
            label: trimToLength(o.label, 80),
          }))
          .filter(
            (o) =>
              o.label.length > 0 &&
              o.description.length > 0 &&
              !seen.has(o.label.toLowerCase()) &&
              seen.add(o.label.toLowerCase()),
          )
          .slice(0, 4);
        return {
          ...(q.allowMultiple ? { allowMultiple: true } : {}),
          header: trimToLength(q.header, 24),
          id: q.id ? trimToLength(q.id, 80) : undefined,
          options,
          question: trimToLength(q.question, 240),
        };
      })
      .filter((q) => q.options.length >= 2);
    if (questions.length === 0)
      throw new Error("Need at least one question with 2+ options");
    return { questions };
  }

  async function executeAskQuestion({ input, runtime }) {
    const sanitized = sanitizeAskQuestionInput(input);
    const { createThreadPlanQuestionSet } = await import("@/lib/plan/service");
    const questions = sanitized.questions.map((q, i) => ({
      ...q,
      id: q.id || `q-${i}`,
    }));
    const qs = await createThreadPlanQuestionSet({
      questions,
      threadId: runtime.threadId,
    });
    return {
      answers: null,
      questionSetId: qs.id,
      questions: qs.questions,
      status: "pending",
    };
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

mock.module("./tool-router", () => ({
  buildToolRoutingEvidence,
  routeToolExposure,
}));

mock.module("../messages/branches", () => ({
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
}));

mock.module("../messages/ui", () => ({
  mapThreadMessagesToUIMessages,
  validateThreadUIMessage,
  validateThreadUIMessages,
}));

mock.module("./persistence", () => ({
  claimNextThreadFollowUp,
  clearActiveStream,
  deleteThreadFollowUp,
  enqueueThreadFollowUp,
  enqueueThreadFollowUpAtFront,
  ensureThread,
  getLatestAssistantMessageId,
  getThreadContextCompactionCheckpoint,
  loadThread,
  listThreadFollowUps,
  loadThreadMessages,
  moveThreadFollowUpToFront,
  removeThreadFollowUp,
  requeueThreadFollowUp,
  resetProcessingThreadFollowUps,
  setActiveMessage,
  setActiveStream,
  setThreadStatus,
  updateMessageMetadata,
  updateThreadChatSettings,
  updateThreadContextCompactionCheckpoint,
  updateThreadTitle,
  upsertMessage,
}));

mock.module("./session-server", () => ({
  loadThreadSessionSnapshot,
  serializeThreadStreamEvent,
}));

mock.module("@/lib/streams", () => ({
  streamContext: {
    createNewResumableStream,
  },
}));

mock.module("@/lib/mcp/tools", () => ({
  loadMcpTools,
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
  getContextCompactionSettings,
  getMemorySettings,
  getMcpServerRuntime,
  getSearchProviderRuntime,
  getSearchSettings,
  getSkillsBasePath,
  getToolApprovalPolicies,
  getToolPermissionMode,
  getWebFetchSettings,
  getWorkspaceRootPath,
}));

mock.module("@/lib/integrations/runtime", () => ({
  buildIntegrationContext,
  countIntegrationTools,
  getEnabledIntegrations,
  getIntegrationLabel,
}));

mock.module("@/lib/integrations/registry", () => ({
  loadIntegrationTools,
}));

mock.module("@/server/db", () => ({
  db: {
    delete: mock(() => ({
      where: mock(() => ({
        run: mock(() => {}),
      })),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          run: mock(() => {}),
        })),
        run: mock(() => {}),
      })),
    })),
    query: {},
    select: mock(() => ({
      from: mock(() => ({
        get: mock(() => undefined),
        orderBy: mock(() => ({
          get: mock(() => undefined),
        })),
        where: mock(() => ({
          get: mock(() => undefined),
          orderBy: mock(() => ({
            get: mock(() => undefined),
          })),
        })),
      })),
    })),
    transaction: mock((fn: (tx: any) => void) => fn({})),
    update: mock(() => ({
      set: mock(() => ({
        run: mock(() => {}),
        where: mock(() => ({
          returning: mock(() => ({
            all: mock(() => []),
          })),
          run: mock(() => {}),
        })),
      })),
    })),
  },
}));

mock.module("@/lib/skills", () => ({
  getSkillSnapshot,
  loadSkillByName,
}));

const { runThreadChat } = await import("./index");

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function createDeferred() {
  let resolve: (value: any) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function createUserMessage(text: string) {
  return {
    id: "user-message-1",
    metadata: {},
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

function createTextMessage({
  id,
  metadata = {},
  role,
  text,
}: {
  id: string;
  metadata?: Record<string, unknown>;
  role: "assistant" | "system" | "user";
  text: string;
}) {
  return {
    id,
    metadata,
    parts: [{ text, type: "text" }],
    role,
  };
}

function createMessageWithParts({
  id,
  metadata = {},
  parts,
  role,
}: {
  id: string;
  metadata?: Record<string, unknown>;
  parts: Array<Record<string, unknown>>;
  role: "assistant" | "system" | "user";
}) {
  return {
    id,
    metadata,
    parts,
    role,
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

function createPersistedMessage({
  createdAt = "2026-03-10T10:00:00.000Z",
  id,
  messageId = id,
  metadata = { isActive: true, status: "completed" },
  parts,
  role,
}: {
  createdAt?: string;
  id: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
  parts: Array<Record<string, unknown>>;
  role: "assistant" | "system" | "user";
}) {
  return {
    createdAt: new Date(createdAt),
    id,
    messageId,
    metadata,
    parts,
    role,
    updatedAt: new Date(createdAt),
  };
}

function createPersistedUserMessage(text: string) {
  return createPersistedMessage({
    id: "db-user-message-1",
    messageId: "user-message-1",
    metadata: { isActive: true, status: "completed" },
    parts: [{ text, type: "text" }],
    role: "user",
  });
}

function createPersistedAssistantToolMessage() {
  return createPersistedMessage({
    createdAt: "2026-03-10T10:00:01.000Z",
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
  });
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
  sessionSnapshotState.activeRunId = null;
  sessionSnapshotState.threadStatus = "idle";
  sessionSnapshotState.threadTitle = "New thread";
  aiState.assistantResponseMessage = {
    id: "assistant-response",
    metadata: {},
    parts: [{ text: "Assistant response", type: "text" }],
    role: "assistant",
  };
  resolvedChatModel.contextWindow = 128_000;

  loadThreadMessages.mockImplementation(async () => []);
  loadThread.mockImplementation(async () => null);
  claimNextThreadFollowUp.mockImplementation(() => null);
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
    diff: false,
    batch_read: false,
    edit: true,
    multiedit: true,
    create_file: true,
    delete_file: true,
    move_file: true,
    apply_patch: true,
    run_task: true,
    shell_command: true,
    git: true,
    diagnostics: true,
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
  getContextCompactionSettings.mockImplementation(async () => ({
    enabled: false,
    fixedWindowSize: 128_000,
    useFixedWindow: false,
    windowPercent: 70,
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
  discoverProjectAwareness.mockImplementation(async () => ({
    preferredProjectRoot: "/tmp/workspace-1",
    projectCandidates: [],
    shellStartDirectory: "/tmp/workspace-1",
  }));
  loadMcpTools.mockImplementation(async () => ({
    closeAll: async () => {},
    tools: {},
  }));
  getThreadContextCompactionCheckpoint.mockImplementation(async () => ({
    coveredThroughMessageId: null,
    summary: null,
    updatedAt: null,
  }));
  buildIntegrationContext.mockImplementation(async () => ({
    databases: {},
    tokens: {},
  }));
  countIntegrationTools.mockImplementation(() => 0);
  getEnabledIntegrations.mockImplementation(async () => []);
  getIntegrationLabel.mockImplementation((provider) => provider);
  loadIntegrationTools.mockImplementation(async () => ({}));
  getLatestAssistantMessageId.mockImplementation(async () => "assistant-1");
});

afterEach(() => {
  mock.clearAllMocks();
  mock.restore();
});

describe("runThreadChat title generation", () => {
  it("uses the provider-specific fast title model and keeps thread chat settings on the selected model", async () => {
    const response = await runThreadChat(createSubmitRequest(), "user-1");
    const payload = await response.json();
    await flushAsyncWork();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      activeRunId: "stream-id",
      snapshot: {
        activeRunId: "stream-id",
        threadId: "thread-1",
        threadStatus: "streaming",
        threadTitle: "New thread",
      },
    });
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
      "Workspace root: /tmp/workspace-1.",
    );
    expect(aiTestState.prepared?.instructions).toContain(
      "Permission mode: default.",
    );
    expect(aiTestState.prepared?.tools).toHaveProperty("list");
    expect(aiTestState.prepared?.tools).toHaveProperty("grep");
    expect(aiTestState.prepared?.tools).toHaveProperty("shell_command");
    expect(aiTestState.prepared?.tools).toHaveProperty("search_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("save_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("forget_memory");
    expect(aiTestState.prepared?.tools).toHaveProperty("websearch");
  });

  it("uses default smooth streaming instead of line-buffered chunks", async () => {
    await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(smoothStream).toHaveBeenCalledWith();
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
    await flushAsyncWork();

    expect(resolveThreadTitleModel).not.toHaveBeenCalled();
    expect(generateThreadTitle).not.toHaveBeenCalled();
    expect(updateThreadTitle).not.toHaveBeenCalled();
  });

  it("skips title generation for retry, regenerate, and edit flows", async () => {
    await runThreadChat(
      createRetryRequest("retry-assistant-message"),
      "user-1",
    );
    await flushAsyncWork();
    await runThreadChat(
      createRetryRequest("regenerate-assistant-message"),
      "user-1",
    );
    await flushAsyncWork();
    await runThreadChat(
      createSubmitRequest({
        message: createUserMessage("Edited prompt"),
        messageId: "user-message-1",
        trigger: "edit-user-message",
      }),
      "user-1",
    );
    await flushAsyncWork();

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
    await flushAsyncWork();

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

describe("runThreadChat context compaction", () => {
  function createLongConversation(
    messageCount = 14,
    { assistantInputTokens }: { assistantInputTokens?: number } = {},
  ) {
    return Array.from({ length: messageCount }, (_, index) =>
      createTextMessage({
        id: `message-${index + 1}`,
        metadata:
          index % 2 === 1 && assistantInputTokens !== undefined
            ? {
                status: "completed",
                usage: {
                  inputTokens: assistantInputTokens,
                },
              }
            : { status: "completed" },
        role: index % 2 === 0 ? "user" : "assistant",
        text: `Message ${index + 1}: ${"refactor-details ".repeat(60)}`,
      }),
    );
  }

  it("does not compact when the feature is disabled", async () => {
    const messages = createLongConversation();

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const runtimeMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).not.toHaveBeenCalled();
    expect(updateThreadContextCompactionCheckpoint).not.toHaveBeenCalled();
    expect(runtimeMessages.map((message: any) => message.id)).toEqual(
      messages.map((message) => message.id),
    );
  });

  it("compacts older transcript history and persists a checkpoint", async () => {
    const messages = createLongConversation(14, {
      assistantInputTokens: 240,
    });
    resolvedChatModel.contextWindow = 400;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 128_000,
      useFixedWindow: false,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Compacted thread state</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      model: resolvedChatModel.languageModel,
      providerOptions: resolvedChatModel.providerOptions,
    });
    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledWith(
      "thread-1",
      {
        coveredThroughMessageId: "message-12",
        summary: "Compacted thread state",
      },
    );
    expect(upsertMessage).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          statusLabel: "Compacting context...",
        }),
      }),
    );
    expect(compactedMessages).toHaveLength(7);
    expect(compactedMessages[0]).toMatchObject({
      id: "context-compaction-summary:message-12",
      role: "system",
    });
    expect(
      compactedMessages.slice(1).map((message: any) => message.id),
    ).toEqual([
      "context-compaction-stripped:message-9",
      "context-compaction-stripped:message-10",
      "context-compaction-stripped:message-11",
      "context-compaction-stripped:message-12",
      "message-13",
      "message-14",
    ]);
  });

  it("does not compact when no prior assistant has exact input tokens", async () => {
    const messages = createLongConversation();
    resolvedChatModel.contextWindow = 400;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 128_000,
      useFixedWindow: false,
      windowPercent: 50,
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const runtimeMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).not.toHaveBeenCalled();
    expect(updateThreadContextCompactionCheckpoint).not.toHaveBeenCalled();
    expect(runtimeMessages.map((message: any) => message.id)).toEqual(
      messages.map((message) => message.id),
    );
  });

  it("uses the fixed context window override when enabled", async () => {
    const messages = createLongConversation(14, {
      assistantInputTokens: 240,
    });
    resolvedChatModel.contextWindow = 10_000;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 400,
      useFixedWindow: true,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Fixed window summary</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledWith(
      "thread-1",
      {
        coveredThroughMessageId: "message-12",
        summary: "Fixed window summary",
      },
    );
    expect(compactedMessages[0]).toMatchObject({
      id: "context-compaction-summary:message-12",
      role: "system",
    });
  });

  it("compacts short oversized branches without dropping the latest turn", async () => {
    const messages = createLongConversation(5, {
      assistantInputTokens: 103_040,
    });
    resolvedChatModel.contextWindow = 128_000;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 32_000,
      useFixedWindow: true,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Short branch summary</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledWith(
      "thread-1",
      {
        coveredThroughMessageId: "message-3",
        summary: "Short branch summary",
      },
    );
    expect(compactedMessages.map((message: any) => message.id)).toEqual([
      "context-compaction-summary:message-3",
      "context-compaction-stripped:message-1",
      "context-compaction-stripped:message-2",
      "context-compaction-stripped:message-3",
      "message-4",
      "message-5",
    ]);
  });

  it("keeps only text and file parts in stripped compacted tail messages", async () => {
    const completedAssistantMetadata = {
      status: "completed",
      usage: {
        inputTokens: 103_040,
      },
    };
    const messages = [
      createMessageWithParts({
        id: "message-1",
        metadata: { status: "completed" },
        parts: [{ text: "Review these exports", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-2",
        metadata: completedAssistantMetadata,
        parts: [
          {
            input: { command: "rg export src" },
            output: { stdout: "export const thing = 1;" },
            state: "output-available",
            toolCallId: "tool-call-1",
            type: "tool-shell_command",
          },
          { text: "I found the main exports.", type: "text" },
          { text: "internal chain-of-thought", type: "reasoning" },
        ],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-3",
        metadata: { status: "completed" },
        parts: [
          {
            filename: "exports.csv",
            mediaType: "text/csv",
            type: "file",
            url: "https://example.com/exports.csv",
          },
          { text: "Compare this file too.", type: "text" },
        ],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-4",
        metadata: completedAssistantMetadata,
        parts: [
          {
            approval: { id: "approval-1" },
            input: { path: "src/index.ts" },
            state: "approval-responded",
            toolCallId: "tool-call-2",
            type: "dynamic-tool",
            toolName: "read_file",
          },
          { text: "File reviewed.", type: "text" },
        ],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-5",
        metadata: { status: "completed" },
        parts: [{ text: "What should we refactor next?", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-6",
        metadata: completedAssistantMetadata,
        parts: [
          { text: "Next I would simplify the adapter.", type: "text" },
          {
            input: { command: "git diff" },
            output: { stdout: "..." },
            state: "output-available",
            toolCallId: "tool-call-3",
            type: "tool-shell_command",
          },
        ],
        role: "assistant",
      }),
    ];
    resolvedChatModel.contextWindow = 128_000;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 32_000,
      useFixedWindow: true,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Tool-heavy summary</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;
    const strippedTail = compactedMessages.slice(1, -2);

    expect(updateThreadContextCompactionCheckpoint).toHaveBeenCalledWith(
      "thread-1",
      {
        coveredThroughMessageId: "message-4",
        summary: "Tool-heavy summary",
      },
    );
    expect(strippedTail.map((message: any) => message.id)).toEqual([
      "context-compaction-stripped:message-1",
      "context-compaction-stripped:message-2",
      "context-compaction-stripped:message-3",
      "context-compaction-stripped:message-4",
    ]);
    expect(strippedTail.map((message: any) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(strippedTail[0].parts).toEqual([{ text: "Review these exports", type: "text" }]);
    expect(strippedTail[1].parts).toEqual([
      { text: "I found the main exports.", type: "text" },
    ]);
    expect(strippedTail[2].parts).toEqual([
      {
        filename: "exports.csv",
        mediaType: "text/csv",
        type: "file",
        url: "https://example.com/exports.csv",
      },
      { text: "Compare this file too.", type: "text" },
    ]);
    expect(strippedTail[3].parts).toEqual([
      { text: "File reviewed.", type: "text" },
    ]);
    expect(
      compactedMessages.slice(-2).map((message: any) => message.id),
    ).toEqual(["message-5", "message-6"]);
    expect(upsertMessage).not.toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        id: expect.stringContaining("context-compaction-stripped:"),
      }),
    );
  });

  it("removes provider metadata from stripped assistant copies", async () => {
    const completedAssistantMetadata = {
      status: "completed",
      usage: {
        inputTokens: 103_040,
      },
    };
    const messages = [
      createMessageWithParts({
        id: "message-1",
        metadata: { status: "completed" },
        parts: [{ text: "Continue", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-2",
        metadata: completedAssistantMetadata,
        parts: [
          {
            providerMetadata: {
              openai: {
                itemId: "rs_reasoning_1",
                reasoningEncryptedContent: null,
              },
            },
            text: "",
            type: "reasoning",
          },
          {
            providerMetadata: {
              openai: {
                itemId: "msg_answer_1",
              },
            },
            text: "I checked the code path.",
            type: "text",
          },
        ],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-3",
        metadata: { status: "completed" },
        parts: [{ text: "What next?", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-4",
        metadata: completedAssistantMetadata,
        parts: [{ text: "We should compact this.", type: "text" }],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-5",
        metadata: { status: "completed" },
        parts: [{ text: "Go on", type: "text" }],
        role: "user",
      }),
    ];
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 32_000,
      useFixedWindow: true,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Provider metadata stripped</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;
    const strippedAssistant = compactedMessages.find(
      (message: any) => message.id === "context-compaction-stripped:message-2",
    );

    expect(strippedAssistant).toMatchObject({
      id: "context-compaction-stripped:message-2",
      role: "assistant",
    });
    expect(strippedAssistant.parts).toEqual([
      {
        text: "I checked the code path.",
        type: "text",
      },
    ]);
  });

  it("omits stripped compacted messages that only contain tool or reasoning parts", async () => {
    const completedAssistantMetadata = {
      status: "completed",
      usage: {
        inputTokens: 103_040,
      },
    };
    const messages = [
      createMessageWithParts({
        id: "message-1",
        metadata: { status: "completed" },
        parts: [{ text: "Run checks", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-2",
        metadata: completedAssistantMetadata,
        parts: [
          {
            input: { command: "bun test" },
            output: { stdout: "ok" },
            state: "output-available",
            toolCallId: "tool-call-1",
            type: "tool-shell_command",
          },
        ],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-3",
        metadata: { status: "completed" },
        parts: [{ text: "Anything else?", type: "text" }],
        role: "user",
      }),
      createMessageWithParts({
        id: "message-4",
        metadata: completedAssistantMetadata,
        parts: [{ text: "private reasoning", type: "reasoning" }],
        role: "assistant",
      }),
      createMessageWithParts({
        id: "message-5",
        metadata: { status: "completed" },
        parts: [{ text: "Please continue", type: "text" }],
        role: "user",
      }),
    ];
    resolvedChatModel.contextWindow = 128_000;
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 32_000,
      useFixedWindow: true,
      windowPercent: 50,
    }));
    generateText.mockImplementationOnce(async () => ({
      text: "<summary>Minimal stripped summary</summary>",
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(compactedMessages.map((message: any) => message.id)).toEqual([
      "context-compaction-summary:message-3",
      "context-compaction-stripped:message-1",
      "context-compaction-stripped:message-3",
      "message-4",
      "message-5",
    ]);
  });

  it("reuses an existing checkpoint when it is still valid", async () => {
    const messages = createLongConversation(10, {
      assistantInputTokens: 120,
    });
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 128_000,
      useFixedWindow: false,
      windowPercent: 95,
    }));
    getThreadContextCompactionCheckpoint.mockImplementation(async () => ({
      coveredThroughMessageId: "message-2",
      summary: "Existing summary",
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).not.toHaveBeenCalled();
    expect(updateThreadContextCompactionCheckpoint).not.toHaveBeenCalled();
    expect(compactedMessages[0]).toMatchObject({
      id: "context-compaction-summary:message-2",
      role: "system",
    });
    expect(
      compactedMessages.slice(1).map((message: any) => message.id),
    ).toEqual([
      "message-3",
      "message-4",
      "message-5",
      "message-6",
      "message-7",
      "message-8",
      "message-9",
      "message-10",
    ]);
  });

  it("ignores an invalid checkpoint and leaves the raw tail intact", async () => {
    const messages = createLongConversation(10, {
      assistantInputTokens: 120,
    });
    getContextCompactionSettings.mockImplementation(async () => ({
      enabled: true,
      fixedWindowSize: 128_000,
      useFixedWindow: false,
      windowPercent: 95,
    }));
    getThreadContextCompactionCheckpoint.mockImplementation(async () => ({
      coveredThroughMessageId: "missing-message",
      summary: "Stale summary",
      updatedAt: new Date("2026-03-10T10:00:00.000Z"),
    }));

    await runThreadChat(
      {
        id: "thread-1",
        messages,
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "submit-tool-approval",
        workspaceId: "workspace-1",
      },
      "user-1",
    );
    await flushAsyncWork();

    const compactedMessages =
      createAgentUIStream.mock.calls.at(-1)?.[0]?.uiMessages;

    expect(generateText).not.toHaveBeenCalled();
    expect(updateThreadContextCompactionCheckpoint).not.toHaveBeenCalled();
    expect(compactedMessages.map((message: any) => message.id)).toEqual(
      messages.map((message) => message.id),
    );
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
    await flushAsyncWork();

    expect(response.status).toBe(202);
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
    await flushAsyncWork();

    expect(response.status).toBe(204);
    expect(updateMessageMetadata).toHaveBeenCalledWith(
      "thread-1",
      "assistant-1",
      {
        errorMessage: "Generation stopped.",
        status: "cancelled",
        statusLabel: null,
      },
    );
  });

  it("queues a follow-up on the backend without starting a new run", async () => {
    loadThread.mockImplementation(async () => ({
      activeStreamId: "stream-1",
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
      status: "streaming",
      userId: "user-1",
      workspaceId: "workspace-1",
    }));

    const response = await runThreadChat(
      {
        id: "thread-1",
        message: createUserMessage("Queue this for later"),
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "queue-follow-up",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(response.status).toBe(204);
    expect(enqueueThreadFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-message-1",
        modelId: "openai:gpt-5.2",
        threadId: "thread-1",
        threadMode: "chat",
      }),
    );
    expect(createAgentUIStream).not.toHaveBeenCalled();
  });

  it("steers by queuing at the front and cancelling the active assistant", async () => {
    loadThread.mockImplementation(async () => ({
      activeStreamId: "stream-1",
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
      status: "streaming",
      userId: "user-1",
      workspaceId: "workspace-1",
    }));

    const response = await runThreadChat(
      {
        id: "thread-1",
        message: createUserMessage("Steer this run"),
        modelId: "openai:gpt-5.2",
        reasoningEffort: "high",
        trigger: "steer-follow-up",
        workspaceId: "workspace-1",
      },
      "user-1",
    );

    expect(response.status).toBe(204);
    expect(enqueueThreadFollowUpAtFront).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-message-1",
        threadId: "thread-1",
      }),
    );
    expect(updateMessageMetadata).toHaveBeenCalledWith(
      "thread-1",
      "assistant-1",
      {
        errorMessage: "Generation stopped.",
        status: "cancelled",
        statusLabel: null,
      },
    );
  });

  it("starts the next queued follow-up after stop-stream", async () => {
    let claims = 0;
    loadThread.mockImplementation(async () => ({
      activeStreamId: null,
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
      status: "idle",
      userId: "user-1",
      workspaceId: "workspace-1",
    }));
    claimNextThreadFollowUp.mockImplementation(() => {
      claims += 1;
      if (claims > 1) {
        return null;
      }

      return {
        createdAt: new Date("2026-03-10T10:00:02.000Z"),
        id: "queued-1",
        modelId: "openai:gpt-5.2",
        parts: [{ text: "Continue with the queue", type: "text" }],
        reasoningEffort: "high",
        status: "processing",
        threadId: "thread-1",
        threadMode: "chat",
        updatedAt: new Date("2026-03-10T10:00:02.000Z"),
      };
    });

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
    expect(createNewResumableStream).toHaveBeenCalled();
    expect(deleteThreadFollowUp).toHaveBeenCalledWith("thread-1", "queued-1");
  });

  it("does not finalize a stream after a newer stream takes ownership", async () => {
    let loadCalls = 0;
    loadThread.mockImplementation(async () => {
      loadCalls += 1;

      if (loadCalls === 1) {
        return {
          activeStreamId: null,
          archivedAt: null,
          id: "thread-1",
          mode: "chat",
          status: "idle",
          userId: "user-1",
          workspaceId: "workspace-1",
        };
      }

      return {
        activeStreamId: "newer-stream",
        archivedAt: null,
        id: "thread-1",
        mode: "chat",
        status: "streaming",
        userId: "user-1",
        workspaceId: "workspace-1",
      };
    });
    claimNextThreadFollowUp.mockImplementation(() => ({
      createdAt: new Date("2026-03-10T10:00:02.000Z"),
      id: "queued-1",
      modelId: "openai:gpt-5.2",
      parts: [{ text: "This should stay queued", type: "text" }],
      reasoningEffort: "high",
      status: "processing",
      threadId: "thread-1",
      threadMode: "chat",
      updatedAt: new Date("2026-03-10T10:00:02.000Z"),
    }));

    const response = await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(response.status).toBe(202);
    expect(buildPersistedAssistantMessage).not.toHaveBeenCalled();
    expect(clearActiveStream).toHaveBeenCalledTimes(0);
    expect(createAgentUIStream).toHaveBeenCalled();
    expect(deleteThreadFollowUp).not.toHaveBeenCalled();
  });

  it("disables shell tooling when the workspace root is unavailable", async () => {
    getWorkspaceRootPath.mockImplementation(async () => null);

    await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

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
    expect(toolNames).toContain("manage_task");
    expect(toolNames).not.toContain("create_plan");
    expect(toolNames).not.toContain("update_plan");
    expect(toolNames).not.toContain("ask_question");
    expect(toolNames).not.toContain("list");
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toContain("shell_command");
    expect(aiTestState.prepared?.instructions).toContain(
      "Workspace root: unavailable.",
    );
    expect(aiTestState.prepared?.instructions).toContain(
      "Workspace-bound file and task tools remain unavailable until a workspace root is selected.",
    );
  });

  it("applies stored tool approval overrides to the runtime agent", async () => {
    getToolApprovalPolicies.mockImplementation(async () => ({
      list: true,
      glob: false,
      read: false,
      grep: false,
      diff: false,
      batch_read: false,
      edit: false,
      multiedit: false,
      create_file: true,
      delete_file: true,
      move_file: true,
      apply_patch: true,
      run_task: true,
      shell_command: true,
      git: true,
      diagnostics: true,
      search_memory: false,
      save_memory: false,
      forget_memory: false,
      websearch: true,
      webfetch: true,
    }));

    await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(await aiTestState.prepared?.tools.list.needsApproval({}, {})).toBe(
      true,
    );
    expect(await aiTestState.prepared?.tools.edit.needsApproval({}, {})).toBe(
      false,
    );
  });

  it("builds a planning-only agent for plan-mode threads", async () => {
    await runThreadChat(
      {
        ...createSubmitRequest(),
        threadMode: "plan",
      },
      "user-1",
    );
    await flushAsyncWork();

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
      "Plan mode is active. You are a read-only planning specialist.",
    );
    expect(aiTestState.prepared?.instructions).toContain(
      "Inspect the linked workspace or skill directories before asking clarification questions",
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
    await flushAsyncWork();

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

  it("keeps manage_task available in chat mode when the thread already has a plan", async () => {
    getThreadPlanState.mockImplementation(async () => ({
      pendingQuestionSet: null,
      plan: {
        audience: "technical",
        createdAt: new Date(),
        document: "# Plan\n\n## Overview\n\nSummary",
        goal: "Ship the feature",
        id: "plan-1",
        summary: "Current implementation plan",
        tasks: [
          {
            createdAt: new Date(),
            description: null,
            id: "task-1",
            status: "pending",
            title: "Inspect the repo",
            updatedAt: new Date(),
          },
        ],
        threadId: "thread-1",
        title: "Plan",
        updatedAt: new Date(),
      },
    }));

    await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    const toolNames = Object.keys(aiTestState.prepared?.tools ?? {});
    expect(toolNames).toContain("manage_task");
    expect(toolNames).not.toContain("create_plan");
    expect(toolNames).not.toContain("update_plan");
    expect(toolNames).not.toContain("ask_question");
    expect(aiTestState.prepared?.instructions).toContain(
      "Always decompose multi-step work into tasks using manage_task before starting execution.",
    );
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
    await flushAsyncWork();

    expect(retrieveRelevantMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Summarize the refactor",
        settings: expect.objectContaining({ enabled: true }),
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    );
    expect(getSystemPrompt).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        memoryPromptLines: ["[Global] preference: Prefers concise answers."],
        threadMode: "chat",
        workspaceRoot: "/tmp/workspace-1",
      }),
    );
    expect(autosaveConversationMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ enabled: true }),
        threadId: "thread-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("starts preflight dependencies before project discovery resolves", async () => {
    const projectDiscovery = createDeferred();
    const started: string[] = [];

    discoverProjectAwareness.mockImplementation(() => {
      started.push("project-discovery");
      return projectDiscovery.promise;
    });
    getSkillSnapshot.mockImplementation(async () => {
      started.push("skills");
      return {
        revision: 1,
        skillRoots: [],
        skills: [],
        updatedAt: Date.now(),
      };
    });
    retrieveRelevantMemories.mockImplementation(async () => {
      started.push("memory");
      return [];
    });
    loadMcpTools.mockImplementation(async () => {
      started.push("mcp");
      return {
        closeAll: async () => {},
        tools: {},
      };
    });
    getEnabledIntegrations.mockImplementation(async () => [
      {
        id: "integration-1",
        isEnabled: true,
        provider: "github",
      },
    ]);
    buildIntegrationContext.mockImplementation(async () => {
      started.push("integration-context");
      return {
        databases: {},
        tokens: {},
      };
    });
    loadIntegrationTools.mockImplementation(async () => {
      started.push("integration-tools");
      return {};
    });

    const response = await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(response.status).toBe(202);
    expect(started).toEqual(
      expect.arrayContaining([
        "project-discovery",
        "skills",
        "memory",
        "mcp",
        "integration-context",
        "integration-tools",
      ]),
    );

    projectDiscovery.resolve({
      preferredProjectRoot: "/tmp/workspace-1",
      projectCandidates: [],
      shellStartDirectory: "/tmp/workspace-1",
    });
    await flushAsyncWork();
  });

  it("keeps startup fallback behavior non-fatal when optional preflight work fails", async () => {
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
    getEnabledIntegrations.mockImplementation(async () => [
      {
        id: "integration-1",
        isEnabled: true,
        provider: "github",
      },
    ]);
    getSkillSnapshot.mockImplementation(async () => {
      throw new Error("skills failed");
    });
    retrieveRelevantMemories.mockImplementation(async () => {
      throw new Error("memory failed");
    });
    loadMcpTools.mockImplementation(async () => {
      throw new Error("mcp failed");
    });
    buildIntegrationContext.mockImplementation(async () => {
      throw new Error("integration context failed");
    });

    const response = await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(response.status).toBe(202);
    expect(createAgentUIStream).toHaveBeenCalled();
    expect(getSystemPrompt).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        availableSkills: [],
        enabledIntegrations: [
          expect.objectContaining({
            provider: "github",
            toolCount: 0,
          }),
        ],
        memoryPromptLines: [],
        workspaceRoot: "/tmp/workspace-1",
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
    await flushAsyncWork();

    expect(createAgentUIStream).toHaveBeenCalledWith(
      expect.objectContaining({
        originalMessages: [persistedUser],
        uiMessages: [persistedUser],
      }),
    );
  });

  it("drains the next queued follow-up after a normal finish", async () => {
    let claims = 0;
    let activeStreamId: string | null = null;
    claimNextThreadFollowUp.mockImplementation(() => {
      claims += 1;
      if (claims > 1) {
        return null;
      }

      return {
        createdAt: new Date("2026-03-10T10:00:02.000Z"),
        id: "queued-1",
        modelId: "openai:gpt-5.2",
        parts: [{ text: "Continue with the queue", type: "text" }],
        reasoningEffort: "high",
        status: "processing",
        threadId: "thread-1",
        threadMode: "chat",
        updatedAt: new Date("2026-03-10T10:00:02.000Z"),
      };
    });
    loadThread.mockImplementation(async () => ({
      activeStreamId,
      archivedAt: null,
      id: "thread-1",
      mode: "chat",
      status: activeStreamId ? "streaming" : "idle",
      userId: "user-1",
      workspaceId: "workspace-1",
    }));
    setActiveStream.mockImplementation((_threadId, streamId) => {
      activeStreamId = streamId;
    });
    clearActiveStream.mockImplementation(() => {
      activeStreamId = null;
    });

    const response = await runThreadChat(createSubmitRequest(), "user-1");
    await flushAsyncWork();

    expect(response.status).toBe(202);
    expect(createAgentUIStream).toHaveBeenCalledTimes(2);
    expect(createNewResumableStream).toHaveBeenCalledTimes(2);
    expect(deleteThreadFollowUp).toHaveBeenCalledWith("thread-1", "queued-1");
  });
});
