import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  buildGitHubRemoteUrls,
  buildFallbackCommitMessage,
  checkoutBranch,
  commitAllChanges,
  createAndCheckoutBranch,
  ensureThreadWorktree,
  getCommitMessageContext,
  getRepoDiffPanelData,
  getHeadCommitMessage,
  initializeRepository,
  listBranches,
  pushCurrentBranch,
  removeThreadWorktree,
  revertFiles,
  resolveRepoContext,
  stashChanges,
  stageFiles,
  unstageFiles,
} from "@/lib/git/repo";
import {
  generateGitCommitMessage,
  type GeneratedCommitMessage,
  parseCommitMessage,
} from "@/lib/git/commit-message";
import {
  getRepoThreadState,
  parseThreadChatEngineState,
  type RepoLastPullRequest,
  type RepoThreadState,
} from "@/lib/ai/chat/engines/types";
import type {
  RepoIntegrationStatus,
  RepoPullRequestStatus,
} from "@/lib/git/pull-request-status";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  resetThreadRepoCheckpoint,
  toggleThreadRepoCheckpoint,
} from "@/lib/ai/chat/repo-checkpoints";
import { updateThreadRepoState } from "@/lib/ai/chat/persistence";
import { GitHubService } from "@/lib/integrations/providers/github/service";
import { getValidAccessToken } from "@/lib/integrations/oauth/token-manager";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { integrations, users } from "@/server/db/schema";

import {
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
} from "./workspace-thread-helpers";

const workspaceInputSchema = z.object({
  workspaceId: z.string().min(1),
});
const workspaceOptionalThreadInputSchema = workspaceInputSchema.extend({
  threadId: z.string().min(1).optional(),
});
const workspaceStatusesInputSchema = z.object({
  workspaceIds: z.array(z.string().min(1)).min(1).max(100),
});
const workspaceThreadInputSchema = workspaceInputSchema.extend({
  threadId: z.string().min(1),
});
const repoDiffModeSchema = z.enum(["branch", "staged", "unstaged"]);
const repoDiffFilesInputSchema = workspaceThreadInputSchema.extend({
  paths: z.array(z.string().trim().min(1)).min(1).max(200),
});
const repoDiffMutationInputSchema = repoDiffFilesInputSchema.extend({
  mode: repoDiffModeSchema,
});
const repoCheckpointToggleInputSchema = workspaceThreadInputSchema.extend({
  checkpointId: z.string().min(1),
});
const repoCheckpointResetInputSchema = workspaceThreadInputSchema.extend({
  checkpointId: z.string().min(1),
  userMessageId: z.string().min(1),
});
const openTargetPreferenceSchema = z.object({
  targetId: z.string().trim().min(1).max(255),
});
const threadEnvironmentInputSchema = workspaceThreadInputSchema;
const threadSwitchInspectInputSchema = workspaceInputSchema.extend({
  sourceThreadId: z.string().min(1),
  targetThreadId: z.string().min(1),
});
const threadSwitchStrategySchema = z.enum(["migrate", "stash"]);
const threadSwitchHandoffInputSchema = threadSwitchInspectInputSchema.extend({
  stashName: z.string().trim().min(1).max(255).optional(),
  strategy: threadSwitchStrategySchema.optional(),
});

type RepoBranchResumeStatus =
  | "blocked_dirty"
  | "matched"
  | "missing_branch"
  | "needs_checkout";
type RepoWorktreeStatus = "creating" | "error" | "missing" | "none" | "ready";

const PULL_REQUEST_STATUS_TTL_MS = 15_000;
const pullRequestStatusCache = new Map<
  string,
  {
    expiresAt: number;
    pullRequestIntegrationStatus: RepoIntegrationStatus;
    pullRequestStatus: RepoPullRequestStatus | null;
  }
>();

async function generateWorkspaceCommitMessage({
  includeUnstaged,
  rootPath,
  thread,
  user,
}: {
  includeUnstaged?: boolean;
  rootPath: string;
  thread: {
    chatEngine: "claude" | "codex" | "sentinel";
    chatModelId: string | null;
    chatReasoningEffort: string | null;
  };
  user: {
    defaultChatModelId?: string | null;
    id: string;
  };
}): Promise<GeneratedCommitMessage> {
  const commitContext = await getCommitMessageContext(rootPath, {
    includeUnstaged,
  });
  const fallbackMessage = buildFallbackCommitMessage(commitContext.changes);

  try {
    return await generateGitCommitMessage({
      context: commitContext,
      defaultChatModelId: user.defaultChatModelId,
      engine: thread.chatEngine,
      modelId: thread.chatModelId,
      reasoningEffort:
        (thread.chatReasoningEffort as ReasoningEffort | null | undefined) ??
        null,
      userId: user.id,
    });
  } catch {
    return {
      body: "",
      message: fallbackMessage,
      subject: fallbackMessage,
    };
  }
}

function assertWorkspaceRootPath(rootPath: string | null) {
  if (!rootPath?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This workspace does not have a root path.",
    });
  }

  return rootPath;
}

async function getOwnedThreadForWorkspace(
  ctx: Parameters<typeof getOwnedThreadOrThrow>[0],
  input: {
    threadId?: string;
    workspaceId: string;
  },
) {
  if (!input.threadId) {
    return null;
  }

  const thread = await getOwnedThreadOrThrow(ctx, input.threadId);
  if (thread.workspaceId !== input.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Thread does not belong to this workspace.",
    });
  }

  return thread;
}

