export type RepoThreadUiContext = {
  branch?: string | null;
  branchResumeReason?: string | null;
  branchResumeStatus?: string | null;
  threadBranch?: string | null;
  threadProjectMode?: string | null;
};

export type RepoThreadUiState = {
  branchResumeReason: string | null;
  branchResumeStatus: string;
  displayBranch: string | null;
  isBranchResumeBlocked: boolean;
  isThreadContextMisaligned: boolean;
  isUsingWorktree: boolean;
  needsBranchResume: boolean;
  threadBranch: string | null;
};

export function resolveRepoThreadUiState(
  input: RepoThreadUiContext | null | undefined,
): RepoThreadUiState {
  const isUsingWorktree = input?.threadProjectMode === "worktree";
  const threadBranch = input?.threadBranch ?? input?.branch ?? null;
  const branchResumeStatus = input?.branchResumeStatus ?? "matched";
  const branchResumeReason = input?.branchResumeReason ?? null;
  const displayBranch = isUsingWorktree
    ? (threadBranch ?? input?.branch ?? null)
    : (input?.branch ?? threadBranch ?? null);
  const isThreadContextMisaligned =
    !isUsingWorktree && branchResumeStatus !== "matched";

  return {
    branchResumeReason,
    branchResumeStatus,
    displayBranch,
    isBranchResumeBlocked:
      !isUsingWorktree && branchResumeStatus === "blocked_dirty",
    isThreadContextMisaligned,
    isUsingWorktree,
    needsBranchResume:
      !isUsingWorktree && branchResumeStatus === "needs_checkout",
    threadBranch,
  };
}

export function resolveStableRepoThreadUiState(input: {
  isPending: boolean;
  liveState: RepoThreadUiState;
  previousStableState?: RepoThreadUiState | null;
}) {
  if (input.isPending && input.previousStableState) {
    return input.previousStableState;
  }

  return input.liveState;
}
