import { describe, expect, it } from "bun:test";

import { resolveInitialThreadComposerUiState } from "./thread-screen.helpers";

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
