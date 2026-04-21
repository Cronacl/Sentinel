import { describe, expect, it } from "bun:test";

import {
  resolveRepoThreadUiState,
  resolveStableRepoThreadUiState,
  type RepoThreadUiState,
} from "./repo-thread-ui-state";

describe("resolveRepoThreadUiState", () => {
  it("shows the live local branch while keeping the thread branch for resume", () => {
    expect(
      resolveRepoThreadUiState({
        branch: "main",
        branchResumeReason:
          "This thread is linked to fix/pre-launch, but the local project is on main.",
        branchResumeStatus: "needs_checkout",
        threadBranch: "fix/pre-launch",
        threadProjectMode: "local",
      }),
    ).toEqual({
      branchResumeReason:
        "This thread is linked to fix/pre-launch, but the local project is on main.",
      branchResumeStatus: "needs_checkout",
      displayBranch: "main",
      isBranchResumeBlocked: false,
      isThreadContextMisaligned: true,
      isUsingWorktree: false,
      needsBranchResume: true,
      threadBranch: "fix/pre-launch",
    });
  });

  it("treats a ready worktree as aligned on the thread branch", () => {
    expect(
      resolveRepoThreadUiState({
        branch: "thread/atlas-a1b2c3",
        branchResumeStatus: "matched",
        threadBranch: "thread/atlas-a1b2c3",
        threadProjectMode: "worktree",
      }),
    ).toMatchObject({
      displayBranch: "thread/atlas-a1b2c3",
      isThreadContextMisaligned: false,
      isUsingWorktree: true,
      threadBranch: "thread/atlas-a1b2c3",
    });
  });
});

describe("resolveStableRepoThreadUiState", () => {
  it("holds the previous stable branch state during pending refreshes", () => {
    const previousStableState: RepoThreadUiState = {
      branchResumeReason:
        "This thread is linked to fix/pre-launch, but the local project is on main.",
      branchResumeStatus: "needs_checkout",
      displayBranch: "main",
      isBranchResumeBlocked: false,
      isThreadContextMisaligned: true,
      isUsingWorktree: false,
      needsBranchResume: true,
      threadBranch: "fix/pre-launch",
    };

    const liveState: RepoThreadUiState = {
      branchResumeReason: null,
      branchResumeStatus: "matched",
      displayBranch: "fix/pre-launch",
      isBranchResumeBlocked: false,
      isThreadContextMisaligned: false,
      isUsingWorktree: false,
      needsBranchResume: false,
      threadBranch: "fix/pre-launch",
    };

    expect(
      resolveStableRepoThreadUiState({
        isPending: true,
        liveState,
        previousStableState,
      }),
    ).toEqual(previousStableState);
  });
});
