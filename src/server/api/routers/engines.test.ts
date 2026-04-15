// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const startReview = mock(async () => ({
  review: { id: "review-1", text: "ok" },
}));
const reloadRuntime = mock(async () => undefined);
const getStatus = mock(async () => ({
  authReady: true,
  availableModels: [
    {
      defaultReasoningEffort: "medium",
      description: "Codex model",
      displayName: "GPT-5 Codex",
      id: "gpt-5-codex",
      inputModalities: ["text"],
      model: "gpt-5-codex",
      supportedReasoningEfforts: [{ effort: "medium" }],
    },
  ],
  cliDetected: true,
  cliVersion: "codex-cli 0.98.0",
  error: null,
  isDesktopRuntime: true,
  lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
  requiresOpenaiAuth: false,
  serverReachable: true,
  state: "ready",
  usedCachedStatus: false,
}));
const getClaudeEngineStatus = mock(async () => ({
  authReady: true,
  availableModels: [
    {
      contextWindow: 200_000,
      defaultReasoningEffort: "high",
      description: "Claude model",
      displayName: "Claude Sonnet 4.5",
      id: "claude-sonnet-4-5",
      inputModalities: ["text", "image"],
      model: "claude-sonnet-4-5-20250929",
      supportedReasoningEfforts: [{ effort: "high" }],
    },
  ],
  binaryDetected: true,
  binaryPath: "/Users/test/.local/bin/claude",
  binaryVersion: "2.1.39 (Claude Code)",
  error: null,
  lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
  sdkDetected: true,
  state: "ready",
  usedCachedStatus: false,
}));
const getCopilotEngineStatus = mock(async () => ({
  account: {
    authType: "oauth",
    host: "github.com",
    login: "octocat",
    statusMessage: null,
  },
  authReady: true,
  availableModels: [
    {
      contextWindow: 128_000,
      defaultReasoningEffort: "medium",
      description: "Copilot coding model",
      displayName: "GPT-4.1",
      id: "gpt-4.1-preview",
      inputModalities: ["text"],
      isDefault: true,
      model: "gpt-4.1-preview",
      supportedReasoningEfforts: [{ effort: "medium" }],
    },
  ],
  cliDetected: true,
  cliPath: "/Users/test/.local/bin/copilot",
  cliVersion: "copilot 1.0.24",
  engine: "copilot",
  error: null,
  lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
  state: "ready",
  usedCachedStatus: false,
}));
const resetCodexCliResolutionCache = mock(() => undefined);
const resetCodexEngineStatusCache = mock(() => undefined);
const resetClaudeCodeRuntimeCache = mock(() => undefined);
const resetClaudeEngineStatusCache = mock(() => undefined);
const resetCopilotRuntimeCache = mock(() => undefined);
const resetCopilotEngineStatusCache = mock(() => undefined);
const resolveCodexCli = mock(async () => ({
  command: "/Users/test/.local/bin/codex",
  env: process.env,
}));
const readCodexCliVersion = mock(async () => "codex-cli 0.98.0");
const spawnCodexCli = mock(() => {
  throw new Error("spawnCodexCli should not be called in router tests");
});
const getOwnedThreadOrThrow = mock(async () => ({
  chatEngineState: {
    codex: {
      codexThreadId: "codex-thread-1",
    },
  },
}));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    mutation: (handler: any) => handler,
    query: (handler: any) => handler,
  },
}));

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => ({
    getStatus,
    reloadRuntime,
    startReview,
  }),
  resetCodexEngineStatusCache,
}));

mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  getClaudeEngineStatus,
  isClaudeEngineAvailable: (status: any) =>
    status.state === "ready" || status.state === "timeout_no_cache",
  resetClaudeCodeRuntimeCache,
  resetClaudeEngineStatusCache,
}));