function normalizeThreadRepoState(
  thread: { chatEngineState?: unknown } | null,
): RepoThreadState {
  const state = getRepoThreadState(thread?.chatEngineState);
  return {
    activeBranch: state?.activeBranch ?? state?.lastPullRequest?.head ?? null,
    checkpointAnchorMessageId: state?.checkpointAnchorMessageId ?? null,
    checkpointCursorId: state?.checkpointCursorId ?? null,
    checkpointLatestId: state?.checkpointLatestId ?? null,
    checkpointProjectPath: state?.checkpointProjectPath ?? null,
    lastPullRequest: state?.lastPullRequest ?? null,
    projectMode: state?.projectMode ?? "local",
    worktreePath: state?.worktreePath ?? null,
  };
}

function arePullRequestsEquivalent(
  left: RepoLastPullRequest | null,
  right: RepoLastPullRequest | null,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.kind !== right.kind ||
    left.url !== right.url ||
    left.head !== right.head ||
    left.base !== right.base ||
    left.repoFullName !== right.repoFullName
  ) {
    return false;
  }

  if (left.kind === "compare" || right.kind === "compare") {
    return left.kind === right.kind;
  }

  return (
    left.number === right.number &&
    left.state === right.state &&
    left.title === right.title &&
    left.draft === right.draft &&
    left.updatedAt === right.updatedAt
  );
}

function areRepoThreadStatesEquivalent(
  left: RepoThreadState,
  right: RepoThreadState,
) {
  return (
    left.activeBranch === right.activeBranch &&
    left.checkpointAnchorMessageId === right.checkpointAnchorMessageId &&
    left.checkpointCursorId === right.checkpointCursorId &&
    left.checkpointLatestId === right.checkpointLatestId &&
    left.checkpointProjectPath === right.checkpointProjectPath &&
    left.projectMode === right.projectMode &&
    left.worktreePath === right.worktreePath &&
    arePullRequestsEquivalent(
      left.lastPullRequest ?? null,
      right.lastPullRequest ?? null,
    )
  );
}

function buildThreadGithubRemote(
  githubRemote: NonNullable<
    Awaited<ReturnType<typeof resolveRepoContext>>["githubRemote"]
  >,
  branch: string | null,
) {
  const urls = buildGitHubRemoteUrls(
    githubRemote.owner,
    githubRemote.repo,
    branch,
    githubRemote.defaultBranch,
  );

  return {
    ...githubRemote,
    pullRequestUrl: urls.pullRequestUrl,
    pullRequestsUrl: urls.pullRequestsUrl,
    repositoryUrl: urls.repositoryUrl,
  };
}

function withUpdatedThreadRepoState<
  T extends { chatEngineState?: unknown; id: string } | null,
>(thread: T, patch: Partial<RepoThreadState>): T {
  if (!thread) {
    return thread;
  }

  const parsed = parseThreadChatEngineState(thread.chatEngineState) ?? {};
  const repoState = {
    ...normalizeThreadRepoState(thread),
    ...patch,
  } satisfies RepoThreadState;

  return {
    ...thread,
    chatEngineState: {
      ...parsed,
      repo: repoState,
    },
  };
}

