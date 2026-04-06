import type { RepoLastPullRequest } from "@/lib/ai/chat/engines/types";
import type { RepoDiffMode } from "@/lib/git/repo";
import type { RepoPullRequestStatus } from "@/lib/git/pull-request-status";

type RepoDiffPreloadContext = {
  branch?: string | null;
  changedFileCount?: number;
  deletions?: number;
  effectiveProjectPath?: string | null;
  effectiveRootPath?: string | null;
  hasChanges?: boolean;
  insertions?: number;
  isGitRepo?: boolean;
  repoRoot?: string | null;
  threadBranch?: string | null;
  threadProjectMode?: string | null;
  worktreeStatus?: string | null;
};

type RepoDiffPreloadCandidateInput = {
  groups?: Array<{
    threads: Array<{ id: string }>;
    workspace: { id: string };
  }>;
  items?: Array<{
    id: string;
    workspace: { id: string };
  }>;
  maxCandidates?: number;
  selectedThreadId?: string | null;
};

export const REPO_DIFF_PRELOAD_MODES: RepoDiffMode[] = [
  "unstaged",
  "staged",
  "branch",
];

function extractErrorMessagesFromPayload(payload: unknown): string[] {
  if (typeof payload === "string") {
    return payload.trim() ? [payload.trim()] : [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => extractErrorMessagesFromPayload(entry));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const directMessage =
    typeof record.message === "string" ? record.message.trim() : "";
  const nestedMessages = extractErrorMessagesFromPayload(record.errors);

  return [directMessage, ...nestedMessages].filter(Boolean);
}

export function buildGenerateCommitMessageInput(input: {
  includeUnstaged: boolean;
  threadId: string;
  workspaceId: string;
}) {
  return {
    includeUnstaged: input.includeUnstaged,
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  };
}

export function buildRepoDiffPreloadKey(
  input: RepoDiffPreloadContext | null | undefined,
) {
  if (!input?.isGitRepo) {
    return null;
  }

  const projectPath =
    input.effectiveProjectPath ?? input.effectiveRootPath ?? input.repoRoot;
  if (!projectPath) {
    return null;
  }

  return JSON.stringify({
    branch: input.branch ?? null,
    changedFileCount: input.changedFileCount ?? 0,
    deletions: input.deletions ?? 0,
    hasChanges: input.hasChanges ?? false,
    insertions: input.insertions ?? 0,
    projectPath,
    threadBranch: input.threadBranch ?? null,
    threadProjectMode: input.threadProjectMode ?? null,
    worktreeStatus: input.worktreeStatus ?? null,
  });
}

export function collectRepoDiffPreloadCandidates({
  groups = [],
  items = [],
  maxCandidates = 4,
  selectedThreadId = null,
}: RepoDiffPreloadCandidateInput) {
  const candidates: Array<{ threadId: string; workspaceId: string }> = [];
  const seenThreads = new Set<string>();
  const seenWorkspaces = new Set<string>();

  const addCandidate = (
    threadId: string | null | undefined,
    workspaceId: string | null | undefined,
    prioritize = false,
  ) => {
    if (!threadId || !workspaceId) {
      return;
    }

    if (seenThreads.has(threadId) || seenWorkspaces.has(workspaceId)) {
      return;
    }

    const candidate = { threadId, workspaceId };
    if (prioritize) {
      candidates.unshift(candidate);
    } else {
      candidates.push(candidate);
    }
    seenThreads.add(threadId);
    seenWorkspaces.add(workspaceId);
  };

  if (selectedThreadId) {
    for (const group of groups) {
      const selectedThread = group.threads.find(
        (thread) => thread.id === selectedThreadId,
      );
      if (selectedThread) {
        addCandidate(selectedThread.id, group.workspace.id, true);
        break;
      }
    }

    if (candidates.length === 0) {
      const selectedItem = items.find((item) => item.id === selectedThreadId);
      if (selectedItem) {
        addCandidate(selectedItem.id, selectedItem.workspace.id, true);
      }
    }
  }

  for (const group of groups) {
    addCandidate(group.threads[0]?.id, group.workspace.id);
    if (candidates.length >= maxCandidates) {
      return candidates;
    }
  }

  for (const item of items) {
    addCandidate(item.id, item.workspace.id);
    if (candidates.length >= maxCandidates) {
      break;
    }
  }

  return candidates;
}

export function buildCreatePullRequestInput(input: {
  branchName?: string;
  draft?: boolean;
  includeUnstaged?: boolean;
  message?: string;
  threadId: string;
  workspaceId: string;
}) {
  return {
    ...(input.branchName?.trim()
      ? { branchName: input.branchName.trim() }
      : {}),
    ...(input.draft ? { draft: true } : {}),
    ...(input.includeUnstaged === undefined
      ? {}
      : { includeUnstaged: input.includeUnstaged }),
    ...(input.message?.trim() ? { message: input.message.trim() } : {}),
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  };
}

export function getGeneratedCommitPromptValue(input: { message: string }) {
  return input.message;
}

export function formatRepoActionErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return trimmed;
  }

  const withoutDocsUrl = trimmed.replace(
    /\s+-\s+https:\/\/docs\.github\.com\/\S+$/u,
    "",
  );
  const jsonStart = withoutDocsUrl.search(/[\[{]/u);
  if (jsonStart === -1) {
    return withoutDocsUrl;
  }

  const payloadText = withoutDocsUrl.slice(jsonStart).trim();
  const prefix = withoutDocsUrl
    .slice(0, jsonStart)
    .trim()
    .replace(/[:\s-]+$/u, "");

  try {
    const payload = JSON.parse(payloadText) as unknown;
    const messages = extractErrorMessagesFromPayload(payload);
    if (messages.length === 0) {
      return prefix || withoutDocsUrl;
    }
    if (prefix.toLowerCase() === "validation failed") {
      return messages.join(" ");
    }
    return [prefix, ...messages].filter(Boolean).join(": ");
  } catch {
    return withoutDocsUrl;
  }
}

export function getActivePullRequestUrl(input: {
  branch: string | null | undefined;
  lastPullRequest: RepoLastPullRequest | null | undefined;
  pullRequestStatus?: RepoPullRequestStatus | null | undefined;
}) {
  if (
    input.branch &&
    input.pullRequestStatus &&
    input.pullRequestStatus.branch === input.branch &&
    (input.pullRequestStatus.state === "open" ||
      input.pullRequestStatus.state === "draft")
  ) {
    return input.pullRequestStatus.url;
  }

  if (!input.branch || !input.lastPullRequest) {
    return null;
  }

  if (input.lastPullRequest.head !== input.branch) {
    return null;
  }

  if (
    input.lastPullRequest.kind === "github" &&
    input.lastPullRequest.state.toLowerCase() !== "open"
  ) {
    return null;
  }

  return input.lastPullRequest.url;
}

export function getThreadLinkedPullRequest(input: {
  branch: string | null | undefined;
  lastPullRequest: RepoLastPullRequest | null | undefined;
}) {
  if (!input.branch || !input.lastPullRequest) {
    return null;
  }

  if (input.lastPullRequest.head !== input.branch) {
    return null;
  }

  if (
    input.lastPullRequest.kind === "github" &&
    input.lastPullRequest.state.toLowerCase() !== "open"
  ) {
    return null;
  }

  return input.lastPullRequest;
}

export function getLinkedPullRequestStatus(input: {
  branch: string | null | undefined;
  lastPullRequest: RepoLastPullRequest | null | undefined;
  pullRequestStatus?: RepoPullRequestStatus | null | undefined;
}) {
  const linkedPullRequest = getThreadLinkedPullRequest(input);
  if (!linkedPullRequest || linkedPullRequest.kind !== "github") {
    return null;
  }

  if (
    !input.pullRequestStatus ||
    input.pullRequestStatus.branch !== input.branch
  ) {
    return null;
  }

  if (
    input.pullRequestStatus.number !== linkedPullRequest.number ||
    (input.pullRequestStatus.state !== "open" &&
      input.pullRequestStatus.state !== "draft")
  ) {
    return null;
  }

  return input.pullRequestStatus;
}