mock.module("@/lib/ai/chat/engines/copilot-sdk", () => ({
  getCopilotEngineStatus,
  isCopilotEngineAvailable: (status: any) =>
    (status.state === "ready" && status.authReady) ||
    (status.state === "timeout_using_cache" &&
      status.authReady &&
      status.availableModels.length > 0),
  resetCopilotEngineStatusCache,
  resetCopilotRuntimeCache,
}));

mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  readCodexCliVersion,
  resetCodexCliResolutionCache,
  resolveCodexCli,
  spawnCodexCli,
}));

mock.module("@/lib/ai/chat/engines/types", async () => {
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
  const actual =
    await import("@/lib/ai/chat/engines/types.ts?engines-router-test-actual");

  return {
    ...actual,
    getCodexThreadState: (value: any) => value?.codex ?? null,
  };
});

mock.module("@/lib/ai/providers/models", async () => {
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
  const actual =
    await import("@/lib/ai/providers/models.ts?engines-router-test-actual");

  return {
    ...actual,
    MODEL_CATALOG: {},
    getDefaultReasoningEffort: () => "medium",
    getModelsForProvider: (provider: string) =>
      provider === "anthropic"
        ? [
            {
              capabilities: ["vision", "tool_use", "object_generation"],
              contextWindow: 200_000,
              description: "Balanced performance and speed.",
              displayName: "Claude Sonnet 4.5",
              id: "claude-sonnet-4-5",
            },
          ]
        : provider === "openai"
          ? [
              {
                capabilities: ["tool_use", "object_generation"],
                description: "Codex flagship model.",
                displayName: "GPT-5 Codex",
                id: "gpt-5-codex",
              },
              {
                capabilities: ["tool_use", "object_generation"],
                description: "Compact Codex model.",
                displayName: "Codex Mini Latest",
                id: "codex-mini-latest",
              },
            ]
          : [],
    getSupportedReasoningEfforts: () => ["medium"],
    isKnownModel: () => false,
  };
});

mock.module("@/lib/ai/providers/model-selection", () => ({
  getCompositeModelId: (provider: string, modelId: string) =>
    `${provider}:${modelId}`,
}));

mock.module("@/server/db/schema", () => ({
  modelPreferences: {
    userId: "modelPreferences.userId",
  },
  providerCredentials: {
    isEnabled: "providerCredentials.isEnabled",
    userId: "providerCredentials.userId",
  },
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedThreadOrThrow,
}));

const { enginesRouter } = await import("./engines");

