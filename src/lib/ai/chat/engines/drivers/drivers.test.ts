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
  resetCopilotEngineStatusCache: () => {},
  resetCopilotRuntimeCache: () => {},
  resolveCopilotRuntime: async () => ({ installSource: "sdk-bundled" }),
}));

const getCursorEngineStatus = mock(async (_options?: unknown) => ({
  authReady: false,
  availableModels: [],
  cliDetected: false,
  cliPath: null,
  cliVersion: null,
  engine: "cursor",
  error: "Cursor Agent was not found in PATH.",
  lastSuccessfulProbeAt: null,
  parameterizedModelPicker: false,
  state: "missing_runtime",
  usedCachedStatus: false,
}));
const resolveCursorRuntime = mock(async () => ({ source: "managed-path" }));
mock.module("@/lib/ai/chat/engines/cursor-acp", () => ({
  getCursorEngineStatus,
  resetCursorEngineStatusCache: () => {},
  resetCursorRuntimeCache: () => {},
  resolveCursorRuntime,
}));

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
mock.module("@/lib/ai/chat/engines/opencode-sdk", () => ({
  getOpenCodeEngineStatus,
  resetOpenCodeEngineStatusCache: () => {},
  resetOpenCodeRuntimeCache: () => {},
  resolveOpenCodeRuntime: async () => ({ source: "login-shell" }),
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

    getCopilotEngineStatus.mockImplementationOnce(async () => ({
      ...(await getCopilotEngineStatus()),
      authReady: false,
    }));
    expect(
      (await getEngineDriver("copilot")!.probe(instance, probeOptions()))
        .models,
    ).toEqual([]);
  });

  it("reports a missing Cursor Agent without resolving it again", async () => {
    const instance = makeFakeInstance({ driver: "cursor", id: "cursor" });

    const result = await getEngineDriver("cursor")!.probe(
      instance,
      probeOptions(),
    );

    expect(result.install).toEqual({
      installed: false,
      path: null,
      source: null,
      version: null,
    });
    expect(result.status).toBe("error");
    expect(result.message).toBe("Cursor Agent was not found in PATH.");
    expect(resolveCursorRuntime).not.toHaveBeenCalled();
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
