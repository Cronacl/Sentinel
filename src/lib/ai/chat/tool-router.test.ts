import { afterEach, describe, expect, it, mock } from "bun:test";

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
]);

const getLanguageModelMock = mock(
  async (_userId: string, compositeId: string) => ({
    compositeId,
    kind: "router-model",
  }),
);

const getReasoningProviderOptionsMock = mock(
  (
    provider: string,
    modelId: string,
    reasoningEffort: string,
  ) => ({
    [provider === "google_vertex" ? "google" : provider]: {
      modelId,
      reasoningEffort,
    },
  }),
);

mock.module("@/lib/ai/providers/resolver", () => ({
  getEnabledModels: getEnabledModelsMock,
  getLanguageModel: getLanguageModelMock,
}));

mock.module("@/lib/ai/providers/models", () => ({
  getReasoningProviderOptions: getReasoningProviderOptionsMock,
}));

const { buildThreadPromptContext } = await import("./prompt-context");
const { getDefaultToolApprovalPolicies } = await import("./tool-approval-policy");
const {
  buildToolRoutingEvidence,
  buildToolRouterPrompt,
  buildToolRouterSystemPrompt,
  routeToolExposure,
  resolveToolRouterModel,
  validateToolRoutingDecision,
} = await import("./tool-router");