beforeEach(() => {
  startReview.mockReset();
  reloadRuntime.mockReset();
  getStatus.mockReset();
  getClaudeEngineStatus.mockReset();
  getCopilotEngineStatus.mockReset();
  resetCodexCliResolutionCache.mockReset();
  resetCodexEngineStatusCache.mockReset();
  resetClaudeCodeRuntimeCache.mockReset();
  resetClaudeEngineStatusCache.mockReset();
  resetCopilotRuntimeCache.mockReset();
  resetCopilotEngineStatusCache.mockReset();
  resolveCodexCli.mockReset();
  readCodexCliVersion.mockReset();
  spawnCodexCli.mockReset();
  getOwnedThreadOrThrow.mockReset();

  startReview.mockImplementation(async () => ({
    review: { id: "review-1", text: "ok" },
  }));
  reloadRuntime.mockImplementation(async () => undefined);
  resolveCodexCli.mockImplementation(async () => ({
    command: "/Users/test/.local/bin/codex",
    env: process.env,
  }));
  readCodexCliVersion.mockImplementation(async () => "codex-cli 0.98.0");
  getStatus.mockImplementation(async () => ({
    authReady: true,
    availableModels: [
      {
        defaultReasoningEffort: "medium",
        description: "Codex model",
        displayName: "GPT-5 Codex",
        id: "gpt-5-codex",
        inputModalities: ["text"],
        model: "gpt-5-codex",
        supportedReasoningEfforts: [{ effort: "medium" }],
      },
    ],
    cliDetected: true,
    cliVersion: "codex-cli 0.98.0",
    error: null,
    isDesktopRuntime: true,
    lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
    requiresOpenaiAuth: false,
    serverReachable: true,
    state: "ready",
    usedCachedStatus: false,
  }));
  getClaudeEngineStatus.mockImplementation(async () => ({
    authReady: true,
    availableModels: [
      {
        contextWindow: 200_000,
        defaultReasoningEffort: "high",
        description: "Claude model",
        displayName: "Claude Sonnet 4.5",
        id: "claude-sonnet-4-5",
        inputModalities: ["text", "image"],
        model: "claude-sonnet-4-5-20250929",
        supportedReasoningEfforts: [{ effort: "high" }],
      },
    ],
    binaryDetected: true,
    binaryPath: "/Users/test/.local/bin/claude",
    binaryVersion: "2.1.39 (Claude Code)",
    error: null,
    lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
    sdkDetected: true,
    state: "ready",
    usedCachedStatus: false,
  }));
  getCopilotEngineStatus.mockImplementation(async () => ({
    account: {
      authType: "oauth",
      host: "github.com",
      login: "octocat",
      statusMessage: null,
    },
    authReady: true,
    availableModels: [
      {
        contextWindow: 128_000,
        defaultReasoningEffort: "medium",
        description: "Copilot coding model",
        displayName: "GPT-4.1",
        id: "gpt-4.1-preview",
        inputModalities: ["text"],
        isDefault: true,
        model: "gpt-4.1-preview",
        supportedReasoningEfforts: [{ effort: "medium" }],
      },
    ],
    cliDetected: true,
    cliPath: "/Users/test/.local/bin/copilot",
    cliVersion: "copilot 1.0.24",
    engine: "copilot",
    error: null,
    lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
    state: "ready",
    usedCachedStatus: false,
  }));
  getOwnedThreadOrThrow.mockImplementation(async () => ({
    chatEngineState: {
      codex: {
        codexThreadId: "codex-thread-1",
      },
    },
  }));
});

afterEach(() => {
  mock.restore();
});

describe("enginesRouter.codexReview", () => {
  it("verifies thread ownership before resolving the backing Codex thread", async () => {
    const ctx = {
      db: {},
      session: { user: { id: "user-1" } },
    };

    const result = await enginesRouter.codexReview({
      ctx,
      input: { threadId: "thread-1" },
    });

    expect(getOwnedThreadOrThrow).toHaveBeenCalledWith(ctx, "thread-1");
    expect(startReview).toHaveBeenCalledWith("codex-thread-1");
    expect(result).toEqual({
      review: { id: "review-1", text: "ok" },
    });
  });
});

