import { beforeEach, describe, expect, it, mock } from "bun:test";

const ensureVirtualThread = mock(async () => "virtual-thread-1");
const getLatestVisibleChildThreadForVirtualThread = mock(async () => null);
const loadThread = mock(async () => ({
  activeRunId: null,
  activeStreamId: null,
  archivedAt: null,
  chatEngine: "sentinel",
  chatEngineState: null,
  id: "virtual-thread-1",
  mode: "chat",
  parentThreadId: "thread-parent-1",
  sourceVirtualThreadId: null,
  status: "idle",
  title: "Sub-agent: research",
  userId: "user-1",
  visibility: "virtual",
  virtualKey: "research",
  workspaceId: "workspace-1",
}));
const loadThreadMessages = mock(async () => []);
const promoteVirtualThreadToVisibleChild = mock(async () => "child-thread-1");

const runThreadChat = mock(async () => new Response(null, { status: 202 }));
const getThreadPlanState = mock(async () => ({
  pendingQuestionSet: null,
  plan: null,
}));

mock.module("../persistence", () => ({
  ensureVirtualThread,
  getLatestVisibleChildThreadForVirtualThread,
  loadThread,
  loadThreadMessages,
  promoteVirtualThreadToVisibleChild,
}));

mock.module("../runtime/run-thread-chat", () => ({
  runThreadChat,
}));

mock.module("../../messages/branches", () => ({
  buildActiveThreadMessages: (records: Array<any>) =>
    records.map((record) => ({
      id: record.messageId,
      metadata: record.metadata ?? {},
      parts: record.parts,
      role: record.role,
    })),
}));

mock.module("@/lib/plan/service", () => ({
  getThreadPlanState,
}));

const { executeRunSubagent, toRunSubagentModelOutput } =
  await import("./run-subagent");

function createRuntime() {
  return {
    agentRole: "primary",
    availableSkills: [],
    imageGenerationRuntime: { defaultProvider: null, providers: {} },
    memoryRuntime: { available: false, reason: "disabled" },
    permissionMode: "default",
    promptContext: {
      allowedInspectionRoots: ["/workspace"],
      allowedMutationRoot: "/workspace",
      availableSkills: [],
      enabledIntegrations: [],
      enabledMcpServers: [],
      imageGeneration: {
        available: false,
        defaultProvider: null,
        enabledProviders: [],
      },
      latestUserText: "Delegate this task",
      latentToolSummary: {
        categories: [],
        integrationNamespaces: [],
        mcpNamespaces: [],
      },
      mcpToolNames: [],
      memoryPromptLines: [],
      memoryRuntime: { available: false, reason: "disabled" },
      permissionMode: "default",
      planSummary: null,
      preferredProjectRoot: "/workspace",
      projectCandidates: [],
      searchProviders: {},
      searchSettings: { defaultProvider: "exa" },
      shellStartDirectory: "/workspace",
      skillRoots: [],
      sourceMessageId: null,
      threadMode: "chat",
      toolApprovalPolicies: {},
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceRoot: "/workspace",
    },
    resolvedModelId: "openai:gpt-5.2",
    resolvedProviderId: "openai",
    searchProviders: {},
    searchSettings: { defaultProvider: "exa" },
    skillRoots: [],
    systemPrompt: "system",
    threadId: "thread-parent-1",
    threadMode: "chat",
    toolApprovalPolicies: {},
    toolsEnabled: true,
    userId: "user-1",
    videoGenerationRuntime: { defaultProvider: null, providers: {} },
    webFetchSettings: { batchEnabled: false, batchLimit: 10 },
    workspaceId: "workspace-1",
  } as any;
}

