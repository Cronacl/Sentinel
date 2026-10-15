import { describe, expect, it, mock } from "bun:test";

import type { RecordedThreadRuntimeCall } from "../platform/testing/driver-conformance";

// Every registered server driver runs the conformance suite against fakes of
// its engine module: the mode below switches each fake between an installed
// runtime, a missing one and a probe that never answers.
mock.module("server-only", () => ({}));

type FakeMode = "hang" | "installed" | "missing";
const modes: Record<string, FakeMode> = {};
const modeOf = (kind: string) => modes[kind] ?? "installed";

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

const legacyModel = {
  contextWindow: 200_000,
  defaultReasoningEffort: "medium",
  description: "A fake model.",
  displayName: "Fake Model",
  id: "fake-model",
  inputModalities: ["text", "image"],
  isDefault: true,
  model: "fake-model-2026",
  supportedReasoningEfforts: [
    { description: "Medium", effort: "medium", label: "Medium" },
    { description: "High", effort: "high", label: "High" },
  ],
};

function legacyStatus(kind: string, extra: Record<string, unknown> = {}) {
  const installed = modeOf(kind) === "installed";
  return {
    account: null,
    authReady: installed,
    availableModels: installed ? [legacyModel] : [],
    binaryDetected: installed,
    binaryPath: installed ? `/usr/local/bin/${kind}` : null,
    binaryVersion: installed ? "1.0.0" : null,
    cliDetected: installed,
    cliPath: installed ? `/usr/local/bin/${kind}` : null,
    cliVersion: installed ? "1.0.0" : null,
    engine: kind,
    error: installed ? null : `${kind} was not found in PATH.`,
    lastSuccessfulProbeAt: null,
    state: installed
      ? "ready"
      : kind === "claude"
        ? "missing_binary"
        : "missing_cli",
    usedCachedStatus: false,
    ...extra,
  };
}

async function statusFor(kind: string, extra?: Record<string, unknown>) {
  return modeOf(kind) === "hang" ? never() : legacyStatus(kind, extra);
}

function runtimeFor(kind: string) {
  const installed = modeOf(kind) === "installed";
  return {
    cliDetected: installed,
    cliPath: installed ? `/usr/local/bin/${kind}` : null,
    cliVersion: installed ? "1.0.0" : null,
    installSource: installed ? "managed-path" : null,
    source: installed ? "managed-path" : null,
  };
}