describe("enginesRouter.list", () => {
  it("includes Claude with normalized availability state", async () => {
    const result = await enginesRouter.list({});

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Use the locally configured Claude Code SDK runtime.",
          engine: "claude",
          isAvailable: true,
          label: "Claude",
          status: expect.objectContaining({
            authReady: true,
            binaryDetected: true,
            sdkDetected: true,
            state: "ready",
            usedCachedStatus: false,
          }),
        }),
      ]),
    );
  });

  it("includes Copilot with normalized availability state", async () => {
    const result = await enginesRouter.list({});

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Use the locally configured GitHub Copilot SDK runtime.",
          engine: "copilot",
          isAvailable: true,
          label: "Copilot",
          status: expect.objectContaining({
            authReady: true,
            cliDetected: true,
            state: "ready",
            usedCachedStatus: false,
          }),
        }),
      ]),
    );
  });

  it("marks Copilot unavailable when the CLI is detected but auth is not ready", async () => {
    getCopilotEngineStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: "/Users/test/.local/bin/copilot",
      cliVersion: "copilot 1.0.24",
      engine: "copilot",
      error: "GitHub Copilot needs authentication before it can be used here.",
      lastSuccessfulProbeAt: null,
      state: "auth_unavailable",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "copilot")).toEqual(
      expect.objectContaining({
        error:
          "GitHub Copilot needs authentication before it can be used here.",
        isAvailable: false,
      }),
    );
  });

  it("marks Claude unavailable when the SDK is missing or unauthenticated", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      authReady: false,
      availableModels: [],
      binaryDetected: false,
      binaryPath: null,
      binaryVersion: null,
      error: "Claude Code is not authenticated.",
      lastSuccessfulProbeAt: null,
      sdkDetected: false,
      state: "auth_unavailable",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        error: "Claude Code is not authenticated.",
        isAvailable: false,
      }),
    );
  });

  it("uses engine-level degraded timeout states instead of router placeholders", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: null,
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      binaryDetected: true,
      binaryPath: "/Users/test/.local/bin/claude",
      binaryVersion: "2.1.39 (Claude Code)",
      error: "Timed out while querying Claude Code runtime.",
      lastSuccessfulProbeAt: null,
      sdkDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "codex")).toEqual(
      expect.objectContaining({
        error: "Timed out while querying Codex runtime.",
        isAvailable: true,
      }),
    );
    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        error: "Timed out while querying Claude Code runtime.",
        isAvailable: true,
      }),
    );
  });

  it("marks Codex available when the CLI is detected but the runtime probe timed out", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: null,
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "codex")).toEqual(
      expect.objectContaining({
        isAvailable: true,
        status: expect.objectContaining({
          cliDetected: true,
          serverReachable: false,
        }),
      }),
    );
  });

  it("marks Claude available when cached models are reused after a timeout", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      authReady: true,
      availableModels: [
        {
          contextWindow: 200_000,
          defaultReasoningEffort: "high",
          description: "Claude model",
          displayName: "Claude Sonnet 4.5",
          id: "claude-sonnet-4-5",
          inputModalities: ["text", "image"],
          model: "claude-sonnet-4-5-20250929",
          supportedReasoningEfforts: [{ effort: "high" }],
        },
      ],
      binaryDetected: true,
      binaryPath: "/Users/test/.local/bin/claude",
      binaryVersion: "2.1.39 (Claude Code)",
      error: null,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      sdkDetected: true,
      state: "ready",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        isAvailable: true,
        status: expect.objectContaining({
          state: "ready",
          usedCachedStatus: true,
        }),
      }),
    );
  });

  it("marks Claude available when the binary is detected but the live probe timed out without cache", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      authReady: false,
      availableModels: [],
      binaryDetected: true,
      binaryPath: "/Users/test/.local/bin/claude",
      binaryVersion: "2.1.39 (Claude Code)",
      error: "Timed out while querying Claude Code runtime.",
      lastSuccessfulProbeAt: null,
      sdkDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        isAvailable: true,
        status: expect.objectContaining({
          state: "timeout_no_cache",
          usedCachedStatus: false,
        }),
      }),
    );
  });
});

