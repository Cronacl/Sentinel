import { describe, expect, it } from "bun:test";

import {
  applyThreadSelectionChange,
  resolveInitialThreadComposerUiState,
} from "./thread-screen.helpers";

describe("resolveInitialThreadComposerUiState", () => {
  it("restores the options the thread last ran with", () => {
    expect(
      resolveInitialThreadComposerUiState({
        thread: {
          chatEngine: "opencode",
          chatModelId: "openai/gpt-5",
          chatModelOptions: [
            { id: "agent", value: "build" },
            { id: "fast", value: true },
          ],
          chatReasoningEffort: null,
          mode: "chat",
        },
      }).optionSelection,
    ).toEqual({ agent: "build" });
  });

  it("keeps the thread's engine instance in its selection", () => {
    expect(
      resolveInitialThreadComposerUiState({
        thread: {
          chatEngine: "codex",
          chatEngineInstanceId: "codex-work",
          chatModelId: "gpt-5.4",
          chatReasoningEffort: null,
          mode: "chat",
        },
      }).threadSelection,
    ).toEqual({
      engine: "codex",
      engineInstanceId: "codex-work",
      modelId: "gpt-5.4",
      mode: "chat",
      reasoningEffort: null,
    });
  });

  it("falls back to persisted thread settings when no handoff exists", () => {
    expect(
      resolveInitialThreadComposerUiState({
        thread: {
          chatEngine: "codex",
          chatModelId: "gpt-5.4",
          chatReasoningEffort: "medium",
          mode: "chat",
        },
      }),
    ).toEqual({
      draftPreparedWorktree: null,
      draftProjectMode: "local",
      optionSelection: {},
      threadSelection: {
        engine: "codex",
        modelId: "gpt-5.4",
        mode: "chat",
        reasoningEffort: "medium",
      },
    });
  });

  it("seeds thread selection and project state from the handoff snapshot", () => {
    expect(
      resolveInitialThreadComposerUiState({
        initialComposerUiState: {
          draftPreparedWorktree: {
            branch: "thread/feature",
            path: "/repo/.worktrees/thread-1",
          },
          draftProjectMode: "worktree",
          optionSelection: {
            agent: "builder",
            variant: "max",
          },
          threadId: "thread-1",
          threadSelection: {
            engine: "opencode",
            modelId: "opencode-model",
            mode: "plan",
            reasoningEffort: "high",
          },
          updatedAt: Date.now(),
        },
        thread: {
          chatEngine: "codex",
          chatModelId: "gpt-5.4",
          chatReasoningEffort: "medium",
          mode: "chat",
        },
      }),
    ).toEqual({
      draftPreparedWorktree: {
        branch: "thread/feature",
        path: "/repo/.worktrees/thread-1",
      },
      draftProjectMode: "worktree",
      optionSelection: {
        agent: "builder",
        variant: "max",
      },
      threadSelection: {
        engine: "opencode",
        modelId: "opencode-model",
        mode: "plan",
        reasoningEffort: "high",
      },
    });
  });
});

describe("applyThreadSelectionChange", () => {
  const onSecondCodex = {
    engine: "codex" as const,
    engineInstanceId: "codex-work",
    modelId: "gpt-5.4",
    mode: "chat" as const,
    reasoningEffort: "medium" as const,
  };

  it("keeps a thread on its instance when the model or effort changes", () => {
    // The composer reports model changes with the engine; dropping the
    // instance here rebound the thread to the default instance.
    const afterModel = applyThreadSelectionChange(onSecondCodex, {
      engine: "codex",
      modelId: "gpt-5.5",
      reasoningEffort: "high",
    });
    expect(afterModel).toEqual({
      ...onSecondCodex,
      modelId: "gpt-5.5",
      reasoningEffort: "high",
    });

    expect(
      applyThreadSelectionChange(afterModel, { mode: "plan" }),
    ).toMatchObject({ engineInstanceId: "codex-work", mode: "plan" });
  });

  it("takes the instance the composer reports", () => {
    expect(
      applyThreadSelectionChange(onSecondCodex, {
        engine: "codex",
        engineInstanceId: "codex-work",
        modelId: "gpt-5.5",
      }).engineInstanceId,
    ).toBe("codex-work");
  });

  it("moves to the new engine's default instance on an engine change", () => {
    expect(
      applyThreadSelectionChange(onSecondCodex, {
        engine: "claude",
        modelId: "claude-sonnet-5",
      }),
    ).toMatchObject({ engine: "claude", engineInstanceId: "claude" });
  });
});
