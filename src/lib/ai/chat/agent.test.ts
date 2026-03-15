// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";
import { z } from "zod";

const tool = mock((config) => config);
const generateText = mock(async () => ({ text: "{}" }));
const hasToolCall = mock((toolName) => ({ kind: "has-tool-call", toolName }));
const stepCountIs = mock(() => ({ kind: "stop-when" }));
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

class MockToolLoopAgent {
  constructor(config) {
    aiTestState.agentConfig = config;
  }
}

mock.module("ai", () => ({
  generateText,
  hasToolCall,
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
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

const defaultMemorySettings = {
  autoSaveEnabled: true,
  autoSavePerTurnLimit: 3,
  defaultScope: "global",
  enabled: false,
  memoryDimensions: 1536,
  memoryModel: "text-embedding-3-small",
  memoryProvider: "openai",
  retrievalLimit: 6,
};

function prepareWith(options) {
  createThreadAgent({ languageModel: { kind: "model" } });
  const promptContext = buildThreadPromptContext({
    availableSkills: options.availableSkills ?? [],
    enabledMcpServers: options.enabledMcpServers ?? [],
    mcpToolNames: Object.keys(options.mcpTools ?? {}),
    memoryPromptLines: options.memoryPromptLines ?? [],
    memorySettings: options.memorySettings,
    permissionMode: options.permissionMode,
    planSummary: options.planSummary ?? null,
    searchProviders: options.searchProviders,
    searchSettings: options.searchSettings,
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
      promptContext,
      skillRoots: [],
      ...options,
    },
  });
}

afterEach(() => {
  aiTestState.agentConfig = null;
  mock.restore();
});

describe("createThreadAgent", () => {
  it("registers workspace inspection tools and guidance", async () => {
    const prepared = prepareWith({
      defaultDirectory: "/tmp/workspace",
      mcpTools: {
        mcp_server__list_files: {
          description: "List files from MCP",
          execute: async () => ({ ok: true }),
          needsApproval: () => true,
        },
      },
      memorySettings: defaultMemorySettings,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
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
      enabledMcpServers: [
        {
          catalogId: "playwright",
          id: "mcp-1",
          name: "Playwright",
          namespace: "playwright",
          toolCount: 1,
          transport: "http",
        },
      ],
      skillRoots: ["/tmp/workspace/.sentinel/skills/helpful-skill"],
      sourceMessageId: "user-message-1",
      systemPrompt: "System prompt",
      threadId: "thread-1",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: true, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(prepared.tools).toHaveProperty("search_memory");
    expect(prepared.tools).toHaveProperty("mcp_server__list_files");
    expect(prepared.tools).toHaveProperty("save_memory");
    expect(prepared.tools).toHaveProperty("forget_memory");
    expect(prepared.tools).toHaveProperty("websearch");
    expect(prepared.tools).toHaveProperty("webfetch");
    expect(prepared.tools).toHaveProperty("load_skill");
    expect(prepared.tools.load_skill).not.toHaveProperty("needsApproval");
    expect(prepared.tools).toHaveProperty("list");
    expect(prepared.tools).toHaveProperty("glob");
    expect(prepared.tools).toHaveProperty("read");
    expect(prepared.tools).toHaveProperty("grep");
    expect(prepared.tools).toHaveProperty("diff");
    expect(prepared.tools).toHaveProperty("batch_read");
    expect(prepared.tools).toHaveProperty("edit");
    expect(prepared.tools).toHaveProperty("multiedit");
    expect(prepared.tools).toHaveProperty("create_file");
    expect(prepared.tools).toHaveProperty("delete_file");
    expect(prepared.tools).toHaveProperty("move_file");
    expect(prepared.tools).toHaveProperty("apply_patch");
    expect(prepared.tools).toHaveProperty("diagnostics");
    expect(prepared.tools).toHaveProperty("git");
    expect(prepared.tools).toHaveProperty("run_task");
    expect(prepared.tools).toHaveProperty("shell_command");
    expect(prepared.tools).toHaveProperty("manage_task");
    expect(prepared.tools).not.toHaveProperty("create_plan");
    expect(prepared.tools).not.toHaveProperty("update_plan");
    expect(prepared.tools).not.toHaveProperty("ask_question");
    expect(prepared.instructions).toContain("## Runtime Snapshot");
    expect(prepared.instructions).toContain("Permission mode: default.");
    expect(prepared.instructions).toContain("## Capability Manifest");
    expect(prepared.instructions).toContain("## Discovered Skills");
    expect(prepared.instructions).toContain("## Enabled MCP Servers");
    expect(prepared.instructions).toContain(
      "helpful-skill [workspace/sentinel]: Helpful skill",
    );
    expect(prepared.instructions).toContain("mcp_playwright__*");
    expect(prepared.instructions).toContain("~/.codex/skills");
    expect(prepared.instructions).toContain("the read tool");
    expect(prepared.instructions).toContain("run_task");
    expect(prepared.instructions).toContain("the grep tool");
    expect(prepared.instructions).toContain("the list tool");
    expect(prepared.instructions).toContain("search_memory");
    expect(prepared.instructions).toContain("save_memory");
    expect(prepared.instructions).toContain("forget_memory");
    expect(prepared.instructions).toContain("the websearch tool");
    expect(prepared.instructions).toContain("the webfetch tool");
    expect(prepared.instructions).toContain(
      "When using the searxng provider, use searchType auto and leave livecrawl unset.",
    );
    expect(prepared.instructions).toContain("Webfetch batching: enabled");
    expect(await prepared.tools.list.needsApproval({}, {})).toBe(false);
    expect(await prepared.tools.diff.needsApproval({}, {})).toBe(false);
    expect(await prepared.tools.batch_read.needsApproval({}, {})).toBe(false);
    expect(await prepared.tools.edit.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.multiedit.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.move_file.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.apply_patch.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.diagnostics.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.git.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.search_memory.needsApproval({}, {})).toBe(
      false,
    );
    expect(await prepared.tools.save_memory.needsApproval({}, {})).toBe(false);
    expect(await prepared.tools.forget_memory.needsApproval({}, {})).toBe(
      false,
    );
    expect(await prepared.tools.websearch.needsApproval({}, {})).toBe(true);
  });

  it("keeps webfetch available without a workspace root", () => {
    const prepared = prepareWith({
      languageModel: { kind: "model" },
      memorySettings: defaultMemorySettings,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-2",
      systemPrompt: "System prompt",
      threadId: "thread-2",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: false,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    const toolNames = Object.keys(prepared.tools);
    expect(toolNames).toContain("search_memory");
    expect(toolNames).toContain("save_memory");
    expect(toolNames).toContain("forget_memory");
    expect(toolNames).toContain("websearch");
    expect(toolNames).toContain("webfetch");
    expect(toolNames).toContain("manage_task");
    expect(toolNames).not.toContain("list");
    expect(toolNames).not.toContain("edit");
    expect(toolNames).not.toContain("create_plan");
    expect(toolNames).not.toContain("update_plan");
    expect(toolNames).not.toContain("ask_question");
    expect(prepared.instructions).toContain("Workspace root: unavailable.");
    expect(prepared.instructions).toContain("search_memory");
    expect(prepared.instructions).toContain("save_memory");
    expect(prepared.instructions).toContain("forget_memory");
    expect(prepared.instructions).toContain("websearch");
    expect(prepared.instructions).toContain("webfetch");
    expect(prepared.instructions).toContain("Webfetch batching: disabled.");
  });

  it("keeps load_skill and filesystem inspection available when only skill roots exist", () => {
    const prepared = prepareWith({
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
      memorySettings: defaultMemorySettings,
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
    const prepared = prepareWith({
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
      memorySettings: defaultMemorySettings,
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

  it("uses per-tool approval overrides when deciding whether to pause", async () => {
    const toolApprovalPolicies = getDefaultToolApprovalPolicies();
    toolApprovalPolicies.list = true;
    toolApprovalPolicies.edit = false;

    const prepared = prepareWith({
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
      memorySettings: defaultMemorySettings,
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      sourceMessageId: "user-message-3",
      systemPrompt: "System prompt",
      threadId: "thread-3",
      threadMode: "chat",
      userId: "user-1",
      toolApprovalPolicies,
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceId: "workspace-1",
    });

    expect(await prepared.tools.list.needsApproval({}, {})).toBe(true);
    expect(await prepared.tools.edit.needsApproval({}, {})).toBe(false);
    expect(prepared.instructions).toContain(
      "the list tool: to browse directory structure after approval.",
    );
    expect(prepared.instructions).toContain(
      "the edit tool: for targeted file edits without approval.",
    );
  });

  it("builds a planning agent with read-only inspection tools for plan mode threads", async () => {
    const prepared = prepareWith({
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
      memorySettings: defaultMemorySettings,
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
      "the read tool: to read file contents without approval.",
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

  it("keeps manage_task available in chat mode when a thread already has a plan", () => {
    const prepared = prepareWith({
      defaultDirectory: "/tmp/workspace",
      memorySettings: defaultMemorySettings,
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
    expect(Object.keys(prepared.tools)).not.toContain("create_plan");
    expect(Object.keys(prepared.tools)).not.toContain("update_plan");
    expect(Object.keys(prepared.tools)).not.toContain("ask_question");
    expect(prepared.instructions).toContain(
      "Always decompose multi-step work into tasks using manage_task before starting execution.",
    );
  });
});
