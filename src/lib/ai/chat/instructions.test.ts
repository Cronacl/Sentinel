import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "./prompt-context";
import { getDefaultToolApprovalPolicies } from "./tool-approval-policy";
import { buildThreadAgentInstructions } from "./instructions";

function createPromptContext(overrides: Record<string, unknown> = {}) {
  return buildThreadPromptContext({
    availableSkills: [],
    enabledIntegrations: [],
    enabledMcpServers: [],
    mcpToolNames: [],
    memoryPromptLines: [],
    memorySettings: {
      autoSaveEnabled: true,
      autoSavePerTurnLimit: 3,
      defaultScope: "global",
      enabled: false,
      memoryDimensions: 1536,
      memoryModel: "text-embedding-3-small",
      memoryProvider: "openai",
      retrievalLimit: 6,
    },
    permissionMode: "default",
    planSummary: null,
    searchProviders: {
      exa: {
        config: {} as never,
        isEnabled: true,
        provider: "exa",
        settings: {} as never,
      },
    },
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    skillRoots: [],
    sourceMessageId: "user-message-1",
    threadMode: "chat",
    toolApprovalPolicies: getDefaultToolApprovalPolicies(),
    webFetchSettings: {
      batchEnabled: false,
      batchLimit: 10,
    },
    workspaceRoot: "/tmp/workspace",
    ...overrides,
  });
}

describe("buildThreadAgentInstructions", () => {
  it("renders layered runtime-aware chat instructions", () => {
    const promptContext = createPromptContext({
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
      mcpToolNames: ["mcp_server__list_files"],
      memoryPromptLines: ["[Global] preference: Prefers concise answers."],
      memorySettings: {
        autoSaveEnabled: true,
        autoSavePerTurnLimit: 3,
        defaultScope: "global",
        enabled: true,
        memoryDimensions: 1536,
        memoryModel: "text-embedding-3-small",
        memoryProvider: "openai",
        retrievalLimit: 6,
      },
      skillRoots: ["/tmp/workspace/.sentinel/skills/helpful-skill"],
    });

    const instructions = buildThreadAgentInstructions({
      activeToolNames: [
        "list",
        "read",
        "diff",
        "batch_read",
        "edit",
        "move_file",
        "apply_patch",
        "diagnostics",
        "git",
        "run_task",
        "search_memory",
        "websearch",
        "webfetch",
        "load_skill",
        "mcp_server__list_files",
      ],
      promptContext,
      systemPrompt: "System prompt",
    });

    expect(instructions).toContain("System prompt");
    expect(instructions).toContain("## Runtime Snapshot");
    expect(instructions).toContain("Workspace root: /tmp/workspace.");
    expect(instructions).toContain("Long-term memory: enabled");
    expect(instructions).toContain("## Capability Manifest");
    expect(instructions).toContain(
      "the list tool: to browse directory structure without approval.",
    );
    expect(instructions).toContain("## Discovered Skills");
    expect(instructions).toContain("helpful-skill [workspace/sentinel]: Helpful skill");
    expect(instructions).toContain("## Enabled MCP Servers");
    expect(instructions).toContain("mcp_playwright__*");
    expect(instructions).toContain("Use for browser inspection and automation tasks");
    expect(instructions).toContain("server -> list files");
    expect(instructions).toContain("## Decision Heuristics");
    expect(instructions).toContain("Prefer run_task for standard scripts");
    expect(instructions).toContain("Use diff to preview or compare changes");
    expect(instructions).toContain("Use batch_read when you need several files at once");
    expect(instructions).toContain("Prefer git over shell_command");
    expect(instructions).toContain("Prefer diagnostics over parsing raw lint or compiler stdout");
    expect(instructions).toContain("Reach for a skill when the task matches a specialized provider");
    expect(instructions).toContain("Reach for an MCP server when the user is asking about a connected external system");
    expect(instructions).toContain(
      "For research tasks, prefer direct evidence over speculation",
    );
    expect(instructions).toContain(
      "If the request is a general writing, brainstorming, explanation, or transformation task",
    );
    expect(instructions).toContain(
      "infer only clearly supported required inputs from context",
    );
    expect(instructions).toContain(
      "Be proactive when the next step is clear, low-risk, and allowed",
    );
    expect(instructions).toContain("## Mode Overlay");
    expect(instructions).toContain("Chat mode is active.");
    expect(instructions).toContain(
      "Do not ask the user to confirm every obvious intermediate step.",
    );
    expect(instructions).toContain(
      "Do not mention Sentinel's internal implementation details unless they are directly relevant to the task.",
    );
  });

  it("renders plan-mode overlays without execution guidance", () => {
    const instructions = buildThreadAgentInstructions({
      activeToolNames: [
        "list",
        "read",
        "create_plan",
        "update_plan",
        "manage_task",
        "ask_question",
      ],
      promptContext: createPromptContext({
        threadMode: "plan",
      }),
      systemPrompt: "System prompt",
    });

    expect(instructions).toContain(
      "Plan mode is active. You are a read-only planning specialist.",
    );
    expect(instructions).toContain(
      "Use create_plan when the thread has no plan yet.",
    );
    expect(instructions).toContain(
      "Be proactive in gathering discoverable context before asking questions",
    );
    expect(instructions).toContain(
      "Do not mention Sentinel's internal implementation details unless they are directly relevant to the task.",
    );
    expect(instructions).not.toContain("Prefer run_task for standard scripts");
  });

  it("truncates long skills and mcp lists", () => {
    const promptContext = createPromptContext({
      availableSkills: Array.from({ length: 8 }, (_, index) => ({
        description: `Skill ${index + 1}`,
        directory: `/tmp/skills/skill-${index + 1}`,
        name: `skill-${index + 1}`,
        preview: `# Skill ${index + 1}`,
        scope: "global" as const,
        skillFile: `/tmp/skills/skill-${index + 1}/SKILL.md`,
        sourceKind: "sentinel" as const,
      })),
      enabledMcpServers: Array.from({ length: 8 }, (_, index) => ({
        id: `mcp-${index + 1}`,
        name: `Server ${index + 1}`,
        namespace: `server_${index + 1}`,
        toolCount: 1,
        transport: "http" as const,
      })),
      mcpToolNames: Array.from(
        { length: 8 },
        (_, index) => `mcp_server__tool_${index + 1}`,
      ),
    });

    const instructions = buildThreadAgentInstructions({
      activeToolNames: ["load_skill", "mcp_server__tool_1"],
      promptContext,
      systemPrompt: "System prompt",
    });

    expect(instructions).toContain("... and 2 more discovered skills.");
    expect(instructions).toContain("... and 2 more enabled MCP servers.");
  });

  it("omits empty optional sections cleanly", () => {
    const instructions = buildThreadAgentInstructions({
      activeToolNames: ["websearch", "webfetch"],
      promptContext: createPromptContext({
        workspaceRoot: null,
      }),
      systemPrompt: "System prompt",
    });

    expect(instructions).not.toContain("## Discovered Skills");
    expect(instructions).not.toContain("## Enabled MCP Servers");
  });
});
