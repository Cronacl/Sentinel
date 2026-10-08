import { describe, expect, it, mock } from "bun:test";

// Availability parity: every legacy status an engine can report must be
// usable as a snapshot exactly when the engine's own isXEngineAvailable said
// so before the platform. The engines' real predicates and adapters run
// here; nothing is spawned (only pure status objects are mapped).
mock.module("server-only", () => ({}));

const { computeEngineSnapshotUsable } = await import("../contract");
const { isClaudeEngineAvailable } =
  await import("@/lib/ai/chat/engines/claude-sdk");
const { isCopilotEngineAvailable } =
  await import("@/lib/ai/chat/engines/copilot-sdk");
const { isOpenCodeEngineAvailable } =
  await import("@/lib/ai/chat/engines/opencode-sdk");
const { fromClaudeStatus } = await import("./claude");
const { fromCodexStatus } = await import("./codex");
const { fromCopilotStatus } = await import("./copilot");
const { fromOpenCodeStatus } = await import("./opencode");

import type { EngineProbeResult } from "../contract";

const STATES = [
  "auth_unavailable",
  "error",
  "missing",
  "ready",
  "timeout_no_cache",
  "timeout_using_cache",
] as const;

type Variant = {
  authReady: boolean;
  installed: boolean;
  models: boolean;
  state: (typeof STATES)[number];
};

function* variants(): Generator<Variant> {
  for (const state of STATES) {
    for (const authReady of [true, false]) {
      for (const installed of [true, false]) {
        for (const models of [true, false]) {
          yield { authReady, installed, models, state };
        }
      }
    }
  }
}

// One legacy model; each engine's model type adds fields the adapter ignores.
const MODEL = {
  defaultReasoningEffort: null,
  description: "A model",
  displayName: "Model",
  id: "model-1",
  inputModalities: ["text"],
  isDefault: true,
  model: "model-1",
  supportedReasoningEfforts: [],
};

function usable(result: EngineProbeResult) {
  return computeEngineSnapshotUsable({
    ...result,
    availability: "available",
    compatibilityAdvisory: result.compatibilityAdvisory ?? null,
    enabled: true,
  });
}

/**
 * The legacy verdict, with the one deliberate change of driver-contract.md
 * §2.2: a runtime that is not installed is never usable (Codex counted a
 * timeout without a CLI as available).
 */
function expected(legacy: boolean, variant: Variant) {
  return legacy && variant.installed;
}

function describeVariant(engine: string, variant: Variant) {
  return `${engine} ${variant.state} auth=${variant.authReady} installed=${variant.installed} models=${variant.models}`;
}

describe("legacy availability parity", () => {
  it("keeps Claude's availability", () => {
    for (const variant of variants()) {
      const status = {
        account: null,
        authReady: variant.authReady,
        availableModels: variant.models ? [MODEL as never] : [],
        binaryDetected: variant.installed,
        binaryPath: "/usr/local/bin/claude",
        binaryVersion: "2.1.300",
        engine: "claude" as const,
        error: variant.state === "ready" ? null : "x",
        lastSuccessfulProbeAt: null,
        sdkDetected: true,
        state: variant.state === "missing" ? "missing_binary" : variant.state,
        usedCachedStatus: false,
      } as const;

      expect([
        describeVariant("claude", variant),
        usable(fromClaudeStatus(status, "managed-path")),
      ]).toEqual([
        describeVariant("claude", variant),
        expected(isClaudeEngineAvailable(status), variant),
      ]);
    }
  });

  it("keeps Codex's availability (routers/engines.ts isCodexEngineAvailable)", () => {
    for (const variant of variants()) {
      const status = {
        account: null,
        authReady: variant.authReady,
        availableModels: variant.models ? [MODEL as never] : [],
        cliDetected: variant.installed,
        cliPath: "/usr/local/bin/codex",
        cliVersion: "codex-cli 0.160.0",
        engine: "codex" as const,
        error: variant.state === "ready" ? null : "x",
        isDesktopRuntime: true,
        lastSuccessfulProbeAt: null,
        requiresOpenaiAuth: false,
        serverReachable: true,
        state: variant.state === "missing" ? "missing_cli" : variant.state,
        usedCachedStatus: false,
      } as const;
      const legacy =
        status.state === "ready" || status.state === "timeout_no_cache";

      expect([
        describeVariant("codex", variant),
        usable(fromCodexStatus(status, "managed-path")),
      ]).toEqual([
        describeVariant("codex", variant),
        expected(legacy, variant),
      ]);
    }
  });

  it("keeps Copilot's availability", () => {
    for (const variant of variants()) {
      const status = {
        account: null,
        authReady: variant.authReady,
        availableModels: variant.models ? [MODEL as never] : [],
        cliDetected: variant.installed,
        cliPath: "/opt/copilot/copilot",
        cliVersion: "1.0.16",
        engine: "copilot" as const,
        error: variant.state === "ready" ? null : "x",
        lastSuccessfulProbeAt: null,
        runtimeSource: "bundled" as const,
        state: variant.state === "missing" ? "missing_runtime" : variant.state,
        usedCachedStatus: false,
      } as const;

      expect([
        describeVariant("copilot", variant),
        usable(fromCopilotStatus(status, "sdk-bundled")),
      ]).toEqual([
        describeVariant("copilot", variant),
        expected(isCopilotEngineAvailable(status), variant),
      ]);
    }
  });

  it("keeps OpenCode's availability", () => {
    for (const variant of variants()) {
      const status = {
        authReady: variant.authReady,
        availableModels: variant.models
          ? [
              {
                ...MODEL,
                openCode: { agentOptions: [], variantOptions: [] },
              } as never,
            ]
          : [],
        cliDetected: variant.installed,
        cliPath: "/usr/local/bin/opencode",
        cliVersion: "1.18.35",
        compatibilityAdvisory: null,
        engine: "opencode" as const,
        error: variant.state === "ready" ? null : "x",
        lastSuccessfulProbeAt: null,
        state: variant.state === "missing" ? "missing_runtime" : variant.state,
        usedCachedStatus: false,
      } as const;

      expect([
        describeVariant("opencode", variant),
        usable(fromOpenCodeStatus(status, "login-shell")),
      ]).toEqual([
        describeVariant("opencode", variant),
        expected(isOpenCodeEngineAvailable(status), variant),
      ]);
    }
  });
});
