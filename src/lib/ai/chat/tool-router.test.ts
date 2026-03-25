import { afterEach, describe, expect, it, mock } from "bun:test";

const generateTextMock = mock(async () => ({
  output: {
    categories: [],
    confidence: "high",
    integrationNamespaces: [],
    mcpNamespaces: [],
    reasoning: "Use no specialized tools.",
  },
}));

mock.module("ai", () => ({
  Output: {
    object: ({ schema }: { schema: unknown }) => ({ schema }),
  },
  generateText: generateTextMock,
}));

const resolveToolSelectionModelMock = mock(
  async ({ providerId }: { providerId: string; userId: string }) => ({
    languageModel: { kind: "router-model", providerId },
    providerId,
    requestedModelId: `${providerId}:gpt-4.1-nano`,
    responseModelId: "gpt-4.1-nano",
  }),
);

const getReasoningProviderOptionsMock = mock(
  (provider: string, modelId: string, reasoningEffort: string) => ({
    [provider === "google_vertex" ? "google" : provider]: {
      modelId,
      reasoningEffort,
    },
  }),
);

mock.module("./tool-selection-model", () => ({
  resolveToolSelectionModel: resolveToolSelectionModelMock,
}));

mock.module("@/lib/ai/providers/models", () => ({
  getReasoningProviderOptions: getReasoningProviderOptionsMock,
}));

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

const { buildThreadPromptContext } = await import("./prompt-context");
const { getDefaultToolApprovalPolicies } =
  await import("./tool-approval-policy");
const {
  buildToolRoutingManifest,
  buildToolRoutingEvidence,
  buildToolRouterPrompt,
  buildToolRouterSystemPrompt,
  routeToolExposure,
  validateToolRoutingDecision,
} = await import("./tool-router");
mock.restore();

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
        toolPrefix: "gh_",
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

afterEach(() => {
  mock.restore();
});