async function buildRepoContextResponse(input: {
  githubService: GitHubService | null;
  pathValue: string | null;
  preferredOpenTargetId: string | null;
  thread?: { chatEngineState?: unknown; id: string } | null;
  lastPullRequest?: RepoLastPullRequest | null;
  pullRequestIntegrationStatus?: RepoIntegrationStatus;
  pullRequestStatus?: RepoPullRequestStatus | null;
  userId: string;
  workspaceId: string;
}) {
  const baseRepoContext = await resolveRepoContext(input.pathValue);
  const currentThreadState = normalizeThreadRepoState(input.thread ?? null);
  const nextThreadState: RepoThreadState = {
    ...currentThreadState,
    ...(input.lastPullRequest === undefined
      ? {}
      : { lastPullRequest: input.lastPullRequest }),
  };

  if (!nextThreadState.activeBranch && baseRepoContext.branch) {
    nextThreadState.activeBranch = baseRepoContext.branch;
  }

  let effectiveRepoContext = baseRepoContext;
  let worktreeStatus: RepoWorktreeStatus = nextThreadState.worktreePath
    ? "missing"
    : "none";

  if (nextThreadState.worktreePath) {
    const worktreeRepoContext = await resolveRepoContext(
      nextThreadState.worktreePath,
    ).catch(() => null);
    if (worktreeRepoContext?.isGitRepo) {
      worktreeStatus = "ready";
      if (nextThreadState.projectMode === "worktree") {
        effectiveRepoContext = worktreeRepoContext;
        nextThreadState.activeBranch =
          worktreeRepoContext.branch ?? nextThreadState.activeBranch;
      }
    }
  }

  const threadBranch = nextThreadState.activeBranch;
  const branchResumeStatus: RepoBranchResumeStatus =
    nextThreadState.projectMode === "worktree" && worktreeStatus === "ready"
      ? "matched"
      : !threadBranch
        ? "missing_branch"
        : baseRepoContext.branch === threadBranch
          ? "matched"
          : baseRepoContext.hasChanges
            ? "blocked_dirty"
            : "needs_checkout";
  const branchResumeReason =
    branchResumeStatus === "blocked_dirty"
      ? "Switching branches is blocked because the local project has uncommitted changes."
      : branchResumeStatus === "missing_branch"
        ? "No branch is currently linked to this thread."
        : branchResumeStatus === "needs_checkout" && threadBranch
          ? `This thread is linked to ${threadBranch}, but the local project is on ${baseRepoContext.branch ?? "another branch"}.`
          : null;

  const resolvedGitHubRemote =
    effectiveRepoContext.githubRemote ?? baseRepoContext.githubRemote;
  const pullRequestBranch =
    threadBranch ?? effectiveRepoContext.branch ?? baseRepoContext.branch;
  const livePullRequestState = await resolvePullRequestStatus({
    githubService: input.githubService,
    repoContext:
      pullRequestBranch && resolvedGitHubRemote
        ? {
            ...effectiveRepoContext,
            branch: pullRequestBranch,
            githubRemote: resolvedGitHubRemote,
          }
        : effectiveRepoContext,
    userId: input.userId,
  });
  const effectivePullRequestIntegrationStatus =
    input.pullRequestIntegrationStatus ??
    livePullRequestState.pullRequestIntegrationStatus;
  const effectivePullRequestStatus =
    input.pullRequestStatus === undefined
      ? livePullRequestState.pullRequestStatus
      : input.pullRequestStatus;

  if (pullRequestBranch && resolvedGitHubRemote?.defaultBranch) {
    nextThreadState.lastPullRequest = effectivePullRequestStatus
      ? buildGitHubPullRequestMetadataFromStatus({
          owner: resolvedGitHubRemote.owner,
          pullRequestStatus: effectivePullRequestStatus,
          repo: resolvedGitHubRemote.repo,
        })
      : buildComparePullRequestMetadata({
          base: resolvedGitHubRemote.defaultBranch,
          branch: pullRequestBranch,
          owner: resolvedGitHubRemote.owner,
          repo: resolvedGitHubRemote.repo,
          url:
            buildThreadGithubRemote(resolvedGitHubRemote, pullRequestBranch)
              .pullRequestUrl ?? resolvedGitHubRemote.pullRequestsUrl,
        });
  }

  if (
    input.thread &&
    !areRepoThreadStatesEquivalent(currentThreadState, nextThreadState)
  ) {
    updateThreadRepoState(input.thread.id, nextThreadState);
  }

  const effectiveProjectPath =
    nextThreadState.projectMode === "worktree" && worktreeStatus === "ready"
      ? nextThreadState.worktreePath
      : (input.pathValue ?? null);
  const effectiveRootPath =
    effectiveRepoContext.repoRoot ??
    nextThreadState.worktreePath ??
    input.pathValue ??
    null;
  const checkpointPathMatches =
    !nextThreadState.checkpointProjectPath ||
    nextThreadState.checkpointProjectPath === effectiveProjectPath;

  const responseGitHubRemote = resolvedGitHubRemote
    ? buildThreadGithubRemote(resolvedGitHubRemote, pullRequestBranch)
    : null;

  return {
    ...effectiveRepoContext,
    branchResumeReason,
    branchResumeStatus,
    checkpointCursorId: nextThreadState.checkpointCursorId ?? null,
    checkpointAnchorMessageId:
      nextThreadState.checkpointAnchorMessageId ?? null,
    checkpointLatestId: nextThreadState.checkpointLatestId ?? null,
    checkpointPathMatches,
    checkpointProjectPath: nextThreadState.checkpointProjectPath ?? null,
    effectiveProjectPath,
    effectiveRootPath,
    githubRemote: responseGitHubRemote,
    lastPullRequest: nextThreadState.lastPullRequest,
    preferredOpenTargetId: input.preferredOpenTargetId,
    pullRequestIntegrationStatus: effectivePullRequestIntegrationStatus,
    pullRequestStatus: effectivePullRequestStatus,
    threadBranch,
    threadProjectMode: nextThreadState.projectMode,
    worktreeStatus,
  };
}

async function resolveGitHubService(
  ctx: Parameters<typeof getOwnedWorkspaceOrThrow>[0],
) {
  const integrationsQuery = ctx.db?.query?.integrations;
  const findIntegration = integrationsQuery?.findFirst?.bind(integrationsQuery);
  if (!findIntegration) {
    return null;
  }

  const integration = await findIntegration({
    where: and(
      eq(integrations.userId, ctx.session.user.id),
      eq(integrations.provider, "github"),
      eq(integrations.isEnabled, true),
    ),
  });

  if (!integration) {
    return null;
  }

  const token = await getValidAccessToken(integration.id).catch(() => null);
  if (!token) {
    return null;
  }

  return new GitHubService(token);
}

async function resolveThreadProjectPath(input: {
  thread?: { chatEngineState?: unknown } | null;
  workspaceRootPath: string;
}) {
  const threadState = normalizeThreadRepoState(input.thread ?? null);
  if (
    threadState.projectMode === "worktree" &&
    threadState.worktreePath &&
    (await resolveRepoContext(threadState.worktreePath)).isGitRepo
  ) {
    return threadState.worktreePath;
  }

  return input.workspaceRootPath;
}

