import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { getDefaultToolApprovalPolicies } =
  await import("../tool-approval-policy");
const { buildTools } = await import("./index");

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    agentRole: "primary",
    availableSkills: [],
    imageGenerationRuntime: { defaultProvider: null, providers: {} },
    memoryRuntime: { available: false, reason: "disabled" },
    permissionMode: "default",
    promptContext: {
      allowedInspectionRoots: [],
      allowedMutationRoot: null,
      availableSkills: [],
      enabledIntegrations: [],
      enabledMcpServers: [],
      imageGeneration: {
        available: false,
        defaultProvider: null,
        enabledProviders: [],
      },
      latestUserText: "desktop computer use",
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
      preferredProjectRoot: null,
      projectCandidates: [],
      searchProviders: {},
      searchSettings: { defaultProvider: "exa" },
      shellStartDirectory: null,
      skillRoots: [],
      sourceMessageId: null,
      threadMode: "chat",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
      workspaceRoot: null,
    },
    searchProviders: {},
    searchSettings: {
      defaultProvider: "exa",
      defaultResultCount: 5,
      maxResultCount: 10,
    },
    skillRoots: [],
    systemPrompt: "system",
    threadId: "thread-1",
    threadMode: "chat",
    toolApprovalPolicies: getDefaultToolApprovalPolicies(),
    toolsEnabled: true,
    userId: "user-1",
    videoGenerationRuntime: { defaultProvider: null, providers: {} },
    webFetchSettings: { batchEnabled: false, batchLimit: 10 },
    workspaceId: null,
    ...overrides,
  } as any;
}

describe("buildTools computer tools", () => {
  it("includes desktop computer-use tools in chat mode", () => {
    const tools = buildTools(createOptions());

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_screenshot",
        "computer_action",
        "computer_apps",
        "computer_app",
        "computer_clipboard",
        "computer_ax_tree",
        "computer_ax_find",
        "computer_ax_action",
      ]),
    );
  });

  it("excludes desktop computer-use tools in plan mode", () => {
    const tools = buildTools(createOptions({ threadMode: "plan" }));

    expect(Object.keys(tools)).not.toEqual(
      expect.arrayContaining([
        "computer_status",
        "computer_screenshot",
        "computer_action",
        "computer_apps",
        "computer_app",
        "computer_clipboard",
        "computer_ax_tree",
        "computer_ax_find",
        "computer_ax_action",
      ]),
    );
  });

  it("allows app focus without approval but gates app launches", async () => {
    const tools = buildTools(createOptions()) as any;

    expect(
      await tools.computer_app.needsApproval(
        { appName: "Craft", mode: "focus" },
        {} as any,
      ),
    ).toBe(false);
    expect(
      await tools.computer_app.needsApproval(
        { appName: "Craft", mode: "open" },
        {} as any,
      ),
    ).toBe(true);
  });
});
