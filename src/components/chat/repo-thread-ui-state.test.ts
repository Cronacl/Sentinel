import { describe, expect, it } from "bun:test";

import {
  resolveKeyedStableState,
  resolveRepoThreadUiState,
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

describe("resolveKeyedStableState", () => {
  it("keeps resume branch visibility from the current thread context during pending refreshes", () => {
    const effectiveContext = resolveKeyedStableState({
      cachedState: null,
      currentKey: "workspace-1:thread-1",
      stableState: {
        key: "workspace-1:thread-1",
        state: {
          branch: "main",
          branchResumeReason:
            "This thread is linked to fix/pre-launch, but the local project is on main.",
          branchResumeStatus: "needs_checkout",
          threadBranch: "fix/pre-launch",
          threadProjectMode: "local",
        },
      },
    });

    expect(resolveRepoThreadUiState(effectiveContext)).toMatchObject({
      displayBranch: "main",
      isThreadContextMisaligned: true,
      needsBranchResume: true,
      threadBranch: "fix/pre-launch",
    });
  });

  it("keeps worktree indicators from the current thread context during pending refreshes", () => {
    const effectiveContext = resolveKeyedStableState({
      cachedState: null,
      currentKey: "workspace-1:thread-1",
      stableState: {
        key: "workspace-1:thread-1",
        state: {
          branch: "thread/atlas-a1b2c3",
          branchResumeStatus: "matched",
          threadBranch: "thread/atlas-a1b2c3",
          threadProjectMode: "worktree",
        },
      },
    });

    expect(resolveRepoThreadUiState(effectiveContext)).toMatchObject({
      displayBranch: "thread/atlas-a1b2c3",
      isThreadContextMisaligned: false,
      isUsingWorktree: true,
      threadBranch: "thread/atlas-a1b2c3",
    });
  });

  it("uses cached context instead of another thread's stable context", () => {
    const effectiveContext = resolveKeyedStableState({
      cachedState: {
        branch: "main",
        branchResumeReason:
          "This thread is linked to feature/current, but the local project is on main.",
        branchResumeStatus: "needs_checkout",
        threadBranch: "feature/current",
        threadProjectMode: "local",
      },
      currentKey: "workspace-1:thread-current",
      stableState: {
        key: "workspace-1:thread-old",
        state: {
          branch: "thread/old",
          branchResumeStatus: "matched",
          threadBranch: "thread/old",
          threadProjectMode: "worktree",
        },
      },
    });

    expect(resolveRepoThreadUiState(effectiveContext)).toMatchObject({
      displayBranch: "main",
      isThreadContextMisaligned: true,
      needsBranchResume: true,
      threadBranch: "feature/current",
    });
  });

  it("falls back to cached context when the current stable context is empty", () => {
    expect(
      resolveKeyedStableState({
        cachedState: {
          branch: "main",
          threadBranch: "feature/current",
          threadProjectMode: "local",
        },
        currentKey: "workspace-1:thread-current",
        stableState: {
          key: "workspace-1:thread-current",
          state: null,
        },
      }),
    ).toEqual({
      branch: "main",
      threadBranch: "feature/current",
      threadProjectMode: "local",
    });
  });
});
