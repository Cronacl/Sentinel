import { describe, expect, it } from "bun:test";

import { engineProbeResultSchema } from "../contract";
import {
  fromLegacyStatus,
  NO_LEGACY_ACCOUNT,
  toEngineModel,
  type LegacyModelInfo,
  type LegacyStatus,
} from "./legacy-status";

function model(overrides: Partial<LegacyModelInfo> = {}): LegacyModelInfo {
  return {
    defaultReasoningEffort: "medium",
    description: "Flagship model.",
    displayName: "GPT-5 Codex",
    id: "gpt-5-codex",
    inputModalities: ["text", "image"],
    isDefault: true,
    model: "gpt-5-codex",
    supportedReasoningEfforts: [
      { description: "Fast", effort: "low", label: "Low" },
      { description: "Balanced", effort: "medium", label: "Medium" },
    ],
    ...overrides,
  };
}

function status(overrides: Partial<LegacyStatus> = {}): LegacyStatus {
  return {
    account: NO_LEGACY_ACCOUNT,
    authReady: true,
    error: null,
    installed: true,
    models: [model()],
    path: "/usr/local/bin/codex",
    source: "managed-path",
    state: "ready",
    version: "codex-cli 0.160.0",
    ...overrides,
  };
}

describe("toEngineModel", () => {
  it("maps reasoning efforts to a reasoning select with the default marked", () => {
    expect(toEngineModel(model())).toEqual({
      description: "Flagship model.",
      id: "gpt-5-codex",
      inputModalities: ["text", "image"],
      isCustom: false,
      isDefault: true,
      name: "GPT-5 Codex",
      options: [
        {
          choices: [
            { description: "Fast", id: "low", label: "Low" },
            {
              description: "Balanced",
              id: "medium",
              isDefault: true,
              label: "Medium",
            },
          ],
          id: "effort",
          label: "Reasoning effort",
          role: "reasoning",
          type: "select",
        },
      ],
      source: "live",
    });
  });

  it("keeps the wire id, context window and OpenCode traits", () => {
    const mapped = toEngineModel(
      model({
        contextWindow: 400_000,
        id: "openai/gpt-5",
        inputModalities: ["video"],
        isDefault: false,
        model: "gpt-5",
        openCode: {
          agentOptions: [
            { isDefault: true, label: "Build", value: "build" },
            { label: "Plan", value: "plan" },
          ],
          variantOptions: [],
        },
        supportedReasoningEfforts: [],
      }),
    );

    expect(mapped.runtimeId).toBe("gpt-5");
    expect(mapped.contextWindow).toBe(400_000);
    expect(mapped.inputModalities).toEqual(["text"]);
    expect(mapped.isDefault).toBeUndefined();
    expect(mapped.options).toEqual([
      {
        choices: [
          { id: "build", isDefault: true, label: "Build" },
          { id: "plan", label: "Plan" },
        ],
        id: "agent",
        label: "Agent",
        role: "agent",
        type: "select",
      },
    ]);
  });
});

describe("fromLegacyStatus", () => {
  it("maps a ready status and validates against the contract", () => {
    const result = fromLegacyStatus(
      status({
        account: {
          email: "me@example.com",
          label: null,
          method: "chatgpt",
          plan: "plus",
        },
      }),
      { canLogin: true, canLogout: true },
    );

    expect(engineProbeResultSchema.parse(result)).toEqual(result);
    expect(result).toEqual(
      expect.objectContaining({
        auth: {
          canLogin: true,
          canLogout: true,
          email: "me@example.com",
          label: null,
          method: "chatgpt",
          plan: "plus",
          status: "authenticated",
        },
        defaultModelId: "gpt-5-codex",
        install: {
          installed: true,
          path: "/usr/local/bin/codex",
          source: "managed-path",
          version: "codex-cli 0.160.0",
        },
        stale: false,
        status: "ready",
      }),
    );
  });

  it("follows the documented state table", () => {
    const cases = [
      ["ready", "ready", false, "authenticated", true],
      ["timeout_using_cache", "ready", true, "authenticated", true],
      ["timeout_no_cache", "warning", true, "unknown", true],
      ["auth_unavailable", "warning", false, "unauthenticated", true],
      ["missing_cli", "error", false, "unknown", false],
      ["missing_binary", "error", false, "unknown", false],
      ["missing_runtime", "error", false, "unknown", false],
      ["error", "error", false, "unknown", true],
    ] as const;

    for (const [state, probeStatus, stale, auth, installed] of cases) {
      const result = fromLegacyStatus(
        status({ error: state === "ready" ? null : "x", state }),
      );
      expect([
        state,
        result.status,
        result.stale,
        result.auth.status,
        result.install.installed,
      ]).toEqual([state, probeStatus, stale, auth, installed]);
    }
  });

  it("offers fallback models only for an installed runtime that timed out without any", () => {
    const fallback = [model({ displayName: "Auto", id: "default" })];
    const options = { fallbackModels: () => fallback };

    expect(
      fromLegacyStatus(
        status({ models: [], state: "timeout_no_cache" }),
        options,
      ).models.map((entry) => entry.id),
    ).toEqual(["default"]);
    expect(
      fromLegacyStatus(
        status({ installed: false, models: [], state: "timeout_no_cache" }),
        options,
      ).models,
    ).toEqual([]);
    expect(
      fromLegacyStatus(status({ models: [], state: "ready" }), options).models,
    ).toEqual([]);
    expect(
      fromLegacyStatus(status({ models: [], state: "timeout_no_cache" }), {
        fallbackModels: () => null,
      }).models,
    ).toEqual([]);
  });

  it("drops duplicate model ids and keeps a missing runtime's retained path", () => {
    const result = fromLegacyStatus(
      status({
        error: "Codex CLI path is retained but is not currently launchable.",
        installed: false,
        models: [model(), model({ displayName: "dup" })],
        path: "/old/codex",
        state: "missing_cli",
      }),
    );

    expect(result.models).toHaveLength(1);
    expect(result.install).toEqual({
      installed: false,
      path: "/old/codex",
      source: null,
      version: null,
    });
    expect(result.message).toBe(
      "Codex CLI path is retained but is not currently launchable.",
    );
  });

  it("carries a runtime's compatibility advisory", () => {
    const advisory = {
      message: "Too old",
      recommendedRange: ">=1.14.19 <2.0.0",
      recommendedVersion: "1.14.19",
      status: "broken" as const,
    };

    expect(
      fromLegacyStatus(
        status({ compatibilityAdvisory: advisory, state: "error" }),
      ).compatibilityAdvisory,
    ).toEqual(advisory);
  });
});
