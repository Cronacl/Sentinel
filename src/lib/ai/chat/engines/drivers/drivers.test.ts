import { describe, expect, it, mock } from "bun:test";

// The engine modules are replaced: these tests check how each legacy driver
// calls its engine and maps the answer, never a real runtime.
mock.module("server-only", () => ({}));

const codexManager = {
  getStatus: mock(async (_options: unknown) => ({
    account: { email: "me@example.com", planType: "pro", type: "chatgpt" },
    authReady: true,
    availableModels: [],
    cliDetected: true,
    cliPath: "/usr/local/bin/codex",
    cliVersion: "codex-cli 0.160.0",
    engine: "codex",
    error: "Timed out while querying Codex runtime.",
    isDesktopRuntime: true,
    lastSuccessfulProbeAt: null,
    requiresOpenaiAuth: false,
    serverReachable: false,
    state: "timeout_no_cache",
    usedCachedStatus: false,
  })),
};
const getCodexAppServerManager = mock((_instance?: unknown) => codexManager);
const resetCodexEngineStatusCache = mock(() => {});
mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager,
  resetCodexEngineStatusCache,
}));
const resolveCodexCli = mock(async (_options?: unknown) => ({
  command: "/usr/local/bin/codex",
  env: {},
  source: "login-shell",
}));
const resetCodexCliResolutionCache = mock(() => {});
mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  resetCodexCliResolutionCache,
  resolveCodexCli,
}));

const getClaudeEngineStatus = mock(async (_options?: unknown) => ({
  account: {
    email: "me@example.com",
    organization: "Acme",
    subscriptionType: "max",
    tokenSource: "claude.ai",
  },
  authReady: false,
  availableModels: [],
  binaryDetected: true,
  binaryPath: "/Users/me/.local/bin/claude",
  binaryVersion: "2.1.300 (Claude Code)",
  engine: "claude",
  error: "Claude Code is not authenticated.",
  lastSuccessfulProbeAt: null,
  sdkDetected: true,
  state: "auth_unavailable",
  usedCachedStatus: false,
}));
mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  buildClaudeFallbackModels: () => [],
  getClaudeEngineStatus,
  isClaudeEngineAvailable: (status: { state: string }) =>
    status.state === "ready" || status.state === "timeout_no_cache",
  resetClaudeCodeRuntimeCache: () => {},
  resetClaudeEngineStatusCache: () => {},
  resolveClaudeCodeRuntime: async () => ({ source: "config" }),
}));

const getCopilotEngineStatus = mock(async (_options?: unknown) => ({
  account: {
    authType: "user",
    host: "https://github.com",
    login: "octocat",
    statusMessage: null,
  },
  authReady: true,
  availableModels: [],
  cliDetected: true,
  cliPath: "/opt/copilot/copilot-runtime",
  cliVersion: "1.0.16",
  engine: "copilot",
  error: null,
  lastSuccessfulProbeAt: null,
  runtimeSource: "bundled",
  state: "timeout_no_cache",
  usedCachedStatus: false,
}));
mock.module("@/lib/ai/chat/engines/copilot-sdk", () => ({
  getCopilotEngineStatus,
  isCopilotEngineAvailable: (status: { authReady: boolean; state: string }) =>
    status.state === "ready" && status.authReady,
  resetCopilotEngineStatusCache: () => {},
  resetCopilotRuntimeCache: () => {},
  resolveCopilotRuntime: async () => ({ installSource: "sdk-bundled" }),
}));

const cursorProbeResult = {
  auth: {
    canLogin: false,
    canLogout: false,
    email: null,
    label: null,
    method: null,
    plan: null,
    status: "unknown" as const,
  },
  install: { installed: false, path: null, source: null, version: null },
  message: "Cursor Agent was not found in PATH.",
  models: [],
  status: "error" as const,
};
const probeAcpAgent = mock(
  async (_descriptor: unknown, _instance: unknown, _options: unknown) =>
    cursorProbeResult,
);
mock.module("@/lib/ai/chat/engines/acp/probe", () => ({ probeAcpAgent }));

