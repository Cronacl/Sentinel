"use client";

import {
  ArrowReloadHorizontalIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  GithubIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, CloseButton, Spinner } from "@heroui/react";
import { type ReactNode, useCallback, useMemo } from "react";
import { sileo } from "sileo";

import { useRightSidebar } from "@/components/shell/shell-context";
import { getDesktopApi } from "@/lib/desktop/client";
import { getErrorMessage } from "@/lib/errors";
import {
  getRepoPullRequestMergeLabel,
  summarizeWorkspaceRepoStatus,
} from "@/lib/git/pull-request-status";
import { api } from "@/trpc/react";

import { RepoDiffSidebar } from "./repo-diff-sidebar";
import {
  formatRepoActionErrorMessage,
  getActivePullRequestUrl,
} from "./thread-repo-actions.helpers";
import { setRepoDiffSidebarState } from "./repo-diff-sidebar-store";

type RepoPullRequestSidebarProps = {
  threadId?: string | null;
  workspaceId: string;
  workspaceName?: string;
};

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-content1/50 px-3 py-3">
      <p className="text-[11px] text-muted/80">{label}</p>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export function RepoPullRequestSidebar({
  threadId,
  workspaceId,
  workspaceName,
}: RepoPullRequestSidebarProps) {
  const desktop = getDesktopApi();
  const rightSidebar = useRightSidebar();
  const utils = api.useUtils();

  const gitStateInput = useMemo(
    () => ({
      ...(threadId ? { threadId } : {}),
      workspaceId,
    }),
    [threadId, workspaceId],
  );

  const repoContextQuery = api.repo.getThreadGitState.useQuery(gitStateInput, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const createPullRequestMutation = api.repo.createPullRequest.useMutation({
    onError: (error) => {
      sileo.error({
        description: formatRepoActionErrorMessage(
          getErrorMessage(error, "Unable to create PR."),
        ),
        title: "Create PR failed",
      });
    },
    onSuccess: async (result) => {
      utils.repo.getThreadGitState.setData(gitStateInput, result.repoContext);
      await utils.threads.list.invalidate();
      await utils.repo.listThreadGitStates.invalidate();
      if (desktop) {
        await desktop.openExternal(result.pullRequestUrl).catch(() => {});
      }
      sileo.success({
        description: result.linkedExistingPullRequest
          ? result.branch
            ? `Linked the existing PR for ${result.branch}.`
            : "Linked the existing PR for this branch."
          : result.branch
            ? `Created PR from ${result.branch}.`
            : "Created PR.",
        title: result.linkedExistingPullRequest
          ? "Pull request linked"
          : "Pull request ready",
      });
    },
  });

  const repoContext = repoContextQuery.data;
  const threadBranch = repoContext?.threadBranch ?? repoContext?.branch ?? null;
  const activePullRequestUrl = getActivePullRequestUrl({
    branch: threadBranch,
    lastPullRequest: repoContext?.lastPullRequest,
    pullRequestStatus: repoContext?.pullRequestStatus,
  });

  const handleRefresh = useCallback(async () => {
    await utils.repo.getThreadGitState.invalidate(gitStateInput);
    await utils.repo.listThreadGitStates.invalidate();
  }, [
    gitStateInput,
    utils.repo.getThreadGitState,
    utils.repo.listThreadGitStates,
  ]);

  const handleOpenExternal = useCallback(async () => {
    const url =
      activePullRequestUrl ?? repoContext?.githubRemote?.pullRequestUrl ?? null;
    if (!desktop || !url) {
      return;
    }

    try {
      await desktop.openExternal(url);
    } catch (error) {
      sileo.error({
        description: formatRepoActionErrorMessage(
          getErrorMessage(error, "Unable to open PR."),
        ),
        title: "Open PR failed",
      });
    }
  }, [
    activePullRequestUrl,
    desktop,
    repoContext?.githubRemote?.pullRequestUrl,
  ]);

  const handleViewBranchDiff = useCallback(() => {
    if (!threadId) {
      return;
    }

    setRepoDiffSidebarState({
      threadId,
      workspaceId,
    });
    rightSidebar.open(<RepoDiffSidebar key={`${threadId}:${workspaceId}`} />, {
      panelId: "repo-diff",
      size: "wide",
    });
  }, [rightSidebar, threadId, workspaceId]);

  const handleCreatePullRequest = useCallback(() => {
    if (!threadId) {
      return;
    }

    createPullRequestMutation.mutate({
      threadId,
      workspaceId,
    });
  }, [createPullRequestMutation, threadId, workspaceId]);

  const summary = summarizeWorkspaceRepoStatus({
    aheadCount: repoContext?.aheadCount ?? 0,
    branch: threadBranch,
    githubRemote: repoContext?.githubRemote
      ? {
          owner: repoContext.githubRemote.owner,
          repo: repoContext.githubRemote.repo,
        }
      : null,
    hasChanges: repoContext?.hasChanges ?? false,
    integrationStatus:
      repoContext?.pullRequestIntegrationStatus ?? "local_only",
    pullRequestStatus: repoContext?.pullRequestStatus ?? null,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted/80">Pull request</p>
          <h2 className="mt-1 truncate text-sm font-medium text-foreground">
            {repoContext?.pullRequestStatus?.title ?? workspaceName ?? "Repo"}
          </h2>
          <p className="mt-1 text-xs text-muted">{summary}</p>
        </div>
        <CloseButton onPress={() => rightSidebar.close()} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {repoContextQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4 min-w-4" color="current" size="sm" />
            Loading pull request status…
          </div>
        ) : null}

        {repoContext ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard
                label="Branch"
                value={
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon
                      color="currentColor"
                      icon={GitBranchIcon}
                      size={14}
                      strokeWidth={1.5}
                    />
                    {threadBranch ?? "No branch"}
                  </span>
                }
              />
              <InfoCard
                label="PR status"
                value={
                  repoContext.pullRequestStatus
                    ? getRepoPullRequestMergeLabel(
                        repoContext.pullRequestStatus.mergeStatus,
                      )
                    : "No active PR"
                }
              />
              <InfoCard
                label="Checks"
                value={
                  repoContext.pullRequestStatus?.checks
                    ? `${repoContext.pullRequestStatus.checks.passingCount}/${repoContext.pullRequestStatus.checks.totalCount} passing`
                    : "No checks"
                }
              />
              <InfoCard
                label="Review"
                value={
                  repoContext.pullRequestStatus?.reviewDecision
                    ? repoContext.pullRequestStatus.reviewDecision
                        .toLowerCase()
                        .replaceAll("_", " ")
                    : "No review signal"
                }
              />
            </div>

            <div className="rounded-2xl border border-border/60 bg-content1/40 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <HugeiconsIcon
                  color="currentColor"
                  icon={GitPullRequestIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <span>
                  {repoContext.pullRequestStatus
                    ? `PR #${repoContext.pullRequestStatus.number}`
                    : "No PR linked to this branch"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {repoContext.pullRequestStatus
                  ? `This branch is tracking a live GitHub PR. Use the actions below to inspect the branch diff or jump to GitHub for the full review and merge flow.`
                  : repoContext.pullRequestIntegrationStatus === "needs_github"
                    ? "GitHub is not connected for this account yet. You can still open the compare view for this branch."
                    : "This branch does not have an open PR right now."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                className="justify-start"
                onPress={() => void handleRefresh()}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={ArrowReloadHorizontalIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <span>Refresh</span>
              </Button>

              <Button
                className="justify-start"
                isDisabled={
                  !activePullRequestUrl &&
                  !repoContext.githubRemote?.pullRequestUrl
                }
                onPress={() => void handleOpenExternal()}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={GithubIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <span>
                  {activePullRequestUrl ? "Open on GitHub" : "Open compare"}
                </span>
              </Button>

              <Button
                className="justify-start"
                isDisabled={!threadId}
                onPress={handleViewBranchDiff}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={FileDiffIcon}
                  size={16}
                  strokeWidth={1.5}
                />
                <span>View branch diff</span>
              </Button>

              {!repoContext.pullRequestStatus ? (
                <Button
                  className="justify-start"
                  isDisabled={!threadId || createPullRequestMutation.isPending}
                  isPending={createPullRequestMutation.isPending}
                  onPress={handleCreatePullRequest}
                  size="sm"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={GitPullRequestIcon}
                    size={16}
                    strokeWidth={1.5}
                  />
                  <span>Create PR</span>
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