function createPromptContext(overrides: Record<string, unknown> = {}) {
  return buildThreadPromptContext({
    allowedInspectionRoots: ["/tmp/workspace"],
    allowedMutationRoot: "/tmp/workspace",
    availableSkills: [],
    enabledIntegrations: [
      {
        label: "GitHub",
        provider: "github",
        toolCount: 4,
      },
    ],
    enabledMcpServers: [
      {
        id: "mcp-playwright",
        name: "Playwright",
        namespace: "playwright",
        toolCount: 2,
        transport: "http",
      },
    ],
    latestUserText: "Inspect the workspace and fix the issue.",
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

afterEach(() => {
  mock.restore();
});

describe("tool router", () => {
  it("selects the fixed compact router model for the active provider", async () => {
    const result = await resolveToolRouterModel({
      mainLanguageModel: { kind: "main-model" },
      resolvedModelId: "gpt-5.2",
      resolvedProviderId: "openai",
      userId: "user-1",
    });

    expect(getEnabledModelsMock).toHaveBeenCalledWith("user-1");
    expect(getLanguageModelMock).toHaveBeenCalledWith(
      "user-1",
      "openai:gpt-5-mini",
    );
    expect(result.routerModelId).toBe("openai:gpt-5-mini");
    expect(result.usedFallbackModel).toBe(false);
  });

  it("falls back to the main model when the fixed router model is unavailable", async () => {
    getEnabledModelsMock.mockImplementationOnce(async () => [
      {
        compositeId: "openai:gpt-5.2",
        displayName: "GPT-5.2",
        isCustom: false,
        modelId: "gpt-5.2",
        provider: "openai",
      },
    ]);

    const result = await resolveToolRouterModel({
      mainLanguageModel: { kind: "main-model" },
      mainProviderOptions: { openai: { reasoningEffort: "medium" } },
      resolvedModelId: "gpt-5.2",
      resolvedProviderId: "openai",
      userId: "user-1",
    });

    expect(result.languageModel).toEqual({ kind: "main-model" });
    expect(result.routerModelId).toBe("openai:gpt-5.2");
    expect(result.usedFallbackModel).toBe(true);
  });

  it("strips mutation exposure when there is no mutation root", () => {
    const promptContext = createPromptContext({
      allowedMutationRoot: null,
      workspaceRoot: null,
    });

    const validated = validateToolRoutingDecision({
      availableToolNames: ["manage_task", "edit", "apply_patch", "list", "read"],
      decision: {
        categories: ["inspection", "mutation"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Inspect then edit.",
      },
      fallbackActiveToolNames: ["manage_task", "list", "read"],
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "initial",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toContain("manage_task");
    expect(validated.activeToolNames).toContain("list");
    expect(validated.activeToolNames).toContain("read");
    expect(validated.activeToolNames).not.toContain("edit");
    expect(validated.activeToolNames).not.toContain("apply_patch");
    expect(validated.audit.rejectedSelections).toContain(
      "category:mutation:no-mutation-root",
    );
  });

  it("rejects unrelated integration and MCP namespaces", () => {
    const promptContext = createPromptContext();

    const validated = validateToolRoutingDecision({
      availableToolNames: [
        "manage_task",
        "gh_search_repositories",
        "mcp_playwright__browser_snapshot",
      ],
      decision: {
        categories: [],
        confidence: "high",
        integrationNamespaces: ["slack"],
        mcpNamespaces: ["figma"],
        reasoning: "Use external systems.",
      },
      fallbackActiveToolNames: ["manage_task"],
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "initial",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toEqual(["manage_task"]);
    expect(validated.audit.rejectedSelections).toContain(
      "integration:slack:not-enabled",
    );
    expect(validated.audit.rejectedSelections).toContain("mcp:figma:not-enabled");
  });

  it("builds a minimal next-step routing prompt with explicit narrowing rules", () => {
    const systemPrompt = buildToolRouterSystemPrompt();
    const prompt = buildToolRouterPrompt({
      allowedInspectionRoots: ["/tmp/workspace"],
      allowedMutationRoot: "/tmp/workspace",
      availableCategories: ["inspection", "execution", "mutation", "web"],
      availableIntegrationNamespaces: ["github"],
      availableMcpNamespaces: ["playwright"],
      intentHints: {
        explicitInstallRequest: false,
        likelyExternalResearch: false,
        likelyIntegrationTask: false,
        likelyProjectWork: true,
      },
      permissionMode: "default",
      planSummary: null,
      preferredProjectRoot: "/tmp/workspace/app",
      projectCandidates: [],
      shellStartDirectory: "/tmp/workspace/app",
      stage: "initial",
      threadMode: "chat",
      toolUniverseSize: 24,
      userRequest: "Find the bug and fix it",
      workspaceRoot: "/tmp/workspace",
    });

    expect(systemPrompt).toContain(
      "Choose the smallest set of tool categories and namespaces needed for the next step only",
    );
    expect(systemPrompt).toContain(
      "Promote mutation only when the task clearly requires changes and the likely target files or edit scope are known.",
    );
    expect(systemPrompt).toContain(
      "For environment remediation, installs, setup, missing commands, or missing toolchains, prefer shell_command exposure",
    );
    expect(systemPrompt).toContain(
      "Approval-gated tools are still available capabilities.",
    );
    expect(systemPrompt).toContain(
      "If confidence is low, stay narrow and rely on the runtime fallback",
    );
    expect(prompt).toContain("Select only what is necessary immediately.");
    expect(prompt).toContain(
      "Use shell remediation for explicit install/setup intent or missing-command evidence when shell_command is available.",
    );
    expect(prompt).toContain("Return empty arrays for unused categories or namespaces.");
    expect(prompt).toContain('"toolUniverseSize": 24');
  });

  it("forces shell remediation for explicit install requests", async () => {
    const promptContext = createPromptContext({
      latestUserText: "install it using brew",
    });

    const routed = await routeToolExposure({
      availableToolNames: [
        "manage_task",
        "list",
        "read",
        "run_task",
        "shell_command",
        "edit",
        "apply_patch",
        "websearch",
        "webfetch",
      ],
      mainLanguageModel: { kind: "main-model" },
      promptContext,
      resolvedModelId: "gpt-5.2",
      resolvedProviderId: "openai",
      stage: "initial",
      userId: "user-1",
    });

    expect(routed.activeToolNames).toContain("shell_command");
    expect(routed.activeToolNames).toContain("websearch");
    expect(routed.activeToolNames).toContain("webfetch");
    expect(routed.activeToolNames).toContain("list");
    expect(routed.activeToolNames).toContain("run_task");
    expect(routed.audit.reason).toBe("forced-shell-remediation");
    expect(routed.audit.remediationTriggerSource).toBe(
      "explicit-install-request",
    );
  });

  it("promotes shell remediation when prior execution shows a missing command", () => {
    const promptContext = createPromptContext({
      latestUserText: "install it",
    });
    const evidence = buildToolRoutingEvidence(
      [
        {
          toolCalls: [{ toolName: "run_task" }],
          toolResults: [
            {
              result: {
                output: {
                  exitCode: 127,
                  failureKind: "missing_command",
                  missingCommand: "zig",
                  phase: "completed",
                  stderr: "bash: line 2: zig: command not found",
                  stdout: "",
                  suggestedNextAction: "install",
                },
              },
            },
          ],
        } as never,
      ],
      "install it",
    );

    const validated = validateToolRoutingDecision({
      availableToolNames: ["manage_task", "run_task", "shell_command"],
      decision: {
        categories: [],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "No execution needed.",
      },
      evidence,
      fallbackActiveToolNames: ["manage_task"],
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "step",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toContain("shell_command");
    expect(validated.audit.remediationTriggerSource).toBe(
      "explicit-install-request",
    );
  });

  it("keeps local and web baseline tools active even when the router only asks for integrations", () => {
    const promptContext = createPromptContext();

    const validated = validateToolRoutingDecision({
      availableToolNames: [
        "manage_task",
        "list",
        "read",
        "run_task",
        "shell_command",
        "edit",
        "apply_patch",
        "websearch",
        "webfetch",
        "gh_search_repositories",
      ],
      decision: {
        categories: [],
        confidence: "high",
        integrationNamespaces: ["github"],
        mcpNamespaces: [],
        reasoning: "Use GitHub only.",
      },
      fallbackActiveToolNames: ["manage_task"],
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "initial",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toEqual(
      expect.arrayContaining([
        "list",
        "read",
        "run_task",
        "shell_command",
        "edit",
        "apply_patch",
        "websearch",
        "webfetch",
        "gh_search_repositories",
      ]),
    );
  });
});