describe("enginesRouter.models", () => {
  it("returns raw Claude model ids for the Claude engine", async () => {
    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "claude" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        contextWindow: 200_000,
        defaultReasoningEffort: "high",
        displayName: "Claude Sonnet 4.5",
        engine: "claude",
        inputModalities: ["text", "image"],
        isConnected: true,
        isEnabled: true,
        modelId: "claude-sonnet-4-5",
        provider: null,
        rawModelId: "claude-sonnet-4-5-20250929",
        supportedReasoningEfforts: ["high"],
      }),
    ]);
  });

  it("marks cached Claude models as connected during snapshot-backed mode", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      authReady: true,
      availableModels: [
        {
          contextWindow: 200_000,
          defaultReasoningEffort: "high",
          description: "Claude model",
          displayName: "Claude Sonnet 4.5",
          id: "claude-sonnet-4-5",
          inputModalities: ["text", "image"],
          model: "claude-sonnet-4-5-20250929",
          supportedReasoningEfforts: [{ effort: "high" }],
        },
      ],
      binaryDetected: true,
      binaryPath: "/Users/test/.local/bin/claude",
      binaryVersion: "2.1.39 (Claude Code)",
      error: null,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      sdkDetected: true,
      state: "ready",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "claude" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        isConnected: true,
        modelId: "claude-sonnet-4-5",
      }),
    ]);
  });

  it("returns fallback Claude models when the binary is detected but no cache exists yet", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      authReady: false,
      availableModels: [],
      binaryDetected: true,
      binaryPath: "/Users/test/.local/bin/claude",
      binaryVersion: "2.1.39 (Claude Code)",
      error: "Timed out while querying Claude Code runtime.",
      lastSuccessfulProbeAt: null,
      sdkDetected: true,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "claude" },
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Claude Sonnet 4.5",
          isConnected: true,
          isEnabled: true,
          modelId: "claude-sonnet-4-5",
        }),
      ]),
    );
  });

  it("returns fallback Codex models when the runtime times out without cached models", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: null,
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "GPT-5 Codex",
          isConnected: true,
          modelId: "gpt-5-codex",
        }),
      ]),
    );
  });

  it("returns fallback Codex models when the CLI is detected but the runtime is unreachable", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: null,
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "GPT-5 Codex",
          isConnected: true,
          isEnabled: true,
          modelId: "gpt-5-codex",
        }),
      ]),
    );
  });

  it("returns raw Copilot model ids for the Copilot engine", async () => {
    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "copilot" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        contextWindow: 128_000,
        defaultReasoningEffort: "medium",
        displayName: "GPT-4.1",
        engine: "copilot",
        inputModalities: ["text"],
        isConnected: true,
        isEnabled: true,
        modelId: "gpt-4.1-preview",
        provider: null,
        rawModelId: "gpt-4.1-preview",
        supportedReasoningEfforts: ["medium"],
      }),
    ]);
  });

  it("does not expose fallback Copilot models when auth is unavailable", async () => {
    getCopilotEngineStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliPath: "/Users/test/.local/bin/copilot",
      cliVersion: "copilot 1.0.24",
      engine: "copilot",
      error: "GitHub Copilot needs authentication before it can be used here.",
      lastSuccessfulProbeAt: null,
      state: "timeout_no_cache",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "copilot" },
    });

    expect(result).toEqual([]);
  });

  it("returns cached Codex models during snapshot-backed mode", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: {
        email: "codex@example.com",
        planType: "plus",
        type: "chatgpt",
      },
      authReady: true,
      availableModels: [
        {
          defaultReasoningEffort: "medium",
          description: "Codex model",
          displayName: "GPT-5 Codex",
          id: "gpt-5-codex",
          inputModalities: ["text"],
          model: "gpt-5-codex",
          supportedReasoningEfforts: [{ effort: "medium" }],
        },
      ],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: null,
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "ready",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        isConnected: true,
        modelId: "gpt-5-codex",
      }),
    ]);
  });

  it("keeps cached Codex models connected when auth is temporarily unavailable", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: {
        email: "codex@example.com",
        planType: "plus",
        type: "chatgpt",
      },
      authReady: true,
      availableModels: [
        {
          defaultReasoningEffort: "medium",
          description: "Codex model",
          displayName: "GPT-5 Codex",
          id: "gpt-5-codex",
          inputModalities: ["text"],
          model: "gpt-5-codex",
          supportedReasoningEfforts: [{ effort: "medium" }],
        },
      ],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: null,
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "ready",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        isConnected: true,
        modelId: "gpt-5-codex",
      }),
    ]);
  });
});