beforeEach(() => {
  ensureVirtualThread.mockReset();
  ensureVirtualThread.mockResolvedValue("virtual-thread-1");
  getLatestVisibleChildThreadForVirtualThread.mockReset();
  getLatestVisibleChildThreadForVirtualThread.mockResolvedValue(null);
  loadThread.mockReset();
  loadThread.mockResolvedValue({
    activeRunId: null,
    activeStreamId: null,
    archivedAt: null,
    chatEngine: "sentinel",
    chatEngineState: null,
    id: "virtual-thread-1",
    mode: "chat",
    parentThreadId: "thread-parent-1",
    sourceVirtualThreadId: null,
    status: "idle",
    title: "Sub-agent: research",
    userId: "user-1",
    visibility: "virtual",
    virtualKey: "research",
    workspaceId: "workspace-1",
  });
  loadThreadMessages.mockReset();
  loadThreadMessages.mockResolvedValue([
    {
      createdAt: new Date("2026-04-05T10:00:00.000Z"),
      id: "db-assistant-1",
      messageId: "assistant-1",
      metadata: {},
      parts: [{ text: "Detailed delegated summary", type: "text" }],
      role: "assistant",
      updatedAt: new Date("2026-04-05T10:00:00.000Z"),
    },
  ]);
  promoteVirtualThreadToVisibleChild.mockReset();
  promoteVirtualThreadToVisibleChild.mockResolvedValue("child-thread-1");
  runThreadChat.mockReset();
  runThreadChat.mockResolvedValue(new Response(null, { status: 202 }));
  getThreadPlanState.mockReset();
  getThreadPlanState.mockResolvedValue({
    pendingQuestionSet: null,
    plan: null,
  });
});

