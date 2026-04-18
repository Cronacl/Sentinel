import { describe, expect, it } from "bun:test";

import {
  resolveComposerWorkspaceBarDisplayState,
  resolveComposerWorkspaceBarLiveState,
  type ComposerWorkspaceBarDisplayState,
} from "./composer-workspace-bar.helpers";

function createDisplayState(
  overrides: Partial<ComposerWorkspaceBarDisplayState> = {},
): ComposerWorkspaceBarDisplayState {
  return {
    displayBranch: "feature/local",
    hasReadyWorktree: false,
    isUsingWorktree: false,
    projectMode: "local",
    projectModeLabel: "Local",
    threadBranch: "feature/local",
    worktreeStatus: "none",
    ...overrides,
  };
}

describe("composer workspace bar helpers", () => {
  it("keeps showing the prepared draft worktree instead of the polled local branch", () => {
    expect(
      resolveComposerWorkspaceBarLiveState({
        draftPreparedWorktree: {
          branch: "thread/atlas-a1b2c3",
          path: "/tmp/.sentinel-worktrees/thread-1",
        },
        draftProjectMode: "worktree",
        repoContext: {
          branch: "main",
          threadProjectMode: null,
          threadBranch: null,
          worktreeStatus: null,
        },
      }),
    ).toMatchObject({
      displayBranch: "thread/atlas-a1b2c3",
      hasReadyWorktree: true,
      isUsingWorktree: true,
      projectMode: "worktree",
      projectModeLabel: "Worktree",
    });
  });

  it("keeps showing the prepared draft worktree during the first thread handoff render", () => {
    expect(
      resolveComposerWorkspaceBarLiveState({
        draftPreparedWorktree: {
          branch: "thread/handoff-a1b2c3",
          path: "/tmp/.sentinel-worktrees/thread-1",
        },
        draftProjectMode: "worktree",
        repoContext: {
          branch: "main",
          threadProjectMode: "local",
          threadBranch: "main",
          worktreeStatus: "none",
        },
        repoThreadId: "thread-1",
      }),
    ).toMatchObject({
      displayBranch: "thread/handoff-a1b2c3",
      hasReadyWorktree: true,
      isUsingWorktree: true,
      projectMode: "worktree",
      projectModeLabel: "Worktree",
    });
  });

  it("holds the last stable worktree display during pending repo refreshes", () => {
    const previousStableState = createDisplayState({
      displayBranch: "thread/ember-d4e5f6",
      hasReadyWorktree: true,
      isUsingWorktree: true,
      projectMode: "worktree",
      projectModeLabel: "Worktree",
      threadBranch: "thread/ember-d4e5f6",
      worktreeStatus: "ready",
    });
    const liveLocalState = createDisplayState({
      displayBranch: "main",
      threadBranch: "main",
    });

    expect(
      resolveComposerWorkspaceBarDisplayState({
        isRepoStatePending: true,
        liveState: liveLocalState,
        previousStableState,
      }),
    ).toEqual(previousStableState);
  });
});