describe("enginesRouter.refreshStatus", () => {
  it("forces a fresh Claude runtime probe", async () => {
    const result = await enginesRouter.refreshStatus({
      input: { engine: "claude" },
    });

    expect(resetClaudeCodeRuntimeCache).toHaveBeenCalledTimes(1);
    expect(resetClaudeEngineStatusCache).toHaveBeenCalledTimes(1);
    expect(getClaudeEngineStatus).toHaveBeenCalledWith({
      forceRefresh: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        engine: "claude",
        status: expect.objectContaining({
          sdkDetected: true,
        }),
      }),
    );
  });

  it("forces a fresh Codex runtime probe", async () => {
    const result = await enginesRouter.refreshStatus({
      input: { engine: "codex" },
    });

    expect(resetCodexCliResolutionCache).toHaveBeenCalledTimes(1);
    expect(resetCodexEngineStatusCache).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledWith({
      forceRefresh: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        engine: "codex",
        status: expect.objectContaining({
          cliDetected: true,
        }),
      }),
    );
  });

  it("forces a fresh Copilot runtime probe", async () => {
    const result = await enginesRouter.refreshStatus({
      input: { engine: "copilot" },
    });

    expect(resetCopilotRuntimeCache).toHaveBeenCalledTimes(1);
    expect(resetCopilotEngineStatusCache).toHaveBeenCalledTimes(1);
    expect(getCopilotEngineStatus).toHaveBeenCalledWith({
      forceRefresh: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        engine: "copilot",
        status: expect.objectContaining({
          cliDetected: true,
        }),
      }),
    );
  });

  it("returns snapshot-backed ready Codex state after a failed forced probe", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: {
        email: "codex@example.com",
        planType: "plus",
        type: "chatgpt",
      },
      authReady: true,
      availableModels: [
        {
          defaultReasoningEffort: "medium",
          description: "Codex model",
          displayName: "GPT-5 Codex",
          id: "gpt-5-codex",
          inputModalities: ["text"],
          model: "gpt-5-codex",
          supportedReasoningEfforts: [{ effort: "medium" }],
        },
      ],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: null,
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      requiresOpenaiAuth: false,
      serverReachable: false,
      state: "ready",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.refreshStatus({
      input: { engine: "codex" },
    });

    expect(result).toEqual(
      expect.objectContaining({
        engine: "codex",
        status: expect.objectContaining({
          account: expect.objectContaining({
            email: "codex@example.com",
          }),
          state: "ready",
          usedCachedStatus: true,
        }),
      }),
    );
  });
});

describe("enginesRouter.models reasoning effort normalization", () => {
  it("preserves xhigh from Codex runtime model lists", async () => {
    getStatus.mockImplementationOnce(async () => ({
      authReady: true,
      availableModels: [
        {
          defaultReasoningEffort: "xhigh",
          description: "Codex frontier model",
          displayName: "GPT-5.3 Codex",
          id: "gpt-5.3-codex",
          inputModalities: ["text"],
          isDefault: true,
          model: "gpt-5.3-codex",
          supportedReasoningEfforts: [{ effort: "xhigh" }],
        },
      ],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: null,
      isDesktopRuntime: true,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      requiresOpenaiAuth: false,
      serverReachable: true,
      state: "ready",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: { query: {} },
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        defaultReasoningEffort: "xhigh",
        modelId: "gpt-5.3-codex",
        supportedReasoningEfforts: ["xhigh"],
      }),
    ]);
  });

  it("preserves xhigh from Copilot runtime model lists", async () => {
    getCopilotEngineStatus.mockImplementationOnce(async () => ({
      account: {
        authType: "oauth",
        host: "github.com",
        login: "octocat",
        statusMessage: null,
      },
      authReady: true,
      availableModels: [
        {
          contextWindow: 128_000,
          defaultReasoningEffort: "xhigh",
          description: "Copilot frontier model",
          displayName: "GPT-5.4",
          id: "gpt-5.4",
          inputModalities: ["text"],
          isDefault: true,
          model: "gpt-5.4",
          supportedReasoningEfforts: [{ effort: "xhigh" }],
        },
      ],
      cliDetected: true,
      cliPath: "/Users/test/.local/bin/copilot",
      cliVersion: "copilot 1.0.24",
      engine: "copilot",
      error: null,
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      state: "ready",
      usedCachedStatus: false,
    }));

    const result = await enginesRouter.models({
      ctx: {
        db: { query: {} },
        session: { user: { id: "user-1" } },
      },
      input: { engine: "copilot" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        defaultReasoningEffort: "xhigh",
        modelId: "gpt-5.4",
        supportedReasoningEfforts: ["xhigh"],
      }),
    ]);
  });
});