async function inspectThreadSwitchState(input: {
  rootPath: string;
  sourceThread: { chatEngineState?: unknown; id: string };
  targetThread: { chatEngineState?: unknown; id: string };
}) {
  const currentRepoContext = await resolveRepoContext(input.rootPath);
  const sourceProjectPath = await resolveThreadProjectPath({
    thread: input.sourceThread,
    workspaceRootPath: input.rootPath,
  });
  const targetProjectPath = await resolveThreadProjectPath({
    thread: input.targetThread,
    workspaceRootPath: input.rootPath,
  });
  const sourceState = normalizeThreadRepoState(input.sourceThread);
  const targetState = normalizeThreadRepoState(input.targetThread);
  const sourceProjectMode =
    sourceProjectPath === input.rootPath ? "local" : "worktree";
  const targetProjectMode =
    targetProjectPath === input.rootPath ? "local" : "worktree";
  const sourceBranch = sourceState.activeBranch ?? currentRepoContext.branch;
  const targetBranch =
    targetProjectMode === "local"
      ? (targetState.activeBranch ?? currentRepoContext.branch)
      : targetState.activeBranch;
  const requiresBranchSwitch =
    targetProjectMode === "local" &&
    Boolean(targetBranch) &&
    currentRepoContext.branch !== targetBranch;
  const isDirty =
    sourceProjectMode === "local" &&
    targetProjectMode === "local" &&
    currentRepoContext.hasChanges;

  return {
    currentBranch: currentRepoContext.branch,
    isDirty,
    requiresBranchSwitch,
    shouldPrompt: requiresBranchSwitch && isDirty,
    sourceBranch,
    sourceProjectMode,
    sourceThreadId: input.sourceThread.id,
    targetBranch,
    targetProjectMode,
    targetThreadId: input.targetThread.id,
  } as const;
}

function buildThreadSwitchStashMessage(input: {
  sourceBranch: string | null;
  sourceThreadId: string;
  stashName: string;
}) {
  return `thread:${input.sourceThreadId}:${input.sourceBranch ?? "unknown"}:${input.stashName.trim()}`;
}

function extractCheckedOutWorktreePath(message: string) {
  const match = message.match(
    /Branch .+ is already checked out at (.+?)\. Switch this thread /,
  );
  return match?.[1]?.trim() ?? null;
}

async function resolvePullRequestMessage(input: {
  commitMessage: string | null;
  rootPath: string;
}) {
  if (input.commitMessage?.trim()) {
    return input.commitMessage.trim();
  }

  return (await getHeadCommitMessage(input.rootPath)).message;
}

function buildComparePullRequestMetadata(input: {
  base: string | null;
  branch: string | null;
  owner: string;
  repo: string;
  url: string;
}): RepoLastPullRequest {
  return {
    base: input.base ?? "",
    createdAt: new Date().toISOString(),
    draft: false,
    head: input.branch ?? "",
    kind: "compare",
    repoFullName: `${input.owner}/${input.repo}`,
    url: input.url,
  };
}

function buildGitHubPullRequestMetadata(input: {
  base: string;
  draft: boolean;
  head: string;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}): RepoLastPullRequest {
  return {
    base: input.base,
    createdAt: input.createdAt,
    draft: input.draft,
    head: input.head,
    kind: "github",
    number: input.number,
    repoFullName: `${input.owner}/${input.repo}`,
    state: input.state,
    title: input.title,
    updatedAt: input.updatedAt,
    url: input.url,
  };
}

function buildGitHubPullRequestMetadataFromStatus(input: {
  owner: string;
  pullRequestStatus: RepoPullRequestStatus;
  repo: string;
}): RepoLastPullRequest {
  return {
    base: input.pullRequestStatus.baseBranch ?? "",
    createdAt: input.pullRequestStatus.createdAt ?? new Date().toISOString(),
    draft: input.pullRequestStatus.state === "draft",
    head: input.pullRequestStatus.branch,
    kind: "github",
    number: input.pullRequestStatus.number,
    repoFullName: `${input.owner}/${input.repo}`,
    state: input.pullRequestStatus.state,
    title: input.pullRequestStatus.title,
    updatedAt: input.pullRequestStatus.updatedAt ?? new Date().toISOString(),
    url: input.pullRequestStatus.url,
  };
}

function buildPullRequestStatusCacheKey(input: {
  branch: string;
  owner: string;
  repo: string;
  userId: string;
}) {
  return `${input.userId}:${input.owner}/${input.repo}:${input.branch}`;
}

function getCachedPullRequestStatus(input: {
  branch: string;
  owner: string;
  repo: string;
  userId: string;
}) {
  const key = buildPullRequestStatusCacheKey(input);
  const cached = pullRequestStatusCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    pullRequestStatusCache.delete(key);
    return null;
  }

  return cached;
}

function setCachedPullRequestStatus(input: {
  branch: string;
  owner: string;
  pullRequestIntegrationStatus: RepoIntegrationStatus;
  pullRequestStatus: RepoPullRequestStatus | null;
  repo: string;
  userId: string;
}) {
  pullRequestStatusCache.set(buildPullRequestStatusCacheKey(input), {
    expiresAt: Date.now() + PULL_REQUEST_STATUS_TTL_MS,
    pullRequestIntegrationStatus: input.pullRequestIntegrationStatus,
    pullRequestStatus: input.pullRequestStatus,
  });
}

async function resolvePullRequestStatus(input: {
  githubService: GitHubService | null;
  repoContext: Awaited<ReturnType<typeof resolveRepoContext>>;
  userId: string;
}) {
  if (!input.repoContext.isGitRepo) {
    return {
      pullRequestIntegrationStatus: "local_only" as const,
      pullRequestStatus: null,
    };
  }

  if (!input.repoContext.githubRemote) {
    return {
      pullRequestIntegrationStatus: input.repoContext.hasRemotes
        ? ("unsupported_remote" as const)
        : ("local_only" as const),
      pullRequestStatus: null,
    };
  }

  if (!input.repoContext.branch) {
    return {
      pullRequestIntegrationStatus: input.githubService
        ? ("connected" as const)
        : ("needs_github" as const),
      pullRequestStatus: null,
    };
  }

  if (!input.githubService) {
    return {
      pullRequestIntegrationStatus: "needs_github" as const,
      pullRequestStatus: null,
    };
  }

  const { branch, githubRemote } = input.repoContext;
  const cached = getCachedPullRequestStatus({
    branch,
    owner: githubRemote.owner,
    repo: githubRemote.repo,
    userId: input.userId,
  });
  if (cached) {
    return cached;
  }

  const pullRequestStatus = await input.githubService
    .getActivePullRequestStatus({
      branch,
      owner: githubRemote.owner,
      repo: githubRemote.repo,
    })
    .catch(() => null);

  const result = {
    pullRequestIntegrationStatus: "connected" as const,
    pullRequestStatus,
  };

  setCachedPullRequestStatus({
    branch,
    owner: githubRemote.owner,
    pullRequestIntegrationStatus: result.pullRequestIntegrationStatus,
    pullRequestStatus: result.pullRequestStatus,
    repo: githubRemote.repo,
    userId: input.userId,
  });

  return result;
}

