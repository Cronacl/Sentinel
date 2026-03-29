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
  error: null,
  serverReachable: true,
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
const resetCodexCliResolutionCache = mock(() => undefined);
const resetClaudeCodeRuntimeCache = mock(() => undefined);
const resetClaudeEngineStatusCache = mock(() => undefined);
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
}));

mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  getClaudeEngineStatus,
  isClaudeEngineAvailable: (status: any) =>
    status.binaryDetected &&
    status.state !== "missing_binary" &&
    status.state !== "auth_unavailable",
  resetClaudeCodeRuntimeCache,
  resetClaudeEngineStatusCache,
}));

mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  resetCodexCliResolutionCache,
}));

mock.module("@/lib/ai/chat/engines/types", () => ({
  getCodexThreadState: (value: any) => value?.codex ?? null,
}));

mock.module("@/lib/ai/providers/models", () => ({
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
}));

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
  resetCodexCliResolutionCache.mockReset();
  resetClaudeCodeRuntimeCache.mockReset();
  resetClaudeEngineStatusCache.mockReset();
  getOwnedThreadOrThrow.mockReset();

  startReview.mockImplementation(async () => ({
    review: { id: "review-1", text: "ok" },
  }));
  reloadRuntime.mockImplementation(async () => undefined);
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
    error: null,
    serverReachable: true,
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

  it("falls back when engine detection times out", async () => {
    getStatus.mockImplementationOnce(() => new Promise(() => undefined));
    getClaudeEngineStatus.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "codex")).toEqual(
      expect.objectContaining({
        error: "Timed out while checking Codex availability.",
        isAvailable: false,
      }),
    );
    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        error: "Timed out while checking Claude availability.",
        isAvailable: false,
      }),
    );
  }, 5_000);

  it("marks Codex available when the CLI is detected but the runtime probe timed out", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      requiresOpenaiAuth: false,
      serverReachable: false,
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
      error: "Timed out while querying Claude Code runtime.",
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      sdkDetected: true,
      state: "timeout_using_cache",
      usedCachedStatus: true,
    }));

    const result = await enginesRouter.list({});

    expect(result.find((engine: any) => engine.engine === "claude")).toEqual(
      expect.objectContaining({
        isAvailable: true,
        status: expect.objectContaining({
          state: "timeout_using_cache",
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

  it("marks cached Claude models as connected during degraded mode", async () => {
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
      error: "Timed out while querying Claude Code runtime.",
      lastSuccessfulProbeAt: "2026-03-29T10:00:00.000Z",
      sdkDetected: true,
      state: "timeout_using_cache",
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

  it("returns an empty list when Codex model discovery times out", async () => {
    getStatus.mockImplementationOnce(() => new Promise(() => undefined));

    const result = await enginesRouter.models({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
      },
      input: { engine: "codex" },
    });

    expect(result).toEqual([]);
  }, 2_500);

  it("returns fallback Codex models when the CLI is detected but the runtime is unreachable", async () => {
    getStatus.mockImplementationOnce(async () => ({
      account: null,
      authReady: false,
      availableModels: [],
      cliDetected: true,
      cliVersion: "codex-cli 0.98.0",
      error: "Timed out while querying Codex runtime.",
      isDesktopRuntime: true,
      requiresOpenaiAuth: false,
      serverReachable: false,
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
});
