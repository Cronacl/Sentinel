import { describe, expect, it } from "bun:test";

import { buildThreadPromptContext } from "../../context/prompt-context";
import { getDefaultToolApprovalPolicies } from "../policy";
import {
  selectAlwaysOnChatTools,
  selectInitialActiveTools,
  selectStepActiveTools,
} from "./index";

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
    videoGeneration: {
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
    "generate_video",
    "search_memory",
  ];
  const browserToolNames = [
    "browser_tabs",
    "browser_open",
    "browser_navigate",
    "browser_back",
    "browser_forward",
    "browser_reload",
    "browser_snapshot",
    "browser_screenshot",
    "browser_click",
    "browser_fill",
    "browser_press",
    "browser_console_logs",
  ];
  const computerToolNames = [
    "computer_status",
    "computer_screenshot",
    "computer_action",
    "computer_apps",
    "computer_app",
    "computer_clipboard",
    "computer_ax_tree",
    "computer_ax_find",
    "computer_ax_action",
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
        "generate_video",
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
        "generate_video",
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
        "generate_video",
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

  it("activates native browser tools for browser-oriented requests", () => {
    const promptContext = createPromptContext({
      latestUserText: "open localhost:3000 in the browser and inspect the UI",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...browserToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "browser_open",
        "browser_snapshot",
        "browser_screenshot",
        "browser_click",
      ]),
    );
  });

  it("activates native browser tools for explicit browser-use requests", () => {
    const promptContext = createPromptContext({
      latestUserText: "use browser use to open localhost and click sign in",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...browserToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "browser_open",
        "browser_snapshot",
        "browser_click",
      ]),
    );
  });

  it("activates native browser tools when the composer browser tag is selected", () => {
    const promptContext = createPromptContext({
      latestUserText: "same",
      toolTags: ["browser"],
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...browserToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "browser_open",
        "browser_snapshot",
        "browser_click",
      ]),
    );
  });

  it("keeps native browser tools inactive for static web page reading", () => {
    const promptContext = createPromptContext({
      latestUserText:
        "read the web page at https://example.com and summarize the article",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...browserToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining(["websearch", "webfetch"]),
    );
    expect(activeTools).not.toEqual(
      expect.arrayContaining(["browser_open", "browser_snapshot"]),
    );
  });

  it("activates native browser tools for live page interactions without saying browser", () => {
    const promptContext = createPromptContext({
      latestUserText:
        "open the checkout page and click the apply coupon button",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...browserToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "browser_open",
        "browser_snapshot",
        "browser_click",
      ]),
    );
  });

  it("activates desktop computer tools for OS-level desktop requests", () => {
    const promptContext = createPromptContext({
      latestUserText:
        "use full desktop computer use to screenshot the screen and click the macOS app window",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...computerToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_screenshot",
        "computer_action",
        "computer_apps",
        "computer_app",
        "computer_clipboard",
      ]),
    );
  });

  it("activates desktop computer tools for local Mac app workflows", () => {
    const promptContext = createPromptContext({
      latestUserText: "add a reminder on my mac reminders app",
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...computerToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_app",
        "computer_ax_tree",
        "computer_ax_find",
        "computer_ax_action",
      ]),
    );
  });

  it("activates desktop computer tools when the composer computer tag is selected", () => {
    const promptContext = createPromptContext({
      latestUserText: "same",
      toolTags: ["computer"],
    });

    const activeTools = selectInitialActiveTools({
      availableToolNames: [...availableToolNames, ...computerToolNames],
      promptContext,
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_app",
        "computer_ax_tree",
        "computer_ax_find",
        "computer_ax_action",
      ]),
    );
  });

  it("keeps desktop computer tools active for short follow-ups inside a Mac UI task", () => {
    const promptContext = createPromptContext({
      latestUserText: "same",
      planSummary: {
        audience: "technical",
        goal: "Add a new reminder using the macOS Reminders UI.",
        hasPendingQuestions: false,
        summary:
          "Use computer-use tools to interact with the Mac Reminders app through the UI.",
        taskCount: 1,
        title: "Add new reminder using macOS UI",
      },
    });

    const activeTools = selectStepActiveTools({
      availableToolNames: [...availableToolNames, ...computerToolNames],
      initialActiveTools: ["manage_task"],
      promptContext,
      steps: [],
    });

    expect(activeTools).toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_app",
        "computer_ax_tree",
        "computer_ax_find",
        "computer_ax_action",
      ]),
    );
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
