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
mock.module("@/lib/ai/chat/engines/cursor-acp", () => ({
  getCursorEngineStatus: () =>
    statusFor("cursor", { parameterizedModelPicker: true }),
  isCursorEngineAvailable: isReady,
  resetCursorEngineStatusCache: () => {},
  resetCursorRuntimeCache: () => {},
  resolveCursorRuntime: async () => runtimeFor("cursor"),
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

// Each external runtime module is faked under its own path, so a driver
// whose handlers loaded another engine's runtime (or swapped run and stop)
// records the wrong runtime or action.
const runtimeCalls: RecordedThreadRuntimeCall[] = [];
const RUNTIME_EXPORTS = {
  claude: ["runClaudeThreadChat", "stopClaudeThreadRun"],
  codex: ["runCodexThreadChat", "stopCodexThreadRun"],
  copilot: ["runCopilotThreadChat", "stopCopilotThreadRun"],
  cursor: ["runCursorThreadChat", "stopCursorThreadRun"],
  opencode: ["runOpenCodeThreadChat", "stopOpenCodeThreadRun"],
} as const;
for (const [kind, [runName, stopName]] of Object.entries(RUNTIME_EXPORTS)) {
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
  mock.module(`@/lib/ai/chat/runtime/${kind}`, () => ({
    [runName]: record("run"),
    [stopName]: record("stop"),
  }));
}

const { AVAILABLE_DRIVER_KINDS } = await import("../catalog");
const { SERVER_DRIVERS } = await import("../platform/drivers");
const { describeDriverConformance } =
  await import("../platform/testing/driver-conformance");

// What each runtime writes to chat_engine_state (before stamping).
const STATE_SAMPLES: Record<string, object[]> = {
  claude: [{ cwd: "/repo", permissionMode: "default", sessionId: "s-1" }],
  codex: [{ codexThreadId: "codex-thread-1", pendingTurnId: null }],
  copilot: [{ cwd: "/repo", sessionId: "s-1" }],
  cursor: [{ cwd: "/repo", sessionId: "s-1" }],
  opencode: [{ selectedAgent: "build", sessionId: "s-1" }],
};

describe("server driver registry", () => {
  it("registers a conforming driver for every implemented kind", () => {
    expect(SERVER_DRIVERS.map((driver) => driver.kind).sort()).toEqual(
      [...AVAILABLE_DRIVER_KINDS].sort(),
    );
  });
});

for (const driver of SERVER_DRIVERS) {
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
