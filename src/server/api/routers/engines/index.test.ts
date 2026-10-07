// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

// The engines router is generic over drivers: it reads snapshots from the
// platform snapshot service and instances from the registry, both replaced
// here. Adding a driver needs no change to these tests.

mock.module("server-only", () => ({}));

mock.module("@/server/api/trpc", () => {
  const procedure = (inputSchema?: any) => ({
    mutation: (handler: any) => Object.assign(handler, { inputSchema }),
    query: (handler: any) => Object.assign(handler, { inputSchema }),
    subscription: (handler: any) => Object.assign(handler, { inputSchema }),
  });
  return {
    createTRPCRouter: (routes: Record<string, any>) => routes,
    protectedProcedure: {
      input: (inputSchema: any) => procedure(inputSchema),
      ...procedure(),
    },
  };
});

// Mocked before anything imports the provider catalog (the contract
// helpers below do).
mock.module("@/lib/ai/providers/models", async () => {
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
  const actual =
    await import("@/lib/ai/providers/models.ts?engines-router-test-actual");

  return {
    ...actual,
    MODEL_CATALOG: { anthropic: {}, openai: {} },
    getDefaultReasoningEffort: () => "medium",
    getModelsForProvider: (provider: string) =>
      provider === "anthropic"
        ? [
            {
              capabilities: ["vision", "tool_use"],
              contextWindow: 200_000,
              description: "Balanced performance and speed.",
              displayName: "Claude Sonnet 4.5",
              id: "claude-sonnet-4-5",
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

const { makeFakeModel, makeFakeSnapshot } =
  await import("@/lib/ai/chat/engines/contract/testing");
const { toEngineModel } =
  await import("@/lib/ai/chat/engines/drivers/legacy-status");
const { EngineInstanceError, EngineInstanceUnavailableError } =
  await import("@/lib/ai/chat/engines/platform/errors");

let snapshots: any[] = [];
const snapshotService = {
  getAll: mock(async (_userId: string, _options?: unknown) => snapshots),
  getSnapshot: mock(
    async (_userId: string, instanceId: string) =>
      snapshots.find((snapshot) => snapshot.instanceId === instanceId) ?? null,
  ),
  peekAll: mock(async (_userId: string) => snapshots),
  refresh: mock(
    async (_userId: string, instanceId: string, _reason?: string) =>
      snapshots.find((snapshot) => snapshot.instanceId === instanceId) ?? null,
  ),
};
mock.module("@/lib/ai/chat/engines/platform/snapshot-service", () => ({
  getEngineSnapshotService: () => snapshotService,
}));

const resolvedInstances: unknown[] = [];
const registry = {
  countReferences: mock(async () => ({
    automations: 1,
    threads: 2,
    userDefault: false,
  })),
  create: mock(async (_userId: string, input: any) => ({
    id: input.id ?? `${input.driver}-new`,
  })),
  get: mock(async (_userId: string, instanceId: string) =>
    instanceId === "codex-work"
      ? { instance: { driver: "codex", id: "codex-work" }, status: "available" }
      : null,
  ),
  listSummaries: mock(async () => [{ id: "codex" }]),
  remove: mock(async () => ({ reset: false })),
  resolve: mock(async (_userId: string, target: any) => {
    if (target.instanceId === "codex-gone") {
      throw new EngineInstanceUnavailableError(
        "codex-gone",
        "codex",
        "missing",
        'Engine instance "codex-gone" no longer exists.',
      );
    }
    const instance = { id: target.instanceId ?? target.driver };
    resolvedInstances.push(instance);
    return instance;
  }),
  setEnabled: mock(async () => ({ id: "codex" })),
  update: mock(async () => ({ id: "codex" })),
};
mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => registry,
}));

const release = mock(() => {});
const retain = mock((_userId: string) => release);
mock.module("@/lib/ai/chat/engines/platform/refresh-loop", () => ({
  getEngineRefreshLoop: () => ({ retain }),
}));

let streamedEvents: any[] = [];
mock.module("@/lib/ai/chat/engines/platform/event-stream", () => ({
  streamEngineEvents: async function* () {
    yield* streamedEvents;
  },
}));

const codexManager = {
  cancelLogin: mock(async () => ({ status: "canceled" })),
  revertThreadTurns: mock(async () => ({
    beforeTurnId: "turn-9",
    reverted: true,
  })),
  startLogin: mock(async () => ({ loginId: "login-1", type: "chatgpt" })),
  startReview: mock(async () => ({ review: { id: "review-1", text: "ok" } })),
  writeConfigValue: mock(async () => ({ config: {} })),
};
const getCodexAppServerManager = mock((_instance?: unknown) => codexManager);
mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager,
}));