describe("tool router", () => {
  it("resolves the tool selection model for routing", async () => {
    const routed = await routeToolExposure({
      availableToolNames: ["manage_task", "list", "read", "websearch"],
      mainLanguageModel: { kind: "main-model" },
      promptContext: createPromptContext(),
      resolvedProviderId: "openai",
      stage: "initial",
      userId: "user-1",
    });

    expect(resolveToolSelectionModelMock).toHaveBeenCalledWith({
      providerId: "openai",
      userId: "user-1",
    });
    expect(routed.audit.mode).toBe("model-router");
  });

  it("falls back to deterministic baseline when no provider is set", async () => {
    const routed = await routeToolExposure({
      availableToolNames: [
        "manage_task",
        "list",
        "read",
        "websearch",
        "webfetch",
      ],
      mainLanguageModel: { kind: "main-model" },
      promptContext: createPromptContext(),
      stage: "initial",
      userId: "user-1",
    });

    expect(routed.audit.mode).toBe("deterministic-fallback");
    expect(routed.audit.reason).toBe("no-provider-id");
  });

  it("strips mutation exposure when there is no mutation root", () => {
    const promptContext = createPromptContext({
      allowedMutationRoot: null,
      workspaceRoot: null,
    });

    const validated = validateToolRoutingDecision({
      availableToolNames: [
        "manage_task",
        "edit",
        "apply_patch",
        "list",
        "read",
      ],
      decision: {
        categories: ["inspection", "mutation"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Inspect then edit.",
      },
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
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "initial",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toEqual(["manage_task"]);
    expect(validated.audit.rejectedSelections).toContain(
      "integration:slack:not-enabled",
    );
    expect(validated.audit.rejectedSelections).toContain(
      "mcp:figma:not-enabled",
    );
  });

  it("builds a minimal next-step routing prompt with explicit narrowing rules", () => {
    const systemPrompt = buildToolRouterSystemPrompt();
    const prompt = buildToolRouterPrompt({
      allowedInspectionRoots: ["/tmp/workspace"],
      allowedMutationRoot: "/tmp/workspace",
      availableCategories: ["inspection", "execution", "mutation", "web"],
      availableIntegrations: [
        {
          capabilitySummary: "Search repos, issues, and pull requests.",
          label: "GitHub",
          provider: "github",
          toolCount: 4,
        },
      ],
      availableMcpServers: [
        {
          capabilitySummary:
            "Integrate browser automation to implement design and test UI.",
          catalogId: "playwright",
          name: "Playwright",
          namespace: "playwright",
          toolCount: 2,
        },
      ],
      availableIntegrationNamespaces: ["github"],
      availableMcpNamespaces: ["playwright"],
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
      "If confidence is low, stay narrow instead of activating broad tool families speculatively.",
    );
    expect(prompt).toContain("Select only what is necessary immediately.");
    expect(prompt).toContain(
      "Workspace and web baseline tools are already active in chat mode",
    );
    expect(prompt).toContain('"availableIntegrations"');
    expect(prompt).toContain(
      "Return empty arrays for unused categories or namespaces.",
    );
    expect(prompt).toContain('"toolUniverseSize": 24');
  });

  it("uses the model router to activate a specialized integration namespace", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        categories: [],
        confidence: "high",
        integrationNamespaces: ["github"],
        mcpNamespaces: [],
        reasoning: "The task targets GitHub.",
      },
    });

    const promptContext = createPromptContext({
      latestUserText: "check my github issues",
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
        "gh_list_issues",
      ],
      mainLanguageModel: { kind: "main-model" },
      promptContext,
      resolvedProviderId: "openai",
      stage: "initial",
      userId: "user-1",
    });

    expect(routed.activeToolNames).toContain("gh_list_issues");
    expect(routed.activeToolNames).toContain("websearch");
    expect(routed.audit.reason).toBe("validated-model-decision");
    expect(routed.audit.selectedIntegrationNamespaces).toEqual(["github"]);
  });

  it("records remediation as model-driven when evidence exists and the router selects execution", () => {
    const promptContext = createPromptContext({
      latestUserText: "fix the missing toolchain issue",
    });
    const evidence = buildToolRoutingEvidence([
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
    ]);

    const validated = validateToolRoutingDecision({
      availableToolNames: ["manage_task", "run_task", "shell_command"],
      decision: {
        categories: ["execution"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Use execution tools.",
      },
      evidence,
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "step",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).toContain("shell_command");
    expect(validated.audit.remediationTriggerSource).toBe("router");
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

  it("surfaces connected integration metadata in the routing manifest without precomputed intent matches", () => {
    const promptContext = createPromptContext({
      enabledIntegrations: [
        {
          label: "Google Drive",
          provider: "google_drive",
          toolCount: 10,
          toolPrefix: "gdrive_",
        },
      ],
      latestUserText: "list my drive files",
    });

    const manifest = buildToolRoutingManifest({
      availableToolNames: [
        "manage_task",
        "list",
        "websearch",
        "gdrive_list_files",
      ],
      promptContext,
      stage: "initial",
    });

    expect(manifest.availableIntegrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Google Drive",
          provider: "google_drive",
        }),
      ]),
    );
  });

  it("keeps mutation routing specific when mutation is not baseline-managed", () => {
    const promptContext = createPromptContext({
      allowedMutationRoot: null,
      workspaceRoot: null,
    });

    const validated = validateToolRoutingDecision({
      availableToolNames: [
        "manage_task",
        "edit",
        "apply_patch",
        "list",
        "read",
      ],
      decision: {
        categories: ["inspection", "mutation"],
        confidence: "high",
        integrationNamespaces: [],
        mcpNamespaces: [],
        reasoning: "Inspect then edit.",
      },
      promptContext,
      routerModelId: "openai:gpt-5-mini",
      stage: "initial",
      usedFallbackModel: false,
    });

    expect(validated.activeToolNames).not.toContain("edit");
    expect(validated.audit.rejectedSelections).toContain(
      "category:mutation:no-mutation-root",
    );
  });

  it("falls back to baseline tools only when all model routing attempts error", async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error("router model failed"))
      .mockRejectedValueOnce(new Error("main model failed"));

    const routed = await routeToolExposure({
      availableToolNames: [
        "manage_task",
        "list",
        "read",
        "run_task",
        "shell_command",
        "websearch",
        "webfetch",
        "gh_list_issues",
      ],
      mainLanguageModel: { kind: "main-model" },
      promptContext: createPromptContext({
        latestUserText: "check my github issues",
      }),
      resolvedProviderId: "openai",
      stage: "initial",
      userId: "user-1",
    });

    expect(routed.activeToolNames).toEqual(
      expect.arrayContaining([
        "manage_task",
        "list",
        "read",
        "run_task",
        "shell_command",
        "websearch",
        "webfetch",
      ]),
    );
    expect(routed.activeToolNames).not.toContain("gh_list_issues");
    expect(routed.audit.mode).toBe("deterministic-fallback");
  });

  it("falls back to the main model when the dedicated router model errors", async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error("router model failed"))
      .mockResolvedValueOnce({
        output: {
          categories: [],
          confidence: "high",
          integrationNamespaces: ["github"],
          mcpNamespaces: [],
          reasoning: "Fallback to main model succeeded.",
        },
      });

    const routed = await routeToolExposure({
      availableToolNames: [
        "manage_task",
        "list",
        "read",
        "websearch",
        "webfetch",
        "gh_list_issues",
      ],
      mainLanguageModel: { kind: "main-model" },
      promptContext: createPromptContext({
        latestUserText: "check my github issues",
      }),
      resolvedProviderId: "openai",
      stage: "initial",
      userId: "user-1",
    });

    expect(routed.activeToolNames).toContain("gh_list_issues");
    expect(routed.audit.mode).toBe("model-router");
    expect(routed.audit.usedFallbackModel).toBe(true);
  });
});
