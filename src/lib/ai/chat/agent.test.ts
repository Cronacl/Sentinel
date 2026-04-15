// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const tool = mock((config) => config);
const generateText = mock(async () => ({
  output: {
    categories: ["inspection", "execution"],
    confidence: "high",
    integrationNamespaces: [],
    mcpNamespaces: [],
    reasoning: "Use local inspection and execution tools for coding tasks.",
  },
  text: "{}",
}));
const hasToolCall = mock((toolName) => ({ kind: "has-tool-call", toolName }));
const Output = {
  object: mock((config) => config),
};
const stepCountIs = mock(() => ({ kind: "stop-when" }));
const getEnabledModelsMock = mock(async () => [
  {
    compositeId: "openai:gpt-5-mini",
    displayName: "GPT-5 Mini",
    isCustom: false,
    modelId: "gpt-5-mini",
    provider: "openai",
  },
  {
    compositeId: "anthropic:claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    isCustom: false,
    modelId: "claude-haiku-4-5",
    provider: "anthropic",
  },
  {
    compositeId: "google:gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    isCustom: false,
    modelId: "gemini-2.5-flash",
    provider: "google",
  },
  {
    compositeId: "google_vertex:gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    isCustom: false,
    modelId: "gemini-2.5-flash",
    provider: "google_vertex",
  },
]);
const getLanguageModelMock = mock(async (_userId, compositeId) => ({
  compositeId,
  kind: "router-model",
}));
const getReasoningProviderOptionsMock = mock(
  (provider, modelId, reasoningEffort) => ({
    [provider === "google_vertex" ? "google" : provider]: {
      modelId,
      reasoningEffort,
    },
  }),
);
const executeLoadSkillMock = mock(async () => ({
  content: "# Loaded skill",
  description: "Helpful skill",
  directory: "/tmp/skill-dir",
  files: ["references/guide.md"],
  name: "helpful-skill",
  preview: "# Loaded skill",
  scope: "workspace",
  skillFile: "/tmp/skill-dir/SKILL.md",
  sourceKind: "sentinel",
}));
const aiTestState = ((globalThis as any).__sentinelAiTestState ??= {
  agentConfig: null,
});
const generateImage = mock(async () => ({
  images: [],
  providerMetadata: {},
  responses: [],
  warnings: [],
}));
const experimental_generateVideo = mock(async () => ({
  providerMetadata: {},
  responses: [],
  videos: [],
  warnings: [],
}));
const createGateway = mock(() => ({
  imageModel: () => ({}),
}));
const validateUIMessages = mock(async ({ messages }) => messages);

class MockToolLoopAgent {
  constructor(config) {
    aiTestState.agentConfig = config;
  }
}

mock.module("ai", () => ({
  Output,
  createGateway,
  experimental_generateVideo,
  generateImage,
  generateText,
  hasToolCall,
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
  validateUIMessages,
}));

mock.module("server-only", () => ({}));

mock.module("@/lib/ai/providers/resolver", () => ({
  getEnabledModels: getEnabledModelsMock,
  getLanguageModel: getLanguageModelMock,
}));

mock.module("@/lib/ai/providers/models", async () => {
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
  const actual = await import("@/lib/ai/providers/models.ts?agent-test-actual");

  return {
    ...actual,
    REASONING_EFFORTS: ["none", "minimal", "low", "medium", "high", "xhigh"],
    getReasoningProviderOptions: getReasoningProviderOptionsMock,
    toCompositeModelId: (provider: string, model: string) =>
      `${provider}:${model}`,
  };
});

