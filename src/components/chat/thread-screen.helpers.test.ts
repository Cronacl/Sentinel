import { describe, expect, it } from "bun:test";

import { resolveInitialThreadComposerUiState } from "./thread-screen.helpers";

describe("resolveInitialThreadComposerUiState", () => {
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
      openCodeSelection: {
        agent: null,
        variant: null,
      },
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
          openCodeSelection: {
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
      openCodeSelection: {
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