let ownedThread: any = null;
const getOwnedThreadOrThrow = mock(async () => ownedThread);
mock.module("../workspace-thread-helpers", () => ({
  getOwnedThreadOrThrow,
}));

const { enginesRouter } = await import("./index");

const USER_CTX = {
  db: {
    query: {
      modelPreferences: {
        findMany: async () => [
          {
            isCustom: true,
            isEnabled: false,
            modelId: "gpt-local",
            provider: "openai",
          },
        ],
      },
      providerCredentials: {
        findMany: async () => [{ provider: "anthropic" }],
      },
    },
  },
  session: { user: { id: "user-1" } },
};

function legacyModel(overrides: Record<string, unknown> = {}) {
  return toEngineModel({
    defaultReasoningEffort: "high",
    description: "Claude model",
    displayName: "Claude Sonnet 4.5",
    id: "claude-sonnet-4-5",
    inputModalities: ["text", "image"],
    isDefault: true,
    model: "claude-sonnet-4-5-20250929",
    supportedReasoningEfforts: [
      { description: "High", effort: "high", label: "High" },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  snapshots = [
    makeFakeSnapshot({ driver: "sentinel", models: [] }),
    makeFakeSnapshot({ driver: "codex" }),
    makeFakeSnapshot({ driver: "claude", models: [legacyModel()] }),
    makeFakeSnapshot({
      driver: "opencode",
      models: [
        legacyModel({
          defaultReasoningEffort: null,
          id: "openai/gpt-5",
          model: "openai/gpt-5",
          openCode: {
            agentOptions: [{ isDefault: true, label: "Build", value: "build" }],
            variantOptions: [
              { isDefault: true, label: "Medium", value: "medium" },
            ],
          },
          supportedReasoningEfforts: [],
        }),
      ],
    }),
    makeFakeSnapshot({
      driver: "cursor",
      message: "Cursor Agent was not found in PATH.",
      models: [],
      usable: false,
    }),
    makeFakeSnapshot({ driver: "copilot", enabled: false, status: "disabled" }),
    makeFakeSnapshot({ driver: "grok" }),
  ];
  streamedEvents = [];
  ownedThread = {
    chatEngine: "codex",
    chatEngineInstanceId: "codex-work",
    chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
  };
  resolvedInstances.length = 0;
  for (const value of [
    ...Object.values(snapshotService),
    ...Object.values(registry),
    ...Object.values(codexManager),
    getCodexAppServerManager,
    getOwnedThreadOrThrow,
    retain,
    release,
  ]) {
    value.mockClear();
  }
});

describe("enginesRouter.snapshots", () => {
  it("returns cached snapshots without waiting on probes", async () => {
    const result = await enginesRouter.snapshots({ ctx: USER_CTX });

    expect(result).toBe(snapshots);
    expect(snapshotService.peekAll).toHaveBeenCalledWith("user-1");
    expect(snapshotService.getAll).not.toHaveBeenCalled();
  });

  it("probes every instance when asked to force a refresh", async () => {
    await enginesRouter.snapshots({
      ctx: USER_CTX,
      input: { forceRefresh: true },
    });

    expect(snapshotService.getAll).toHaveBeenCalledWith("user-1", {
      forceRefresh: true,
      reason: "user",
    });
  });
});

describe("enginesRouter.refresh", () => {
  it("probes exactly the requested instance (never another engine)", async () => {
    const result = await enginesRouter.refresh({
      ctx: USER_CTX,
      input: { instanceId: "opencode" },
    });

    expect(snapshotService.refresh).toHaveBeenCalledWith(
      "user-1",
      "opencode",
      "user",
    );
    expect(result.driver).toBe("opencode");
  });

  it("rejects an unknown instance", async () => {
    await expect(
      enginesRouter.refresh({ ctx: USER_CTX, input: { instanceId: "gemini" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("enginesRouter.models", () => {
  it("returns raw runtime model ids and efforts from the snapshot", async () => {
    const result = await enginesRouter.models({
      ctx: USER_CTX,
      input: { engine: "claude" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        defaultReasoningEffort: "high",
        displayName: "Claude Sonnet 4.5",
        engine: "claude",
        instanceId: "claude",
        isConnected: true,
        modelId: "claude-sonnet-4-5",
        rawModelId: "claude-sonnet-4-5-20250929",
        supportedReasoningEfforts: ["high"],
      }),
    ]);
  });

  it("returns OpenCode models with their agent and variant options", async () => {
    const [model] = await enginesRouter.models({
      ctx: USER_CTX,
      input: { instanceId: "opencode" },
    });

    expect(model.options.map((option) => option.id)).toEqual([
      "agent",
      "variant",
    ]);
    expect(model.supportedReasoningEfforts).toEqual([]);
  });

  it("returns nothing for an unknown instance instead of the Sentinel catalog", async () => {
    await expect(
      enginesRouter.models({ ctx: USER_CTX, input: { engine: "gemini" } }),
    ).resolves.toEqual([]);
    await expect(
      enginesRouter.models({
        ctx: USER_CTX,
        input: { engine: "claude", instanceId: "opencode" },
      }),
    ).resolves.toEqual([]);
  });

  it("lists the built-in catalog for Sentinel", async () => {
    const result = await enginesRouter.models({
      ctx: USER_CTX,
      input: { engine: "sentinel" },
    });

    expect(result).toEqual([
      expect.objectContaining({
        engine: "sentinel",
        instanceId: "sentinel",
        isConnected: true,
        isEnabled: true,
        modelId: "anthropic:claude-sonnet-4-5",
        provider: "anthropic",
      }),
      expect.objectContaining({
        description: "Custom model",
        isConnected: false,
        isEnabled: false,
        modelId: "openai:gpt-local",
      }),
    ]);
  });

  it("requires an engine or an instance", () => {
    const { inputSchema } = enginesRouter.models;
    expect(inputSchema.safeParse({}).success).toBe(false);
    expect(inputSchema.safeParse({ instanceId: "Bad Id" }).success).toBe(false);
    expect(inputSchema.safeParse({ instanceId: "codex-work" }).success).toBe(
      true,
    );
  });
});

describe("enginesRouter.composerCatalog", () => {
  it("lists pickable instances and their models in one query", async () => {
    const result = await enginesRouter.composerCatalog({ ctx: USER_CTX });

    // Known snapshots answer at once; nothing waits on a probe.
    expect(snapshotService.peekAll).toHaveBeenCalledWith("user-1");
    expect(snapshotService.getAll).not.toHaveBeenCalled();
    expect(snapshotService.getSnapshot).not.toHaveBeenCalled();

    expect(result.options.map((option) => option.instanceId)).toEqual([
      "sentinel",
      "codex",
      "claude",
      "opencode",
      "cursor",
    ]);
    expect(
      result.options.find((option) => option.instanceId === "cursor"),
    ).toEqual(
      expect.objectContaining({
        error: "Cursor Agent was not found in PATH.",
        isAvailable: false,
      }),
    );
    expect(Object.keys(result.modelsByInstance)).toEqual([
      "sentinel",
      "codex",
      "claude",
      "opencode",
      "cursor",
    ]);
    expect(result.modelsByInstance.sentinel[0].modelId).toBe(
      "anthropic:claude-sonnet-4-5",
    );
    expect(result.modelsByInstance.claude[0].rawModelId).toBe(
      "claude-sonnet-4-5-20250929",
    );
  });

  it("waits only for instances that were never checked", async () => {
    const fresh = makeFakeSnapshot({ driver: "codex" });
    snapshotService.peekAll.mockImplementationOnce(async () => [
      makeFakeSnapshot({ driver: "sentinel", models: [] }),
      makeFakeSnapshot({
        driver: "codex",
        models: [],
        status: "checking",
        usable: false,
      }),
    ]);
    snapshotService.getSnapshot.mockImplementationOnce(async () => fresh);

    const result = await enginesRouter.composerCatalog({ ctx: USER_CTX });

    expect(snapshotService.getSnapshot).toHaveBeenCalledTimes(1);
    expect(snapshotService.getSnapshot).toHaveBeenCalledWith("user-1", "codex");
    expect(result.modelsByInstance.codex).toHaveLength(1);
    expect(
      result.options.find((option) => option.instanceId === "codex")
        ?.isAvailable,
    ).toBe(true);
  });
});

describe("enginesRouter.onEvents", () => {
  it("streams tracked events and keeps background refresh running meanwhile", async () => {
    streamedEvents = [
      { snapshot: snapshots[1], type: "snapshot", version: 3 },
      { instanceId: "codex-work", type: "snapshot-removed", version: 4 },
    ];

    const received = [];
    for await (const item of enginesRouter.onEvents({
      ctx: USER_CTX,
      signal: new AbortController().signal,
    })) {
      received.push(item);
      expect(release).not.toHaveBeenCalled();
    }

    expect(retain).toHaveBeenCalledWith("user-1");
    expect(release).toHaveBeenCalledTimes(1);
    // tracked(id, data) envelopes: [id, data, marker].
    expect(received.map((item) => [item[0], item[1].type])).toEqual([
      ["3", "snapshot"],
      ["4", "snapshot-removed"],
    ]);
  });
});

describe("enginesRouter.instances", () => {
  it("lists redacted summaries", async () => {
    await expect(
      enginesRouter.instances.list({ ctx: USER_CTX }),
    ).resolves.toEqual([{ id: "codex" }]);
  });

  it("maps registry rejections to tRPC errors", async () => {
    registry.remove.mockImplementationOnce(async () => {
      throw new EngineInstanceError("in-use", "The instance is in use.", {
        references: { automations: 1, threads: 2, userDefault: false },
      });
    });
    registry.create.mockImplementationOnce(async () => {
      throw new EngineInstanceError("conflict", "The id is taken.");
    });

    await expect(
      enginesRouter.instances.remove({
        ctx: USER_CTX,
        input: { instanceId: "codex-work" },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "The instance is in use. Used by 3 thread(s), automation(s) or default selection.",
    });
    await expect(
      enginesRouter.instances.create({
        ctx: USER_CTX,
        input: { driver: "codex", id: "codex-work" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("counts references of an existing instance", async () => {
    await expect(
      enginesRouter.instances.references({
        ctx: USER_CTX,
        input: { instanceId: "codex-work" },
      }),
    ).resolves.toEqual({ automations: 1, threads: 2, userDefault: false });
    expect(registry.countReferences).toHaveBeenCalledWith("user-1", {
      driver: "codex",
      instanceId: "codex-work",
    });
    await expect(
      enginesRouter.instances.references({
        ctx: USER_CTX,
        input: { instanceId: "codex-gone" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("not-yet-built engine services", () => {
  it("answer not_supported rather than failing", async () => {
    for (const result of [
      await enginesRouter.auth.start({
        ctx: USER_CTX,
        input: { instanceId: "claude" },
      }),
      await enginesRouter.maintenance.update({
        ctx: USER_CTX,
        input: { instanceId: "claude" },
      }),
      await enginesRouter.acpRegistry.list({ ctx: USER_CTX }),
    ]) {
      expect(result).toEqual(
        expect.objectContaining({ code: "not_supported", ok: false }),
      );
    }
  });
});

describe("enginesRouter.codex", () => {
  it("reviews on the app-server of the thread's own instance", async () => {
    const result = await enginesRouter.codex.review({
      ctx: USER_CTX,
      input: { threadId: "thread-1" },
    });

    expect(getOwnedThreadOrThrow).toHaveBeenCalledWith(USER_CTX, "thread-1");
    expect(registry.resolve).toHaveBeenCalledWith("user-1", {
      driver: "codex",
      instanceId: "codex-work",
    });
    expect(getCodexAppServerManager).toHaveBeenCalledWith({
      id: "codex-work",
    });
    expect(codexManager.startReview).toHaveBeenCalledWith("codex-thread-1");
    expect(result).toEqual({ review: { id: "review-1", text: "ok" } });
  });

  it("reverts the backing Codex thread by turn count instead of thread/rollback", async () => {
    ownedThread = {
      chatEngine: "codex",
      chatEngineInstanceId: null,
      chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
    };

    const result = await enginesRouter.codex.rollback({
      ctx: USER_CTX,
      input: { count: 1, threadId: "thread-1" },
    });

    expect(registry.resolve).toHaveBeenCalledWith("user-1", {
      driver: "codex",
      instanceId: null,
    });
    expect(codexManager.revertThreadTurns).toHaveBeenCalledWith(
      "codex-thread-1",
      1,
    );
    expect(result).toMatchObject({ beforeTurnId: "turn-9", reverted: true });
  });

  it("refuses a thread whose instance is gone", async () => {
    ownedThread = {
      chatEngine: "codex",
      chatEngineInstanceId: "codex-gone",
      chatEngineState: { codex: { codexThreadId: "codex-thread-1" } },
    };

    await expect(
      enginesRouter.codex.review({
        ctx: USER_CTX,
        input: { threadId: "thread-1" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(codexManager.startReview).not.toHaveBeenCalled();
  });

  it("sends the 0.160 account/login/start shapes to the chosen instance", async () => {
    const { inputSchema } = enginesRouter.codex.login;

    expect(inputSchema.safeParse({ method: "apiKey" }).success).toBe(false);
    expect(inputSchema.safeParse({ method: "external" }).success).toBe(false);

    await enginesRouter.codex.login({
      ctx: USER_CTX,
      input: inputSchema.parse({ method: "chatgpt" }),
    });
    await enginesRouter.codex.login({
      ctx: USER_CTX,
      input: inputSchema.parse({
        apiKey: "sk-test",
        instanceId: "codex-work",
        method: "apiKey",
      }),
    });
    await enginesRouter.codex.cancelLogin({
      ctx: USER_CTX,
      input: { loginId: "login-1" },
    });

    expect(codexManager.startLogin).toHaveBeenNthCalledWith(1, {
      type: "chatgpt",
    });
    expect(codexManager.startLogin).toHaveBeenNthCalledWith(2, {
      apiKey: "sk-test",
      type: "apiKey",
    });
    expect(codexManager.cancelLogin).toHaveBeenCalledWith("login-1");
    expect(resolvedInstances).toEqual([
      { id: "codex" },
      { id: "codex-work" },
      { id: "codex" },
    ]);
  });

  it("accepts a config write without a value, as under zod 3", async () => {
    const { inputSchema } = enginesRouter.codex.writeConfig;

    expect(inputSchema.safeParse({ key: "model" }).success).toBe(true);
    expect(inputSchema.safeParse({ key: "model", value: null }).success).toBe(
      true,
    );
    expect(inputSchema.safeParse({ value: "gpt-5" }).success).toBe(false);

    await enginesRouter.codex.writeConfig({
      ctx: USER_CTX,
      input: inputSchema.parse({ key: "model" }),
    });

    expect(codexManager.writeConfigValue).toHaveBeenCalledWith(
      "model",
      undefined,
    );
  });
});
