import { describe, expect, it } from "bun:test";

import {
  isPickableEngineSnapshot,
  toComposerEngineModels,
  toComposerEngineOption,
} from "./composer-catalog";
import { makeFakeModel, makeFakeSnapshot } from "./contract/testing";
import { toEngineModel } from "./drivers/legacy-status";

describe("toComposerEngineModels", () => {
  it("keeps the shape the engines.models route returned before snapshots", () => {
    const snapshot = makeFakeSnapshot({
      driver: "claude",
      models: [
        toEngineModel({
          contextWindow: 200_000,
          defaultReasoningEffort: "high",
          description: "Claude model",
          displayName: "Claude Sonnet",
          id: "claude-sonnet",
          inputModalities: ["text", "image"],
          isDefault: true,
          model: "claude-sonnet-20260101",
          supportedReasoningEfforts: [
            { description: "High", effort: "high", label: "High" },
            { description: "Max", effort: "max", label: "Max" },
          ],
        }),
      ],
    });

    expect(toComposerEngineModels(snapshot)).toEqual([
      {
        contextWindow: 200_000,
        defaultReasoningEffort: "high",
        description: "Claude model",
        displayName: "Claude Sonnet",
        engine: "claude",
        inputModalities: ["text", "image"],
        instanceId: "claude",
        isConnected: true,
        isEnabled: true,
        modelId: "claude-sonnet",
        options: snapshot.models[0]!.options,
        provider: null,
        rawModelId: "claude-sonnet-20260101",
        supportedReasoningEfforts: ["high", "max"],
      },
    ]);
  });

  it("derives OpenCode agent and variant traits from option descriptors", () => {
    const [model] = toComposerEngineModels(
      makeFakeSnapshot({
        driver: "opencode",
        models: [
          toEngineModel({
            defaultReasoningEffort: null,
            description: "OpenCode model",
            displayName: "GPT-5",
            id: "openai/gpt-5",
            inputModalities: ["text"],
            isDefault: true,
            model: "openai/gpt-5",
            openCode: {
              agentOptions: [
                { isDefault: true, label: "Build", value: "build" },
                { label: "Plan", value: "plan" },
              ],
              variantOptions: [{ label: "High", value: "high" }],
            },
            supportedReasoningEfforts: [],
          }),
        ],
      }),
    );

    expect(model!.openCode).toEqual({
      agentOptions: [
        { isDefault: true, label: "Build", value: "build" },
        { label: "Plan", value: "plan" },
      ],
      variantOptions: [{ label: "High", value: "high" }],
    });
    expect(model!.supportedReasoningEfforts).toEqual([]);
    expect(model!.rawModelId).toBe("openai/gpt-5");
  });

  it("keeps reported models connected while the engine is not usable", () => {
    const snapshot = makeFakeSnapshot({ usable: false });
    expect(toComposerEngineModels(snapshot)[0]!.isConnected).toBe(true);
    expect(
      toComposerEngineModels(
        makeFakeSnapshot({
          models: [makeFakeModel({ disabledReason: "Needs Codex 0.170." })],
        }),
      )[0]!.isEnabled,
    ).toBe(false);
  });
});

describe("toComposerEngineOption", () => {
  it("describes an instance for the engine picker", () => {
    expect(
      toComposerEngineOption(
        makeFakeSnapshot({
          accentColor: "#ff8800",
          driver: "codex",
          instanceId: "codex-work",
          label: "Codex (work)",
        }),
      ),
    ).toEqual({
      accentColor: "#ff8800",
      description: "Use the Codex CLI already configured on this machine.",
      engine: "codex",
      error: null,
      instanceId: "codex-work",
      isAvailable: true,
      isDefaultInstance: false,
      label: "Codex (work)",
      permissionModes: ["default", "full"],
      settlesUnattendedApprovals: false,
      stability: "stable",
      supportsPlanMode: "native",
    });
  });

  it("gives unusable instances a reason", () => {
    expect(
      toComposerEngineOption(
        makeFakeSnapshot({ message: "Login needed.", usable: false }),
      ).error,
    ).toBe("Login needed.");
    expect(
      toComposerEngineOption(
        makeFakeSnapshot({ label: "Codex", status: "checking", usable: false }),
      ).error,
    ).toBe("Codex is being checked.");
  });

  it("lists only enabled instances of implemented drivers", () => {
    expect(isPickableEngineSnapshot(makeFakeSnapshot())).toBe(true);
    expect(isPickableEngineSnapshot(makeFakeSnapshot({ enabled: false }))).toBe(
      false,
    );
    expect(isPickableEngineSnapshot(makeFakeSnapshot({ driver: "grok" }))).toBe(
      false,
    );
    expect(
      isPickableEngineSnapshot(makeFakeSnapshot({ driver: "gemini" })),
    ).toBe(false);
  });
});
