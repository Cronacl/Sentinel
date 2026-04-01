import { cn } from "@heroui/react";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RepoLastPullRequest } from "@/lib/ai/chat/engines/types";

export function threadPullRequestToneClass(
  pullRequest: RepoLastPullRequest | null | undefined,
) {
  if (!pullRequest || pullRequest.kind === "compare") {
    return "text-foreground/50";
  }

  if (pullRequest.draft) {
    return "text-foreground/62";
  }

  switch (pullRequest.state.toLowerCase()) {
    case "merged":
      return "text-foreground/62";
    case "closed":
      return "text-foreground/58";
    default:
      return "text-foreground/62";
  }
}

export function formatThreadPullRequestLabel(
  pullRequest: RepoLastPullRequest | null | undefined,
) {
  if (!pullRequest || pullRequest.kind === "compare") {
    return null;
  }

  if (pullRequest.draft) {
    return `PR #${pullRequest.number} Draft`;
  }

  if (pullRequest.state.toLowerCase() === "merged") {
    return `PR #${pullRequest.number} Merged`;
  }

  if (pullRequest.state.toLowerCase() === "closed") {
    return `PR #${pullRequest.number} Closed`;
  }

  return `PR #${pullRequest.number} Open`;
}

export function threadPullRequestIconClass(
  pullRequest: RepoLastPullRequest | null | undefined,
) {
  if (!pullRequest || pullRequest.kind === "compare") {
    return "text-foreground/35";
  }

  if (pullRequest.draft) {
    return "text-warning drop-shadow-[0_0_6px_rgba(245,158,11,0.28)]";
  }

  switch (pullRequest.state.toLowerCase()) {
    case "merged":
      return "text-success drop-shadow-[0_0_6px_rgba(34,197,94,0.28)]";
    case "closed":
      return "text-danger drop-shadow-[0_0_6px_rgba(239,68,68,0.24)]";
    default:
      return "text-green-500";
  }
}

export function getPullRequestMemoKey(
  pullRequest: RepoLastPullRequest | null | undefined,
) {
  if (!pullRequest) {
    return "none";
  }

  if (pullRequest.kind === "compare") {
    return `compare:${pullRequest.base}:${pullRequest.head}:${pullRequest.repoFullName}`;
  }

  return `pr:${pullRequest.number}:${pullRequest.state}:${pullRequest.draft ? "draft" : "ready"}`;
}

export function ThreadPullRequestMeta({
  pullRequest,
}: {
  pullRequest: RepoLastPullRequest | null | undefined;
}) {
  const label = formatThreadPullRequestLabel(pullRequest);

  if (!label) {
    return null;
  }

  return (
    <span
      className={`flex items-center gap-1 text-[11px] ${threadPullRequestToneClass(pullRequest)}`}
    >
      <HugeiconsIcon
        className={cn("shrink-0", threadPullRequestIconClass(pullRequest))}
        icon={GitPullRequestIcon}
        size={10}
        strokeWidth={1.5}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
