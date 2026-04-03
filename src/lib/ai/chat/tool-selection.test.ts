import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "./prompt-context";
import { getDefaultToolApprovalPolicies } from "./tool-approval-policy";
import {
  selectAlwaysOnChatTools,
  selectInitialActiveTools,
  selectStepActiveTools,
} from "./tool-selection";

function createPromptContext(overrides: Record<string, unknown> = {}) {
  return buildThreadPromptContext({
    allowedInspectionRoots: ["/tmp/workspace"],
    allowedMutationRoot: "/tmp/workspace",
    availableSkills: [],
    enabledIntegrations: [],
    imageGeneration: {
      available: false,
      defaultProvider: null,
      enabledProviders: [],
    },
    enabledMcpServers: [],
    latestUserText: "install zig and run the tests",
    latentToolSummary: {
      categories: [],
      integrationNamespaces: [],
      mcpNamespaces: [],
    },
    mcpToolNames: [],
    memoryPromptLines: [],
    memoryRuntime: {
      available: false,
      reason: "disabled",
      settings: {
        autoSaveEnabled: true,
        autoSavePerTurnLimit: 3,
        defaultScope: "global",
        enabled: false,
        memoryDimensions: 1536,
        memoryModel: "text-embedding-3-small",
        memoryProvider: "openai",
        retrievalLimit: 6,
      },
    },
    permissionMode: "default",
    planSummary: null,
    preferredProjectRoot: "/tmp/workspace",
    projectCandidates: [],
    searchProviders: {},
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    shellStartDirectory: "/tmp/workspace",
    skillRoots: [],
    sourceMessageId: "message-1",
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

describe("tool selection baselines", () => {
  const availableToolNames = [
    "manage_task",
    "list",
    "glob",
    "read",
    "load_document",
    "grep",
    "diff",
    "batch_read",
    "diagnostics",
    "git",
    "run_task",
    "shell_command",
    "edit",
    "multiedit",
    "create_file",
    "delete_file",
    "move_file",
    "apply_patch",
    "websearch",
    "webfetch",
    "generate_image",
    "search_memory",
  ];

  it("keeps local and web tools always active in chat mode", () => {
    const promptContext = createPromptContext();

    expect(
      selectAlwaysOnChatTools({
        availableToolNames,
        promptContext,
      }),
    ).toEqual(
      expect.arrayContaining([
        "list",
        "glob",
        "read",
        "load_document",
        "grep",
        "diff",
        "batch_read",
        "diagnostics",
        "git",
        "run_task",
        "shell_command",
        "edit",
        "multiedit",
        "create_file",
        "delete_file",
        "move_file",
        "apply_patch",
        "websearch",
        "webfetch",
        "generate_image",
      ]),
    );
  });

  it("uses the local and web baseline for initial chat tool exposure", () => {
    const promptContext = createPromptContext({
      latestUserText: "hello",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames,
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "manage_task",
        "list",
        "read",
        "load_document",
        "run_task",
        "shell_command",
        "edit",
        "apply_patch",
        "websearch",
        "webfetch",
        "generate_image",
      ]),
    );
  });

  it("preserves the local and web baseline on later steps", () => {
    const promptContext = createPromptContext();

    const activeTools = selectStepActiveTools({
      availableToolNames,
      initialActiveTools: ["manage_task"],
      promptContext,
      steps: [],
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "list",
        "grep",
        "load_document",
        "run_task",
        "shell_command",
        "edit",
        "websearch",
        "webfetch",
        "generate_image",
      ]),
    );
  });

  it("does not enable the chat baseline in plan mode", () => {
    const promptContext = createPromptContext({
      threadMode: "plan",
    });

    expect(
      selectAlwaysOnChatTools({
        availableToolNames,
        promptContext,
      }),
    ).toEqual([]);
  });
  it("does not deterministically activate specialized tools from user text", () => {
    const promptContext = createPromptContext({
      enabledIntegrations: [
        {
          label: "Google Drive",
          provider: "google_drive",
          toolCount: 10,
          toolPrefix: "gdrive_",
        },
      ],
      enabledMcpServers: [
        {
          catalogId: "playwright",
          id: "mcp-1",
          name: "Playwright",
          namespace: "playwright",
          toolCount: 2,
          transport: "stdio",
        },
      ],
      latestUserText: "list my drive files and open the browser",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [
        ...availableToolNames,
        "gdrive_list_files",
        "mcp_playwright__browser_snapshot",
      ],
      promptContext,
    });

    expect(activeTools).not.toContain("gdrive_list_files");
    expect(activeTools).not.toContain("mcp_playwright__browser_snapshot");
  });
});