const openCodeAdvisory = {
  message: "OpenCode 1.0.1 is too old for Sentinel.",
  recommendedRange: ">=1.14.19 <2.0.0",
  recommendedVersion: "1.14.19",
  status: "broken",
};
const getOpenCodeEngineStatus = mock(async (_options?: unknown) => ({
  authReady: false,
  availableModels: [],
  cliDetected: true,
  cliPath: "/Users/me/.opencode/bin/opencode",
  cliVersion: "1.0.1",
  compatibilityAdvisory: openCodeAdvisory,
  engine: "opencode",
  error: openCodeAdvisory.message,
  lastSuccessfulProbeAt: null,
  state: "error",
  usedCachedStatus: false,
}));
const resolveOpenCodeRuntime = mock(async (_options?: unknown) => ({
  source: "login-shell",
}));
mock.module("@/lib/ai/chat/engines/opencode-sdk", () => ({
  getOpenCodeEngineStatus,
  isOpenCodeEngineAvailable: (status: { state: string }) =>
    status.state === "ready" || status.state === "timeout_no_cache",
  resetOpenCodeEngineStatusCache: () => {},
  resetOpenCodeRuntimeCache: () => {},
  resolveOpenCodeRuntime,
}));

const { AVAILABLE_DRIVER_KINDS, DRIVER_CATALOG } = await import("../catalog");
const { makeFakeInstance } = await import("../contract/testing");
const { engineProbeResultSchema } = await import("../contract");
const { getEngineDriver, SERVER_DRIVERS } = await import("../platform/drivers");

function probeOptions(forceRefresh = false) {
  return {
    depth: "full" as const,
    forceRefresh,
    reason: "user" as const,
    signal: new AbortController().signal,
  };
}

describe("server driver registry", () => {
  it("has exactly one driver per implemented kind, consistent with the catalog", () => {
    expect(SERVER_DRIVERS.map((driver) => driver.kind)).toEqual([
      ...AVAILABLE_DRIVER_KINDS,
    ]);

    for (const driver of SERVER_DRIVERS) {
      const meta = DRIVER_CATALOG[driver.kind as keyof typeof DRIVER_CATALOG];
      expect(driver.meta).toBe(meta);
      expect(driver.capabilities).toBe(meta.capabilities);
      expect(driver.capabilities.supportsMultipleInstances).toBe(
        meta.multiInstance,
      );
      expect(driver.probeTimeoutMs).toBeGreaterThan(0);
      if (meta.toolPrefix) {
        expect(meta.toolPrefix).toMatch(/^[a-z][a-z0-9]*_$/);
      }
      expect(getEngineDriver(driver.kind)).toBe(driver);
    }
  });

  it("has no driver for planned or unknown kinds", () => {
    expect(getEngineDriver("grok")).toBeNull();
    expect(getEngineDriver("gemini")).toBeNull();
    expect(getEngineDriver("__proto__")).toBeNull();
  });
});

