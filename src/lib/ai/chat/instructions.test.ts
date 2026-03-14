import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "./prompt-context";
import { getDefaultToolApprovalPolicies } from "./tool-approval-policy";
import { buildThreadAgentInstructions } from "./instructions";

function createPromptContext(overrides: Record<string, unknown> = {}) {
  return buildThreadPromptContext({
    availableSkills: [],
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
        "edit",
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
    expect(instructions).toContain("helpful-skill: Helpful skill");
    expect(instructions).toContain("## MCP Tools");
    expect(instructions).toContain("server -> list files");
    expect(instructions).toContain("## Decision Heuristics");
    expect(instructions).toContain("Prefer run_task for standard scripts");
    expect(instructions).toContain("## Mode Overlay");
    expect(instructions).toContain("Chat mode is active.");
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
    expect(instructions).toContain("... and 2 more MCP tools.");
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
    expect(instructions).not.toContain("## MCP Tools");
  });
});