const isReady = (status: { authReady: boolean; state: string }) =>
  status.state === "ready" && status.authReady;

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => ({
    getStatus: () => statusFor("codex", { isDesktopRuntime: true }),
  }),
  resetCodexEngineStatusCache: () => {},
}));
mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  resetCodexCliResolutionCache: () => {},
  resolveCodexCli: async () => runtimeFor("codex"),
}));
mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  buildClaudeFallbackModels: () => [],
  getClaudeEngineStatus: () => statusFor("claude"),
  isClaudeEngineAvailable: isReady,
  resetClaudeCodeRuntimeCache: () => {},
  resetClaudeEngineStatusCache: () => {},
  resolveClaudeCodeRuntime: async () => runtimeFor("claude"),
}));
mock.module("@/lib/ai/chat/engines/copilot-sdk", () => ({
  getCopilotEngineStatus: () => statusFor("copilot"),
  isCopilotEngineAvailable: isReady,
  resetCopilotEngineStatusCache: () => {},
  resetCopilotRuntimeCache: () => {},
  resolveCopilotRuntime: async () => runtimeFor("copilot"),
}));
// Cursor and the other ACP agents (Grok, Antigravity, registry agents) probe
// through the shared ACP engine: faked at that seam, per descriptor driver.
mock.module("@/lib/ai/chat/engines/acp/probe", () => ({
  probeAcpAgent: async (descriptor: { driver: string; label: string }) => {
    const mode = modeOf(descriptor.driver);
    if (mode === "hang") {
      return never();
    }
    const installed = mode === "installed";
    return {
      auth: {
        canLogin: false,
        canLogout: false,
        email: null,
        label: null,
        method: `${descriptor.label} Login`,
        plan: null,
        status: installed ? "authenticated" : "unknown",
      },
      install: {
        installed,
        path: installed ? `/usr/local/bin/${descriptor.driver}-agent` : null,
        source: installed ? "managed-path" : null,
        version: installed ? "2026.08.04" : null,
      },
      ...(installed
        ? {}
        : { message: `${descriptor.label} was not found in PATH.` }),
      models: installed
        ? [
            {
              id: "fake-model",
              inputModalities: ["text"],
              isCustom: false,
              name: "Fake Model",
              options: [],
              source: "live",
            },
          ]
        : [],
      status: installed ? "ready" : "error",
    };
  },
}));
mock.module("@/lib/ai/chat/engines/opencode-sdk", () => ({
  getOpenCodeEngineStatus: () =>
    statusFor("opencode", {
      availableModels:
        modeOf("opencode") === "installed"
          ? [
              {
                ...legacyModel,
                id: "openai/gpt-5",
                model: "openai/gpt-5",
                openCode: {
                  agentOptions: [
                    { isDefault: true, label: "Build", value: "build" },
                    { label: "Plan", value: "plan" },
                  ],
                  variantOptions: [],
                },
                supportedReasoningEfforts: [],
              },
            ]
          : [],
    }),
  isOpenCodeEngineAvailable: isReady,
  resetOpenCodeEngineStatusCache: () => {},
  resetOpenCodeRuntimeCache: () => {},
  resolveOpenCodeRuntime: async () => runtimeFor("opencode"),
}));
// Pi probes through its own RPC engine module (an ephemeral `pi --mode rpc`).
mock.module("@/lib/ai/chat/engines/pi/probe", () => ({
  PI_LOGIN_HINT: "Run `pi` and use /login.",
  PI_PROBE_TIMEOUT_MS: 8_000,
  probePiEngine: async () => {
    const mode = modeOf("pi");
    if (mode === "hang") {
      return never();
    }
    const installed = mode === "installed";
    return {
      auth: {
        canLogin: false,
        canLogout: false,
        email: null,
        label: null,
        method: "Pi login",
        plan: null,
        status: installed ? "authenticated" : "unknown",
      },
      install: {
        installed,
        path: installed ? "/usr/local/bin/pi" : null,
        source: installed ? "managed-path" : null,
        version: installed ? "1.0.4" : null,
      },
      ...(installed ? {} : { message: "Pi was not found in PATH." }),
      models: installed
        ? [
            {
              id: "default",
              inputModalities: ["text"],
              isCustom: false,
              isDefault: true,
              name: "Pi default",
              options: [],
              source: "live",
            },
            {
              id: "anthropic/claude-sonnet-4",
              inputModalities: ["text", "image"],
              isCustom: false,
              name: "Claude Sonnet 4",
              options: [],
              source: "live",
            },
          ]
        : [],
      status: installed ? "ready" : "error",
    };
  },
}));

// Each external runtime module is faked under its own path, so a driver
// whose handlers loaded another engine's runtime (or swapped run and stop)
// records the wrong runtime or action. Planned kinds have their slots here
// already: a driver that lands with these module and export names needs no
// edit in this file.
const runtimeCalls: RecordedThreadRuntimeCall[] = [];
const RUNTIME_MODULES: Record<
  string,
  [module: string, run: string, stop: string]