describe("run_subagent", () => {
  it("returns only the delegated assistant summary text on successful completion", async () => {
    const result = await executeRunSubagent({
      input: {
        allowMutations: true,
        delegationId: "tool-call-1",
        prompt: "Research the repo layout",
        virtualKey: "project-discovery",
      },
      runtime: createRuntime(),
    });

    expect(runThreadChat).toHaveBeenCalledTimes(1);
    expect(runThreadChat.mock.calls[0]?.[0]).toMatchObject({
      modelId: "openai:gpt-5.2",
    });
    expect(result).toMatchObject({
      childThreadId: null,
      status: "completed",
      summaryText: "Detailed delegated summary",
      virtualThreadId: "virtual-thread-1",
    });
    expect(toRunSubagentModelOutput(result)).toEqual({
      type: "text",
      value: "Detailed delegated summary",
    });
  });

  it("stores the tool call id on unkeyed virtual threads for live resolution", async () => {
    await executeRunSubagent({
      input: {
        allowMutations: true,
        delegationId: "tool-call-live-1",
        prompt: "Discover the project layout",
      },
      runtime: createRuntime(),
    });

    expect(ensureVirtualThread).toHaveBeenCalledWith(
      expect.objectContaining({
        delegationId: "tool-call-live-1",
        virtualKey: null,
      }),
    );
  });

  it("disables mutation tools for the delegated run when allowMutations is false", async () => {
    await executeRunSubagent({
      input: {
        allowMutations: false,
        prompt: "Inspect the project without changing files",
      },
      runtime: createRuntime(),
    });

    expect(runThreadChat.mock.calls[0]?.[0]).toMatchObject({
      toolsEnabled: false,
      trigger: "submit-user-message",
    });
  });

  it("promotes the virtual thread into a visible child when approval is pending", async () => {
    loadThread
      .mockResolvedValueOnce({
        activeRunId: null,
        activeStreamId: null,
        archivedAt: null,
        chatEngine: "sentinel",
        chatEngineState: null,
        id: "virtual-thread-1",
        mode: "chat",
        parentThreadId: "thread-parent-1",
        sourceVirtualThreadId: null,
        status: "idle",
        title: "Sub-agent: research",
        userId: "user-1",
        visibility: "virtual",
        virtualKey: "research",
        workspaceId: "workspace-1",
      })
      .mockResolvedValueOnce({
        activeRunId: null,
        activeStreamId: null,
        archivedAt: null,
        chatEngine: "sentinel",
        chatEngineState: null,
        id: "virtual-thread-1",
        mode: "chat",
        parentThreadId: "thread-parent-1",
        sourceVirtualThreadId: null,
        status: "awaiting_approval",
        title: "Sub-agent: research",
        userId: "user-1",
        visibility: "virtual",
        virtualKey: "research",
        workspaceId: "workspace-1",
      });

    const result = await executeRunSubagent({
      input: {
        allowMutations: true,
        prompt: "Try the delegated command that will need approval",
      },
      runtime: createRuntime(),
    });

    expect(promoteVirtualThreadToVisibleChild).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      childThreadId: "child-thread-1",
      status: "approval_required",
      summaryText: null,
      virtualThreadId: "virtual-thread-1",
    });
  });

  it("reuses an existing visible child that is already awaiting approval", async () => {
    getLatestVisibleChildThreadForVirtualThread.mockResolvedValueOnce({
      activeRunId: null,
      activeStreamId: null,
      archivedAt: null,
      chatEngine: "sentinel",
      chatEngineState: null,
      id: "child-thread-9",
      mode: "chat",
      parentThreadId: "thread-parent-1",
      sourceVirtualThreadId: "virtual-thread-1",
      status: "awaiting_approval",
      title: "Sub-agent approval: research",
      userId: "user-1",
      visibility: "visible",
      virtualKey: null,
      workspaceId: "workspace-1",
    });

    const result = await executeRunSubagent({
      input: {
        allowMutations: true,
        prompt: "Resume the blocked delegated task",
        virtualKey: "research",
      },
      runtime: createRuntime(),
    });

    expect(runThreadChat).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      childThreadId: "child-thread-9",
      status: "approval_required",
      virtualThreadId: "virtual-thread-1",
    });
  });

  it("requests a summary-only follow-up when the delegated run finishes without assistant text", async () => {
    loadThreadMessages
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-04-05T10:00:00.000Z"),
          id: "db-assistant-1",
          messageId: "assistant-1",
          metadata: {},
          parts: [],
          role: "assistant",
          updatedAt: new Date("2026-04-05T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-04-05T10:00:00.000Z"),
          id: "db-assistant-2",
          messageId: "assistant-2",
          metadata: {},
          parts: [{ text: "Recovered delegated summary", type: "text" }],
          role: "assistant",
          updatedAt: new Date("2026-04-05T10:00:01.000Z"),
        },
      ]);

    const result = await executeRunSubagent({
      input: {
        allowMutations: true,
        prompt: "Discover the repo",
      },
      runtime: createRuntime(),
    });

    expect(runThreadChat).toHaveBeenCalledTimes(2);
    expect(runThreadChat.mock.calls[1]?.[0]).toMatchObject({
      modelId: "openai:gpt-5.2",
      toolsEnabled: false,
      trigger: "submit-user-message",
    });
    expect(result).toMatchObject({
      status: "completed",
      summaryText: "Recovered delegated summary",
    });
  });

  it("surfaces the delegated assistant error when the hidden run fails", async () => {
    loadThreadMessages.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-04-05T10:00:00.000Z"),
        id: "db-assistant-1",
        messageId: "assistant-1",
        metadata: {
          errorMessage:
            'Invalid model ID "gemini-2.5-flash". Expected format: "provider:model"',
        },
        parts: [{ text: " ", type: "text" }],
        role: "assistant",
        updatedAt: new Date("2026-04-05T10:00:00.000Z"),
      },
    ]);

    const result = await executeRunSubagent({
      input: {
        allowMutations: true,
        prompt: "Discover the repo",
      },
      runtime: createRuntime(),
    });

    expect(result).toMatchObject({
      status: "failed",
      summaryText:
        'Invalid model ID "gemini-2.5-flash". Expected format: "provider:model"',
    });
    expect(toRunSubagentModelOutput(result)).toEqual({
      type: "text",
      value:
        'Invalid model ID "gemini-2.5-flash". Expected format: "provider:model"',
    });
  });
});
