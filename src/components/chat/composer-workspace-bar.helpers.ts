import type { DraftProjectMode } from "./draft-thread-project-mode";

type ComposerWorkspaceBarRepoContext = {
  branch?: string | null;
  threadProjectMode?: DraftProjectMode | null;
  threadBranch?: string | null;
  worktreeStatus?: "creating" | "error" | "missing" | "none" | "ready" | null;
};

export type ComposerWorkspaceBarDisplayState = {
  displayBranch: string | null;
  hasReadyWorktree: boolean;
  isUsingWorktree: boolean;
  projectMode: DraftProjectMode;
  projectModeLabel: "Local" | "Worktree";
  threadBranch: string | null;
  worktreeStatus: "creating" | "error" | "missing" | "none" | "ready" | null;
};

function resolvePreparedDraftWorktreeState(input: {
  draftPreparedWorktree?: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode?: DraftProjectMode;
  repoContext?: ComposerWorkspaceBarRepoContext | null;
}): ComposerWorkspaceBarDisplayState {
  const threadBranch = input.draftPreparedWorktree?.branch ?? null;

  return {
    displayBranch: threadBranch,
    hasReadyWorktree: true,
    isUsingWorktree: true,
    projectMode: "worktree",
    projectModeLabel: "Worktree",
    threadBranch,
    worktreeStatus:
      input.repoContext?.worktreeStatus === "creating" ? "creating" : "ready",
  };
}

export function resolveComposerWorkspaceBarLiveState(input: {
  draftPreparedWorktree?: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode?: DraftProjectMode;
  repoContext?: ComposerWorkspaceBarRepoContext | null;
  repoThreadId?: string | null;
}): ComposerWorkspaceBarDisplayState {
  const hasPreparedDraftWorktree =
    input.draftProjectMode === "worktree" &&
    Boolean(input.draftPreparedWorktree);

  if (input.repoThreadId) {
    if (
      hasPreparedDraftWorktree &&
      input.repoContext?.threadProjectMode !== "worktree"
    ) {
      return resolvePreparedDraftWorktreeState(input);
    }

    const projectMode =
      input.repoContext?.threadProjectMode === "worktree"
        ? "worktree"
        : "local";
    const threadBranch =
      input.repoContext?.threadBranch ?? input.repoContext?.branch ?? null;
    const displayBranch =
      projectMode === "worktree"
        ? (threadBranch ?? input.repoContext?.branch ?? null)
        : (input.repoContext?.branch ?? threadBranch ?? null);
    const worktreeStatus = input.repoContext?.worktreeStatus ?? null;

    return {
      displayBranch,
      hasReadyWorktree: worktreeStatus === "ready",
      isUsingWorktree: projectMode === "worktree",
      projectMode,
      projectModeLabel: projectMode === "worktree" ? "Worktree" : "Local",
      threadBranch,
      worktreeStatus,
    };
  }

  const projectMode = hasPreparedDraftWorktree ? "worktree" : "local";
  const threadBranch = input.draftPreparedWorktree?.branch ?? null;

  if (hasPreparedDraftWorktree) {
    return resolvePreparedDraftWorktreeState(input);
  }

  return {
    displayBranch:
      projectMode === "worktree"
        ? threadBranch
        : (input.repoContext?.branch ?? null),
    hasReadyWorktree: hasPreparedDraftWorktree,
    isUsingWorktree: projectMode === "worktree",
    projectMode,
    projectModeLabel: projectMode === "worktree" ? "Worktree" : "Local",
    threadBranch,
    worktreeStatus: hasPreparedDraftWorktree ? "ready" : null,
  };
}

export function resolveComposerWorkspaceBarDisplayState(input: {
  isRepoStatePending: boolean;
  liveState: ComposerWorkspaceBarDisplayState;
  previousStableState?: ComposerWorkspaceBarDisplayState | null;
}) {
  if (input.isRepoStatePending && input.previousStableState) {
    return input.previousStableState;
  }

  return input.liveState;
}