describe("legacy drivers", () => {
  it("probes Codex through the instance's app-server and offers fallback models", async () => {
    const instance = makeFakeInstance({
      driver: "codex",
      id: "codex-work",
      isDefault: false,
    });

    const result = await getEngineDriver("codex")!.probe(
      instance,
      probeOptions(true),
    );

    expect(getCodexAppServerManager).toHaveBeenCalledWith(instance);
    expect(codexManager.getStatus).toHaveBeenCalledWith({ forceRefresh: true });
    expect(resolveCodexCli).toHaveBeenCalledWith({ instance });
    expect(engineProbeResultSchema.parse(result)).toEqual(result);
    expect(result).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({
          canLogin: true,
          canLogout: true,
          email: "me@example.com",
          method: "chatgpt",
          plan: "pro",
          status: "unknown",
        }),
        install: {
          installed: true,
          path: "/usr/local/bin/codex",
          source: "login-shell",
          version: "codex-cli 0.160.0",
        },
        stale: true,
        status: "warning",
      }),
    );
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.models.every((model) => model.source === "live")).toBe(true);
    // Run by Sentinel through the app-server.
    expect(result.slashCommands?.map((command) => command.source)).toEqual([
      "sentinel",
      "sentinel",
      "sentinel",
    ]);

    getEngineDriver("codex")!.invalidate?.({ driver: "codex", id: "codex" });
    expect(resetCodexCliResolutionCache).toHaveBeenCalled();
    expect(resetCodexEngineStatusCache).toHaveBeenCalled();
  });

  it("maps Claude's account and missing auth", async () => {
    const instance = makeFakeInstance({ driver: "claude", id: "claude" });

    const result = await getEngineDriver("claude")!.probe(
      instance,
      probeOptions(),
    );

    expect(getClaudeEngineStatus).toHaveBeenCalledWith({
      forceRefresh: false,
      instance,
    });
    expect(result.auth).toEqual({
      canLogin: false,
      canLogout: false,
      email: "me@example.com",
      label: "Acme",
      method: "claude.ai",
      plan: "max",
      status: "unauthenticated",
    });
    expect(result.install.source).toBe("config");
    expect(result.status).toBe("warning");
    expect(result.slashCommands).toBeUndefined();
  });

  it("reports the slash commands Claude's initialize listed", async () => {
    getClaudeEngineStatus.mockImplementationOnce(async () => ({
      ...(await getClaudeEngineStatus.getMockImplementation()!()),
      commands: [
        { argumentHint: "<pr>", description: "Review a PR", name: "review" },
        { description: "", name: "compact" },
      ],
    }));

    const result = await getEngineDriver("claude")!.probe(
      makeFakeInstance({ driver: "claude", id: "claude" }),
      probeOptions(),
    );

    expect(result.slashCommands).toEqual([
      {
        description: "Review a PR",
        inputHint: "<pr>",
        name: "review",
        source: "native",
      },
      { name: "compact", source: "native" },
    ]);
  });

  it("offers Copilot's fallback model only once signed in", async () => {
    const instance = makeFakeInstance({ driver: "copilot", id: "copilot" });

    const result = await getEngineDriver("copilot")!.probe(
      instance,
      probeOptions(),
    );

    expect(result.auth.label).toBe("octocat");
    expect(result.install.source).toBe("sdk-bundled");
    expect(result.models.map((model) => model.id)).toEqual(["gpt-4.1-preview"]);
    // Copilot never counted a status timeout as available.
    expect(result.status).toBe("error");

    getCopilotEngineStatus.mockImplementationOnce(async () => ({
      ...(await getCopilotEngineStatus()),
      authReady: false,
    }));
    expect(
      (await getEngineDriver("copilot")!.probe(instance, probeOptions()))
        .models,
    ).toEqual([]);
  });

  it("probes Cursor through the shared ACP probe with its descriptor", async () => {
    const instance = makeFakeInstance({ driver: "cursor", id: "cursor" });
    const options = probeOptions();

    const result = await getEngineDriver("cursor")!.probe(instance, options);

    expect(result).toBe(cursorProbeResult);
    expect(probeAcpAgent).toHaveBeenCalledTimes(1);
    const [descriptor, probedInstance, probedOptions] =
      probeAcpAgent.mock.calls[0]!;
    expect((descriptor as { id: string }).id).toBe("cursor");
    expect(probedInstance).toBe(instance);
    expect(probedOptions).toBe(options);
  });

  it("answers cheap OpenCode probes from the last full result while the binary is unchanged", async () => {
    for (const kind of ["opencode"] as const) {
      const instance = makeFakeInstance({ driver: kind, id: kind });
      const status = getOpenCodeEngineStatus;
      const resolve = resolveOpenCodeRuntime as unknown as {
        mockImplementationOnce(fn: () => Promise<unknown>): unknown;
      };
      const install = {
        installed: true,
        path: `/usr/local/bin/${kind}`,
        source: "managed-path" as const,
        version: "1.0.0",
      };
      const previous = {
        auth: {
          canLogin: false,
          canLogout: false,
          email: null,
          label: null,
          method: null,
          plan: null,
          status: "authenticated" as const,
        },
        install,
        models: [],
        status: "ready" as const,
      };
      const runtime = (version: string) => ({
        cliDetected: true,
        cliPath: install.path,
        cliVersion: version,
        source: "login-shell",
      });
      status.mockClear();

      resolve.mockImplementationOnce(async () => runtime("1.0.0"));
      const carried = await getEngineDriver(kind)!.probe(instance, {
        ...probeOptions(),
        depth: "cheap",
        previous,
      });
      expect(carried).toEqual({
        ...previous,
        install: { ...install, source: "login-shell" },
      });
      expect(status).not.toHaveBeenCalled();

      // An updated binary is probed fully.
      resolve.mockImplementationOnce(async () => runtime("1.1.0"));
      await getEngineDriver(kind)!.probe(instance, {
        ...probeOptions(),
        depth: "cheap",
        previous,
      });
      expect(status).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps OpenCode's compatibility advisory", async () => {
    const instance = makeFakeInstance({ driver: "opencode", id: "opencode" });

    const result = await getEngineDriver("opencode")!.probe(
      instance,
      probeOptions(),
    );

    expect(result.compatibilityAdvisory).toEqual(openCodeAdvisory);
    expect(result.install.source).toBe("login-shell");
    expect(result.status).toBe("error");
  });

  it("reports the built-in engine as always ready", async () => {
    const result = await getEngineDriver("sentinel")!.probe(
      makeFakeInstance({ driver: "sentinel", id: "sentinel" }),
      probeOptions(),
    );

    expect(engineProbeResultSchema.parse(result)).toEqual(result);
    expect(result.status).toBe("ready");
    expect(result.install.installed).toBe(true);
  });
});
