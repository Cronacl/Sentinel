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
    enabledMcpServers: [],
    latestUserText: "install zig and run the tests",
    latentToolSummary: {
      categories: [],
      integrationNamespaces: [],
      mcpNamespaces: [],
    },
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
        "run_task",
        "shell_command",
        "edit",
        "apply_patch",
        "websearch",
        "webfetch",
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
        "run_task",
        "shell_command",
        "edit",
        "websearch",
        "webfetch",
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
});