> = {
  claude: ["claude", "runClaudeThreadChat", "stopClaudeThreadRun"],
  codex: ["codex", "runCodexThreadChat", "stopCodexThreadRun"],
  copilot: ["copilot", "runCopilotThreadChat", "stopCopilotThreadRun"],
  cursor: ["cursor", "runCursorThreadChat", "stopCursorThreadRun"],
  opencode: ["opencode", "runOpenCodeThreadChat", "stopOpenCodeThreadRun"],
  grok: ["grok", "runGrokThreadChat", "stopGrokThreadRun"],
  antigravity: [
    "antigravity",
    "runAntigravityThreadChat",
    "stopAntigravityThreadRun",
  ],
  pi: ["pi", "runPiThreadChat", "stopPiThreadRun"],
  // Not runtime/acp/, which is the shared ACP runtime every agent uses.
  acp: ["acp-registry", "runAcpRegistryThreadChat", "stopAcpRegistryThreadRun"],
};
for (const [kind, [module, runName, stopName]] of Object.entries(
  RUNTIME_MODULES,
)) {
  const record =
    (action: "run" | "stop") =>
    async (request: never, thread: unknown, instance?: unknown) => {
      runtimeCalls.push({
        action,
        instance: instance as RecordedThreadRuntimeCall["instance"],
        request,
        runtime: kind,
        thread,
      });
      return new Response(null, { status: 204 });
    };
  mock.module(`@/lib/ai/chat/runtime/${module}`, () => ({
    [runName]: record("run"),
    [stopName]: record("stop"),
  }));
}

const { AVAILABLE_DRIVER_KINDS, BUILTIN_DRIVER_KINDS, isAvailableDriverKind } =
  await import("../catalog");
const { getEngineDriver, SERVER_DRIVERS } = await import("../platform/drivers");
const { describeDriverConformance, describePlannedDriverConformance } =
  await import("../platform/testing/driver-conformance");

// What each runtime writes to chat_engine_state (before stamping).
const STATE_SAMPLES: Record<string, object[]> = {
  claude: [{ cwd: "/repo", permissionMode: "default", sessionId: "s-1" }],
  codex: [{ codexThreadId: "codex-thread-1", pendingTurnId: null }],
  copilot: [{ cwd: "/repo", sessionId: "s-1" }],
  cursor: [{ cwd: "/repo", sessionId: "s-1" }],
  opencode: [{ selectedAgent: "build", sessionId: "s-1" }],
  grok: [{ cwd: "/repo", modeId: "default", sessionId: "s-1" }],
  antigravity: [{ cwd: "/repo", sessionId: "s-1" }],
  pi: [{ cwd: "/repo", sessionPath: "/repo/.pi/sessions/s-1.jsonl" }],
  acp: [{ agentId: "gemini", cwd: "/repo", sessionId: "s-1" }],
};

describe("server driver registry", () => {
  it("lists one driver per builtin kind, in catalog order", () => {
    expect(SERVER_DRIVERS.map((driver) => driver.kind)).toEqual([
      ...BUILTIN_DRIVER_KINDS,
    ]);
  });

  it("serves a conforming driver for every implemented kind only", () => {
    expect(
      SERVER_DRIVERS.filter((driver) => getEngineDriver(driver.kind)).map(
        (driver) => driver.kind,
      ),
    ).toEqual([...AVAILABLE_DRIVER_KINDS]);
  });
});

for (const driver of SERVER_DRIVERS) {
  // Planned kinds keep their stub until they land; they then run the full
  // suite below with the fakes above.
  if (!isAvailableDriverKind(driver.kind)) {
    describePlannedDriverConformance(driver);
    continue;
  }
  const external = driver.meta.runtime === "external";
  describeDriverConformance(driver, {
    installed: () => {
      modes[driver.kind] = "installed";
    },
    ...(external
      ? {
          hang: () => {
            modes[driver.kind] = "hang";
          },
          missing: () => {
            modes[driver.kind] = "missing";
          },
          stateSamples: STATE_SAMPLES[driver.kind],
          threadRuntime: {
            calls: () => runtimeCalls,
            reset: () => {
              runtimeCalls.length = 0;
            },
          },
        }
      : {}),
  });
}