mock.module("@/lib/integrations/runtime", () => {
  const prefixes: Record<string, string> = {
    github: "gh_",
    gmail: "gmail_",
    google_calendar: "gcal_",
    google_drive: "gdrive_",
    slack: "slack_",
    linear: "linear_",
    notion: "notion_",
    airtable: "airtable_",
    postgresql: "pg_",
    mysql: "mysql_",
    mongodb: "mongo_",
    yahoo_finance: "yfinance_",
    arxiv: "arxiv_",
    pubmed: "pubmed_",
  };

  return {
    getIntegrationToolPrefix: (provider: string) => prefixes[provider] ?? null,
    findIntegrationProviderByToolName: (toolName: string) => {
      for (const [provider, prefix] of Object.entries(prefixes)) {
        if (toolName.startsWith(prefix)) return provider;
      }
      return null;
    },
    getIntegrationLabel: (provider: string) => provider,
    countIntegrationTools: (_provider: string, _tools: string[]) => 0,
  };
});

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

mock.module("./tools/load-skill", () => ({
  executeLoadSkill: executeLoadSkillMock,
  loadSkillInputSchema: z.object({}),
  loadSkillOutputSchema: z.object({}),
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

const { getDefaultToolApprovalPolicies } =
  await import("./tool-approval-policy");
const { buildThreadPromptContext } = await import("./prompt-context");
const { createThreadAgent } = await import("./agent.ts");

const defaultMemoryRuntime = {
  available: true,
  settings: {
    autoSaveEnabled: true,
    autoSavePerTurnLimit: 3,
    defaultScope: "global",
    enabled: true,
    memoryDimensions: 1536,
    memoryModel: "text-embedding-3-small",
    memoryProvider: "openai",
    retrievalLimit: 6,
  },
};

async function prepareWith(options) {
  createThreadAgent({
    languageModel: options.languageModel ?? { kind: "model" },
  });
  const promptContext = buildThreadPromptContext({
    allowedInspectionRoots: options.defaultDirectory
      ? [options.defaultDirectory, ...(options.skillRoots ?? [])]
      : [...(options.skillRoots ?? [])],
    allowedMutationRoot: options.defaultDirectory ?? null,
    availableSkills: options.availableSkills ?? [],
    imageGeneration: options.imageGeneration ?? {
      available: false,
      defaultProvider: null,
      enabledProviders: [],
    },
    enabledMcpServers: options.enabledMcpServers ?? [],
    latestUserText:
      options.latestUserText ?? "Inspect the workspace and fix the issue.",
    latentToolSummary: {
      categories: [],
      integrationNamespaces: [],
      mcpNamespaces: [],
    },
    mcpToolNames: Object.keys(options.mcpTools ?? {}),
    memoryPromptLines: options.memoryPromptLines ?? [],
    memoryRuntime: options.memoryRuntime ?? defaultMemoryRuntime,
    permissionMode: options.permissionMode,
    planSummary: options.planSummary ?? null,
    preferredProjectRoot:
      options.preferredProjectRoot ?? options.defaultDirectory ?? null,
    projectCandidates: options.projectCandidates ?? [],
    searchProviders: options.searchProviders,
    searchSettings: options.searchSettings,
    shellStartDirectory:
      options.shellStartDirectory ?? options.defaultDirectory ?? null,
    skillRoots: options.skillRoots ?? [],
    sourceMessageId: options.sourceMessageId ?? null,
    threadMode: options.threadMode,
    toolApprovalPolicies: options.toolApprovalPolicies,
    webFetchSettings: options.webFetchSettings,
    workspaceRoot: options.defaultDirectory ?? null,
  });
  return aiTestState.agentConfig.prepareCall({
    options: {
      availableSkills: [],
      imageGenerationRuntime:
        options.imageGenerationRuntime ??
        ({
          defaultProvider: null,
          providers: {},
        } as const),
      promptContext,
      resolvedModelId: options.resolvedModelId ?? "gpt-5.2",
      resolvedProviderId: options.resolvedProviderId ?? "openai",
      skillRoots: [],
      videoGenerationRuntime:
        options.videoGenerationRuntime ??
        ({
          defaultProvider: null,
          providers: {},
        } as const),
      ...options,
    },
  });
}

afterEach(() => {
  aiTestState.agentConfig = null;
  mock.restore();
});

describe("createThreadAgent", () => {
  /*
  TODO: restore createThreadAgent coverage.
  Spec:
  - registers workspace inspection tools and guidance.
  */

  /*
  TODO: restore createThreadAgent coverage.
  Spec:
  - keeps webfetch available without a workspace root.
  */

  it("hides memory tools when memory runtime is unavailable", async () => {
    const prepared = await prepareWith({
      defaultDirectory: "/tmp/workspace",
      memoryRuntime: {
        available: false,
        reason: "missing_credentials",
        settings: {
          ...defaultMemoryRuntime.settings,
        },
      },
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-no-memory",
      systemPrompt: "System prompt",
      threadId: "thread-no-memory",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    const toolNames = Object.keys(prepared.tools);
    expect(toolNames).not.toContain("search_memory");
    expect(toolNames).not.toContain("save_memory");
    expect(toolNames).not.toContain("forget_memory");
    expect(prepared.instructions).toContain(
      "Long-term memory: unavailable (missing_credentials).",
    );
  });

  it("keeps load_skill and filesystem inspection available when only skill roots exist", async () => {
    const prepared = await prepareWith({
      availableSkills: [
        {
          description: "Helpful skill",
          directory: "/tmp/skills/helpful-skill",
          name: "helpful-skill",
          preview: "# Helpful skill",
          scope: "global",
          skillFile: "/tmp/skills/helpful-skill/SKILL.md",
          sourceKind: "agents",
        },
      ],
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      skillRoots: ["/tmp/skills/helpful-skill"],
      sourceMessageId: "user-message-skills",
      systemPrompt: "System prompt",
      threadId: "thread-skills",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: false,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(Object.keys(prepared.tools)).toContain("load_skill");
    expect(Object.keys(prepared.tools)).toContain("list");
    expect(Object.keys(prepared.tools)).toContain("shell_command");
    expect(Object.keys(prepared.tools)).not.toContain("edit");
    expect(Object.keys(prepared.tools)).not.toContain("run_task");
    expect(prepared.instructions).toContain("Workspace root: unavailable.");
    expect(prepared.instructions).toContain(
      "Skill roots: /tmp/skills/helpful-skill.",
    );
    expect(prepared.instructions).toContain("~/.codex/skills");
  });

  it("passes the configured global skills base into load_skill execution", async () => {
    const prepared = await prepareWith({
      availableSkills: [
        {
          description: "Helpful skill",
          directory: "/Users/test/.sentinel/skills/helpful-skill",
          name: "helpful-skill",
          preview: "# Helpful skill",
          scope: "global",
          skillFile: "/Users/test/.sentinel/skills/helpful-skill/SKILL.md",
          sourceKind: "sentinel",
        },
      ],
      globalSkillsBasePath: "/Users/test",
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      skillRoots: ["/Users/test/.sentinel/skills/helpful-skill"],
      sourceMessageId: "user-message-skill-load",
      systemPrompt: "System prompt",
      threadId: "thread-skill-load",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: false,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    await prepared.tools.load_skill.execute({ name: "helpful-skill" });

    expect(executeLoadSkillMock).toHaveBeenCalledWith({
      globalBase: "/Users/test",
      input: { name: "helpful-skill" },
      workspaceRoot: null,
    });
  });

  /*
  TODO: restore createThreadAgent coverage.
  Spec:
  - uses per-tool approval overrides when deciding whether to pause.
  */

  it("builds a planning agent with read-only inspection tools for plan mode threads", async () => {
    const prepared = await prepareWith({
      defaultDirectory: "/tmp/workspace",
      availableSkills: [
        {
          description: "Helpful skill",
          directory: "/tmp/workspace/.sentinel/skills/helpful-skill",
          name: "helpful-skill",
          preview: "# Helpful skill",
          scope: "workspace",
          skillFile: "/tmp/workspace/.sentinel/skills/helpful-skill/SKILL.md",
          sourceKind: "sentinel",
        },
      ],
      skillRoots: ["/tmp/workspace/.sentinel/skills/helpful-skill"],
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-4",
      systemPrompt: "System prompt",
      threadId: "thread-4",
      threadMode: "plan",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(Object.keys(prepared.tools)).toEqual([
      "load_skill",
      "list",
      "glob",
      "read",
      "load_document",
      "grep",
      "create_plan",
      "update_plan",
      "manage_task",
      "ask_question",
    ]);
    expect(prepared.instructions).toContain(
      "Plan mode is active. You are a read-only planning specialist.",
    );
    expect(prepared.instructions).toContain(
      "Inspect the linked workspace or skill directories before asking clarification questions",
    );
    expect(prepared.instructions).toContain(
      "the read tool: to read text file contents without approval.",
    );
    expect(await prepared.tools.read.needsApproval({}, {})).toBe(false);
    expect(aiTestState.agentConfig.stopWhen).toHaveLength(3);
    expect(aiTestState.agentConfig.stopWhen[0]).toEqual({
      kind: "stop-when",
    });
    expect(aiTestState.agentConfig.stopWhen[1]).toEqual({
      kind: "has-tool-call",
      toolName: "ask_question",
    });
    expect(typeof aiTestState.agentConfig.stopWhen[2]).toBe("function");
  });

  it("keeps manage_task available in chat mode when a thread already has a plan", async () => {
    const prepared = await prepareWith({
      defaultDirectory: "/tmp/workspace",
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      planSummary: {
        audience: "technical",
        goal: "Ship the feature",
        hasPendingQuestions: false,
        summary: "Current implementation plan",
        taskCount: 2,
        title: "Plan",
      },
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-5",
      systemPrompt: "System prompt",
      threadId: "thread-5",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(Object.keys(prepared.tools)).toContain("manage_task");
    expect(Object.keys(prepared.tools)).toContain("run_subagent");
    expect(Object.keys(prepared.tools)).not.toContain("create_plan");
    expect(Object.keys(prepared.tools)).not.toContain("update_plan");
    expect(Object.keys(prepared.tools)).not.toContain("ask_question");
    expect(prepared.instructions).toContain(
      "Always decompose multi-step work into tasks using manage_task before starting execution.",
    );
  });

  /*
  TODO: restore createThreadAgent coverage.
  Spec:
  - uses the dedicated tool selection model for the active provider.
  */

  it("falls back to deterministic exposure when the router is low confidence", async () => {
    generateText.mockImplementationOnce(async () => ({
      output: {
        categories: ["memory"],
        confidence: "low",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Low-confidence guess.",
      },
      text: "{}",
    }));

    const prepared = await prepareWith({
      defaultDirectory: "/tmp/workspace",
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-low-confidence",
      systemPrompt: "System prompt",
      threadId: "thread-low-confidence",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(prepared.activeTools).toContain("list");
    expect(prepared.activeTools).toContain("run_task");
    expect(prepared.activeTools).toContain("search_memory");
  });

  it("re-routes on later steps when inspection evidence identifies target files", async () => {
    generateText.mockImplementationOnce(async () => ({
      output: {
        categories: ["inspection"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Start with inspection.",
      },
      text: "{}",
    }));
    generateText.mockImplementationOnce(async () => ({
      output: {
        categories: ["mutation"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Target files are known now.",
      },
      text: "{}",
    }));

    await prepareWith({
      defaultDirectory: "/tmp/workspace",
      latestUserText: "Implement the fix in the workspace.",
      memoryRuntime: defaultMemoryRuntime,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-step-reroute",
      systemPrompt: "System prompt",
      threadId: "thread-step-reroute",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    const nextStep = await aiTestState.agentConfig.prepareStep({
      experimental_context: null,
      stepNumber: 2,
      steps: [
        {
          toolCalls: [{ toolName: "read" }],
          toolResults: [{ files: ["src/app.tsx"] }],
        },
      ],
    });

    expect(nextStep.activeTools).toContain("edit");
    expect(nextStep.activeTools).toContain("apply_patch");
  });
});