async function buildWorkspaceRepoStatus(input: {
  githubService: GitHubService | null;
  pathValue: string | null;
  userId: string;
  workspaceId: string;
}) {
  const repoContext = await resolveRepoContext(input.pathValue);
  const pullRequestState = await resolvePullRequestStatus({
    githubService: input.githubService,
    repoContext,
    userId: input.userId,
  });

  return {
    ...repoContext,
    pullRequestIntegrationStatus: pullRequestState.pullRequestIntegrationStatus,
    pullRequestStatus: pullRequestState.pullRequestStatus,
    workspaceId: input.workspaceId,
  };
}

export const repoRouter = createTRPCRouter({
  getContext: protectedProcedure
    .input(workspaceOptionalThreadInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const githubService = await resolveGitHubService(ctx);
      return await buildRepoContextResponse({
        githubService,
        pathValue: workspace.rootPath,
        preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
        thread,
        userId: ctx.session.user.id,
        workspaceId: workspace.id,
      });
    }),

  listWorkspaceStatuses: protectedProcedure
    .input(workspaceStatusesInputSchema)
    .query(async ({ ctx, input }) => {
      const githubService = await resolveGitHubService(ctx);
      const workspaces = await Promise.all(
        input.workspaceIds.map((workspaceId) =>
          getOwnedWorkspaceOrThrow(ctx, workspaceId),
        ),
      );

      return await Promise.all(
        workspaces.map((workspace) =>
          buildWorkspaceRepoStatus({
            githubService,
            pathValue: workspace.rootPath,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        ),
      );
    }),

  setPreferredOpenTarget: protectedProcedure
    .input(openTargetPreferenceSchema)
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(users)
        .set({
          lastProjectOpenTargetId: input.targetId,
        })
        .where(eq(users.id, ctx.session.user.id))
        .run();

      return {
        targetId: input.targetId,
      };
    }),

  prepareThreadWorktree: protectedProcedure
    .input(workspaceThreadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const repoContext = await resolveRepoContext(rootPath);
      const targetBranch = repoContext.branch;

      if (!targetBranch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This workspace does not have an active branch to create a worktree from.",
        });
      }

      return await ensureThreadWorktree(rootPath, input.threadId, targetBranch);
    }),

  discardPreparedThreadWorktree: protectedProcedure
    .input(workspaceThreadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      return await removeThreadWorktree(rootPath, input.threadId);
    }),

  getDiffPanelData: protectedProcedure
    .input(
      workspaceThreadInputSchema.extend({
        mode: repoDiffModeSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      return {
        diff: await getRepoDiffPanelData(projectPath, input.mode),
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  commit: protectedProcedure
    .input(
      workspaceOptionalThreadInputSchema.extend({
        includeUnstaged: z.boolean().optional(),
        message: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);
      const result = await commitAllChanges(
        projectPath,
        input.message,
        input.includeUnstaged ?? true,
      );

      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  stageFiles: protectedProcedure
    .input(repoDiffMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      await stageFiles(projectPath, input.paths);

      return {
        diff: await getRepoDiffPanelData(projectPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  unstageFiles: protectedProcedure
    .input(repoDiffMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      await unstageFiles(projectPath, input.paths);

      return {
        diff: await getRepoDiffPanelData(projectPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  revertFiles: protectedProcedure
    .input(
      repoDiffFilesInputSchema.extend({
        mode: z.enum(["staged", "unstaged"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      await revertFiles(projectPath, input.paths, input.mode);

      return {
        diff: await getRepoDiffPanelData(projectPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  toggleCheckpoint: protectedProcedure
    .input(repoCheckpointToggleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      const toggleResult = await toggleThreadRepoCheckpoint({
        checkpointId: input.checkpointId,
        projectPath,
        thread,
        threadId: input.threadId,
      });

      const updatedThread = await getOwnedThreadOrThrow(ctx, input.threadId);

      return {
        changed: toggleResult.changed,
        ok: true,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: updatedThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  resetCheckpoint: protectedProcedure
    .input(repoCheckpointResetInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);

      const resetResult = await resetThreadRepoCheckpoint({
        checkpointId: input.checkpointId,
        projectPath,
        thread,
        threadId: input.threadId,
        userMessageId: input.userMessageId,
      });

      const updatedThread = await getOwnedThreadOrThrow(ctx, input.threadId);

      return {
        changed: resetResult.changed,
        ok: true,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: updatedThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  createBranch: protectedProcedure
    .input(
      workspaceOptionalThreadInputSchema.extend({
        branchName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);
      const result = await createAndCheckoutBranch(
        projectPath,
        input.branchName,
      );
      const nextThread = thread
        ? withUpdatedThreadRepoState(thread, {
            activeBranch: result.branch,
          })
        : thread;
      if (thread) {
        updateThreadRepoState(thread.id, {
          activeBranch: result.branch,
        });
      }
      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  listBranches: protectedProcedure
    .input(workspaceOptionalThreadInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      return await listBranches(projectPath);
    }),

  checkoutBranch: protectedProcedure
    .input(
      workspaceOptionalThreadInputSchema.extend({
        branchName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);
      const trimmedBranchName = input.branchName.trim();
      const threadState = normalizeThreadRepoState(thread);
      const rootRepoContext = await resolveRepoContext(rootPath);
      const shouldSwitchWorktreeToLocal =
        threadState.projectMode === "worktree" &&
        Boolean(thread) &&
        rootRepoContext.branch === trimmedBranchName;
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      let result:
        | {
            branch: string;
            reusedExistingWorktree: boolean;
            switchedToLocalProject: boolean;
            worktreePath?: string | null;
          }
        | undefined;

      if (shouldSwitchWorktreeToLocal) {
        result = {
          branch: trimmedBranchName,
          reusedExistingWorktree: false,
          switchedToLocalProject: true,
          worktreePath: null,
        };
      } else {
        try {
          result = {
            ...(await checkoutBranch(projectPath, trimmedBranchName)),
            reusedExistingWorktree: false,
            switchedToLocalProject: false,
          };
        } catch (error) {
          const existingWorktreePath = extractCheckedOutWorktreePath(
            error instanceof Error ? error.message : "",
          );
          const existingWorktreeContext = existingWorktreePath
            ? await resolveRepoContext(existingWorktreePath).catch(() => null)
            : null;

          if (!thread || !existingWorktreeContext?.isGitRepo) {
            throw error;
          }

          result = {
            branch: trimmedBranchName,
            reusedExistingWorktree: existingWorktreePath !== rootPath,
            switchedToLocalProject: existingWorktreePath === rootPath,
            worktreePath:
              existingWorktreePath === rootPath ? null : existingWorktreePath,
          };
        }
      }
      const nextThread = thread
        ? withUpdatedThreadRepoState(thread, {
            activeBranch: result.branch,
            ...(result.switchedToLocalProject
              ? { projectMode: "local" as const }
              : result.reusedExistingWorktree
                ? {
                    projectMode: "worktree" as const,
                    worktreePath: result.worktreePath ?? null,
                  }
                : {}),
          })
        : thread;
      if (thread) {
        updateThreadRepoState(thread.id, {
          activeBranch: result.branch,
          ...(result.switchedToLocalProject
            ? { projectMode: "local" as const }
            : result.reusedExistingWorktree
              ? {
                  projectMode: "worktree" as const,
                  worktreePath: result.worktreePath ?? null,
                }
              : {}),
        });
      }
      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  inspectThreadSwitch: protectedProcedure
    .input(threadSwitchInspectInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const sourceThread = await getOwnedThreadForWorkspace(ctx, {
        threadId: input.sourceThreadId,
        workspaceId: input.workspaceId,
      });
      const targetThread = await getOwnedThreadForWorkspace(ctx, {
        threadId: input.targetThreadId,
        workspaceId: input.workspaceId,
      });
      if (!sourceThread || !targetThread) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both source and target threads are required.",
        });
      }

      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      return await inspectThreadSwitchState({
        rootPath,
        sourceThread,
        targetThread,
      });
    }),

  handoffThreadSwitch: protectedProcedure
    .input(threadSwitchHandoffInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const sourceThread = await getOwnedThreadForWorkspace(ctx, {
        threadId: input.sourceThreadId,
        workspaceId: input.workspaceId,
      });
      const targetThread = await getOwnedThreadForWorkspace(ctx, {
        threadId: input.targetThreadId,
        workspaceId: input.workspaceId,
      });
      if (!sourceThread || !targetThread) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both source and target threads are required.",
        });
      }

      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);
      const inspection = await inspectThreadSwitchState({
        rootPath,
        sourceThread,
        targetThread,
      });

      if (
        !inspection.requiresBranchSwitch ||
        inspection.targetProjectMode !== "local"
      ) {
        return {
          action: "noop" as const,
          branch: inspection.currentBranch,
          repoContext: await buildRepoContextResponse({
            githubService,
            pathValue: rootPath,
            preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
            thread: targetThread,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        };
      }

      if (!inspection.isDirty) {
        await checkoutBranch(rootPath, inspection.targetBranch!);
        const nextThread = withUpdatedThreadRepoState(targetThread, {
          activeBranch: inspection.targetBranch!,
          projectMode: "local",
        });
        updateThreadRepoState(targetThread.id, {
          activeBranch: inspection.targetBranch!,
          projectMode: "local",
        });
        return {
          action: "checkout" as const,
          branch: inspection.targetBranch!,
          repoContext: await buildRepoContextResponse({
            githubService,
            pathValue: rootPath,
            preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
            thread: nextThread,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        };
      }

      if (!input.strategy) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Dirty thread switches require choosing how to hand off the changes.",
        });
      }

      if (input.strategy === "stash") {
        const stashName = input.stashName?.trim();
        if (!stashName) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A stash name is required to stash the current thread changes.",
          });
        }

        await stashChanges(
          rootPath,
          buildThreadSwitchStashMessage({
            sourceBranch: inspection.currentBranch,
            sourceThreadId: sourceThread.id,
            stashName,
          }),
        );
        await checkoutBranch(rootPath, inspection.targetBranch!);
        const nextThread = withUpdatedThreadRepoState(targetThread, {
          activeBranch: inspection.targetBranch!,
          projectMode: "local",
        });
        updateThreadRepoState(targetThread.id, {
          activeBranch: inspection.targetBranch!,
          projectMode: "local",
        });
        return {
          action: "stash" as const,
          branch: inspection.targetBranch!,
          repoContext: await buildRepoContextResponse({
            githubService,
            pathValue: rootPath,
            preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
            thread: nextThread,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        };
      }

      if (!inspection.currentBranch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The current branch could not be determined for this handoff.",
        });
      }

      const nextThread = withUpdatedThreadRepoState(targetThread, {
        activeBranch: inspection.currentBranch,
        projectMode: "local",
      });
      updateThreadRepoState(targetThread.id, {
        activeBranch: inspection.currentBranch,
        projectMode: "local",
      });

      return {
        action: "migrate" as const,
        branch: inspection.currentBranch,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  generateCommitMessage: protectedProcedure
    .input(
      workspaceThreadInputSchema.extend({
        includeUnstaged: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      return await generateWorkspaceCommitMessage({
        includeUnstaged: input.includeUnstaged ?? true,
        rootPath: projectPath,
        thread: {
          chatEngine: thread!.chatEngine,
          chatModelId: thread!.chatModelId,
          chatReasoningEffort: thread!.chatReasoningEffort,
        },
        user: ctx.user,
      });
    }),

  createPullRequest: protectedProcedure
    .input(
      workspaceThreadInputSchema.extend({
        branchName: z.string().trim().min(1).max(255).optional(),
        draft: z.boolean().optional(),
        includeUnstaged: z.boolean().optional(),
        message: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const includeUnstaged = input.includeUnstaged ?? true;

      let repoContext = await resolveRepoContext(projectPath);
      if (!repoContext.isGitRepo || !repoContext.githubRemote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Create PR requires a GitHub-backed git repository.",
        });
      }

      let createdBranch: string | null = null;
      let commitMessage: string | null = null;
      let repoChanged = false;

      if (repoContext.isDefaultBranch) {
        if (!input.branchName?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Create PR from the default branch requires a new branch name.",
          });
        }

        const created = await createAndCheckoutBranch(
          projectPath,
          input.branchName,
        );
        createdBranch = created.branch;
        repoChanged = true;
      }

      if (repoContext.hasChanges) {
        commitMessage =
          input.message?.trim() ||
          (
            await generateWorkspaceCommitMessage({
              includeUnstaged,
              rootPath: projectPath,
              thread: {
                chatEngine: thread!.chatEngine,
                chatModelId: thread!.chatModelId,
                chatReasoningEffort: thread!.chatReasoningEffort,
              },
              user: ctx.user,
            })
          ).message;
        await commitAllChanges(projectPath, commitMessage, includeUnstaged);
        repoChanged = true;
      }

      if (repoChanged) {
        repoContext = await resolveRepoContext(projectPath);
      }

      const shouldPush =
        !repoContext.hasUpstream || (repoContext.aheadCount ?? 0) > 0;
      if (shouldPush) {
        await pushCurrentBranch(projectPath);
        repoChanged = true;
      }

      if (repoChanged) {
        repoContext = await resolveRepoContext(projectPath);
      }

      if (!repoContext.githubRemote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unable to resolve the GitHub repository for this branch.",
        });
      }

      const githubService = await resolveGitHubService(ctx);
      const canCreateGitHubPullRequest = Boolean(
        githubService &&
        repoContext.branch &&
        repoContext.githubRemote.defaultBranch,
      );
      if ((input.draft ?? false) && !canCreateGitHubPullRequest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Connect GitHub to create draft pull requests.",
        });
      }

      let lastPullRequest: RepoLastPullRequest;
      let pullRequestStatus: RepoPullRequestStatus | null = null;
      let pullRequestUrl: string;
      let linkedExistingPullRequest = false;

      if (
        githubService &&
        repoContext.branch &&
        repoContext.githubRemote.defaultBranch
      ) {
        const message = await resolvePullRequestMessage({
          commitMessage: commitMessage ?? input.message?.trim() ?? null,
          rootPath: projectPath,
        });
        const { body, subject } = parseCommitMessage(message);
        try {
          const pullRequest = await githubService.createPr({
            base: repoContext.githubRemote.defaultBranch,
            body: body || undefined,
            draft: input.draft ?? false,
            head: repoContext.branch,
            owner: repoContext.githubRemote.owner,
            repo: repoContext.githubRemote.repo,
            title: subject,
          });
          pullRequestUrl = pullRequest.htmlUrl;
          lastPullRequest = buildGitHubPullRequestMetadata({
            base: pullRequest.base,
            createdAt: pullRequest.createdAt,
            draft: pullRequest.draft,
            head: pullRequest.head,
            number: pullRequest.number,
            owner: repoContext.githubRemote.owner,
            repo: repoContext.githubRemote.repo,
            state: pullRequest.state,
            title: pullRequest.title,
            updatedAt: pullRequest.updatedAt,
            url: pullRequest.htmlUrl,
          });
          pullRequestStatus = {
            additions: pullRequest.additions,
            baseBranch: pullRequest.base,
            branch: pullRequest.head,
            changedFiles: pullRequest.changedFiles,
            checks: null,
            comments: pullRequest.comments,
            createdAt: pullRequest.createdAt,
            deletions: pullRequest.deletions,
            mergeStatus: pullRequest.draft ? "draft" : "unknown",
            number: pullRequest.number,
            provider: "github",
            reviewDecision: null,
            state: pullRequest.draft ? "draft" : "open",
            title: pullRequest.title,
            updatedAt: pullRequest.updatedAt,
            url: pullRequest.htmlUrl,
          };
        } catch (error) {
          const existingPullRequest =
            await githubService.getActivePullRequestStatus({
              branch: repoContext.branch,
              owner: repoContext.githubRemote.owner,
              repo: repoContext.githubRemote.repo,
            });

          if (!existingPullRequest) {
            throw error;
          }

          linkedExistingPullRequest = true;
          pullRequestStatus = existingPullRequest;
          pullRequestUrl = existingPullRequest.url;
          lastPullRequest = buildGitHubPullRequestMetadataFromStatus({
            owner: repoContext.githubRemote.owner,
            pullRequestStatus: existingPullRequest,
            repo: repoContext.githubRemote.repo,
          });
        }

        setCachedPullRequestStatus({
          branch: pullRequestStatus.branch,
          owner: repoContext.githubRemote.owner,
          pullRequestIntegrationStatus: "connected",
          pullRequestStatus,
          repo: repoContext.githubRemote.repo,
          userId: ctx.session.user.id,
        });
      } else {
        pullRequestUrl =
          repoContext.githubRemote.pullRequestUrl ??
          repoContext.githubRemote.pullRequestsUrl;
        lastPullRequest = buildComparePullRequestMetadata({
          base: repoContext.githubRemote.defaultBranch,
          branch: repoContext.branch,
          owner: repoContext.githubRemote.owner,
          repo: repoContext.githubRemote.repo,
          url: pullRequestUrl,
        });
      }

      const nextThread = withUpdatedThreadRepoState(thread, {
        activeBranch: repoContext.branch,
        lastPullRequest,
      });
      updateThreadRepoState(thread!.id, {
        activeBranch: repoContext.branch,
        lastPullRequest,
      });

      return {
        branch: repoContext.branch,
        commitMessage,
        createdBranch,
        linkedExistingPullRequest,
        pullRequestUrl,
        repoContext: await buildRepoContextResponse({
          githubService,
          lastPullRequest,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          pullRequestIntegrationStatus: githubService ? "connected" : undefined,
          pullRequestStatus,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  resumeThreadBranch: protectedProcedure
    .input(threadEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);
      const threadState = normalizeThreadRepoState(thread);
      const currentRepoContext = await resolveRepoContext(rootPath);
      const targetBranch =
        threadState.activeBranch ?? currentRepoContext.branch;

      if (!targetBranch) {
        return {
          ok: false,
          repoContext: await buildRepoContextResponse({
            githubService,
            pathValue: rootPath,
            preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
            thread,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        };
      }

      if (
        currentRepoContext.branch !== targetBranch &&
        currentRepoContext.hasChanges
      ) {
        return {
          ok: false,
          repoContext: await buildRepoContextResponse({
            githubService,
            pathValue: rootPath,
            preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
            thread,
            userId: ctx.session.user.id,
            workspaceId: workspace.id,
          }),
        };
      }

      if (currentRepoContext.branch !== targetBranch) {
        await checkoutBranch(rootPath, targetBranch);
      }

      const nextThread = withUpdatedThreadRepoState(thread, {
        activeBranch: targetBranch,
        projectMode: "local",
      });
      updateThreadRepoState(thread!.id, {
        activeBranch: targetBranch,
        projectMode: "local",
      });

      return {
        branch: targetBranch,
        ok: true,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  enableThreadWorktree: protectedProcedure
    .input(threadEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);
      const currentRepoContext = await resolveRepoContext(rootPath);
      const threadState = normalizeThreadRepoState(thread);
      const targetBranch =
        threadState.activeBranch ?? currentRepoContext.branch;

      if (!targetBranch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This thread does not have a branch to move into a worktree.",
        });
      }

      const result = await ensureThreadWorktree(
        rootPath,
        thread!.id,
        targetBranch,
      );
      const nextThread = withUpdatedThreadRepoState(thread, {
        activeBranch: targetBranch,
        projectMode: "worktree",
        worktreePath: result.path,
      });
      updateThreadRepoState(thread!.id, {
        activeBranch: targetBranch,
        projectMode: "worktree",
        worktreePath: result.path,
      });

      return {
        branch: targetBranch,
        created: result.created,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
        worktreePath: result.path,
      };
    }),

  useLocalProject: protectedProcedure
    .input(threadEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);

      const nextThread = withUpdatedThreadRepoState(thread, {
        projectMode: "local",
      });
      updateThreadRepoState(thread!.id, {
        projectMode: "local",
      });

      return {
        ok: true,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  removeThreadWorktree: protectedProcedure
    .input(threadEnvironmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const githubService = await resolveGitHubService(ctx);

      const removed = await removeThreadWorktree(rootPath, thread!.id);
      const nextThread = withUpdatedThreadRepoState(thread, {
        projectMode: "local",
        worktreePath: null,
      });
      updateThreadRepoState(thread!.id, {
        projectMode: "local",
        worktreePath: null,
      });

      return {
        ok: true,
        removed: removed.removed,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread: nextThread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),

  init: protectedProcedure
    .input(workspaceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await initializeRepository(
        assertWorkspaceRootPath(workspace.rootPath),
      );
    }),

  push: protectedProcedure
    .input(workspaceOptionalThreadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);
      const projectPath = await resolveThreadProjectPath({
        thread,
        workspaceRootPath: rootPath,
      });
      const githubService = await resolveGitHubService(ctx);
      const result = await pushCurrentBranch(projectPath);
      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          githubService,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
          userId: ctx.session.user.id,
          workspaceId: workspace.id,
        }),
      };
    }),
});
