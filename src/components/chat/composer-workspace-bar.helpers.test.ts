import { describe, expect, it } from "bun:test";

import { resolveComposerWorkspaceBarLiveState } from "./composer-workspace-bar.helpers";
import { resolveKeyedStableState } from "./repo-thread-ui-state";

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

  it("derives stable worktree display from the current thread repo context during pending refreshes", () => {
    const effectiveRepoContext = resolveKeyedStableState({
      cachedState: null,
      currentKey: "workspace-1:thread-1",
      stableState: {
        key: "workspace-1:thread-1",
        state: {
          branch: "thread/ember-d4e5f6",
          threadBranch: "thread/ember-d4e5f6",
          threadProjectMode: "worktree" as const,
          worktreeStatus: "ready" as const,
        },
      },
    });

    expect(
      resolveComposerWorkspaceBarLiveState({
        repoContext: effectiveRepoContext,
        repoThreadId: "thread-1",
      }),
    ).toMatchObject({
      displayBranch: "thread/ember-d4e5f6",
      hasReadyWorktree: true,
      isUsingWorktree: true,
      projectModeLabel: "Worktree",
    });
  });

  it("uses cached target repo context instead of another thread's stable context", () => {
    const effectiveRepoContext = resolveKeyedStableState({
      cachedState: {
        branch: "main",
        threadBranch: "feature/current",
        threadProjectMode: "local" as const,
        worktreeStatus: "none" as const,
      },
      currentKey: "workspace-1:thread-current",
      stableState: {
        key: "workspace-1:thread-previous",
        state: {
          branch: "thread/previous",
          threadBranch: "thread/previous",
          threadProjectMode: "worktree" as const,
          worktreeStatus: "ready" as const,
        },
      },
    });

    expect(
      resolveComposerWorkspaceBarLiveState({
        repoContext: effectiveRepoContext,
        repoThreadId: "thread-current",
      }),
    ).toMatchObject({
      displayBranch: "main",
      isUsingWorktree: false,
      threadBranch: "feature/current",
    });
  });

  it("checks selected branches against live repo context instead of stale display text", () => {
    const liveState = resolveComposerWorkspaceBarLiveState({
      repoContext: {
        branch: "main",
        threadBranch: "feature/current",
        threadProjectMode: "local",
        worktreeStatus: "none",
      },
      repoThreadId: "thread-2",
    });

    expect("thread/previous" === liveState.displayBranch).toBeFalse();
    expect("main" === liveState.displayBranch).toBeTrue();
  });

  it("treats the live worktree branch as selected while in worktree mode", () => {
    const liveState = resolveComposerWorkspaceBarLiveState({
      repoContext: {
        branch: "thread/atlas-a1b2c3",
        threadBranch: "thread/atlas-a1b2c3",
        threadProjectMode: "worktree",
        worktreeStatus: "ready",
      },
      repoThreadId: "thread-1",
    });

    expect("thread/atlas-a1b2c3" === liveState.displayBranch).toBeTrue();
  });
});
