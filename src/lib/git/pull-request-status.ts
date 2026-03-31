export type RepoIntegrationStatus =
  | "connected"
  | "local_only"
  | "needs_github"
  | "unsupported_remote";

export type RepoPullRequestReviewDecision =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;

export type RepoPullRequestCheckState =
  | "failure"
  | "pending"
  | "success"
  | "unknown";

export type RepoPullRequestMergeStatus =
  | "awaiting_review"
  | "blocked"
  | "changes_requested"
  | "checks_failed"
  | "checks_pending"
  | "closed"
  | "conflicts"
  | "draft"
  | "merged"
  | "ready"
  | "unknown";

export type RepoPullRequestChecks = {
  failingCount: number;
  passingCount: number;
  pendingCount: number;
  state: RepoPullRequestCheckState;
  totalCount: number;
};

export type RepoPullRequestStatus = {
  additions: number | null;
  baseBranch: string | null;
  branch: string;
  changedFiles: number | null;
  checks: RepoPullRequestChecks | null;
  comments: number | null;
  createdAt: string | null;
  deletions: number | null;
  mergeStatus: RepoPullRequestMergeStatus;
  number: number;
  provider: "github";
  reviewDecision: RepoPullRequestReviewDecision;
  state: "closed" | "draft" | "merged" | "open";
  title: string;
  updatedAt: string | null;
  url: string;
};

export function getRepoPullRequestMergeLabel(
  status: RepoPullRequestMergeStatus,
) {
  switch (status) {
    case "awaiting_review":
      return "Awaiting review";
    case "blocked":
      return "Blocked";
    case "changes_requested":
      return "Changes requested";
    case "checks_failed":
      return "Checks failing";
    case "checks_pending":
      return "Checks pending";
    case "closed":
      return "Closed";
    case "conflicts":
      return "Merge conflicts";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "ready":
      return "Ready to merge";
    default:
      return "PR active";
  }
}

export function summarizeWorkspaceRepoStatus(input: {
  aheadCount: number;
  branch: string | null;
  githubRemote: { owner: string; repo: string } | null;
  hasChanges: boolean;
  integrationStatus: RepoIntegrationStatus;
  pullRequestStatus: RepoPullRequestStatus | null;
}) {
  if (input.pullRequestStatus) {
    return `PR #${input.pullRequestStatus.number} · ${getRepoPullRequestMergeLabel(input.pullRequestStatus.mergeStatus)}`;
  }

  if (!input.githubRemote) {
    if (input.branch) {
      return `Branch · ${input.branch}`;
    }
    return "Local git repo";
  }

  if (input.integrationStatus === "needs_github") {
    return "Connect GitHub for live PR status";
  }

  if (input.aheadCount > 0) {
    return `No PR · ${input.aheadCount} commit${input.aheadCount === 1 ? "" : "s"} ahead`;
  }

  if (input.hasChanges) {
    return "No PR · Uncommitted changes";
  }

  if (input.branch) {
    return `No PR · ${input.branch}`;
  }

  return `Repo · ${input.githubRemote.owner}/${input.githubRemote.repo}`;
}
