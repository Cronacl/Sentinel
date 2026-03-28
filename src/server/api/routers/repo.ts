import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  buildFallbackCommitMessage,
  checkoutBranch,
  commitAllChanges,
  createAndCheckoutBranch,
  getCommitMessageContext,
  getRepoDiffPanelData,
  getHeadCommitMessage,
  initializeRepository,
  listBranches,
  pushCurrentBranch,
  revertFiles,
  resolveRepoContext,
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
  type RepoLastPullRequest,
} from "@/lib/ai/chat/engines/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
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
const openTargetPreferenceSchema = z.object({
  targetId: z.string().trim().min(1).max(255),
});

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

function getLastPullRequest(thread: { chatEngineState?: unknown } | null) {
  return getRepoThreadState(thread?.chatEngineState)?.lastPullRequest ?? null;
}

async function buildRepoContextResponse(input: {
  pathValue: string | null;
  preferredOpenTargetId: string | null;
  thread?: { chatEngineState?: unknown } | null;
  lastPullRequest?: RepoLastPullRequest | null;
}) {
  const repoContext = await resolveRepoContext(input.pathValue);
  return {
    ...repoContext,
    lastPullRequest:
      input.lastPullRequest === undefined
        ? getLastPullRequest(input.thread ?? null)
        : input.lastPullRequest,
    preferredOpenTargetId: input.preferredOpenTargetId,
  };
}

async function resolveGitHubService(
  ctx: Parameters<typeof getOwnedWorkspaceOrThrow>[0],
) {
  const integration = await ctx.db.query.integrations.findFirst({
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

export const repoRouter = createTRPCRouter({
  getContext: protectedProcedure
    .input(workspaceOptionalThreadInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      return await buildRepoContextResponse({
        pathValue: workspace.rootPath,
        preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
        thread,
      });
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

      return {
        diff: await getRepoDiffPanelData(rootPath, input.mode),
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
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
      const result = await commitAllChanges(
        rootPath,
        input.message,
        input.includeUnstaged ?? true,
      );

      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
        }),
      };
    }),

  stageFiles: protectedProcedure
    .input(repoDiffMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);

      await stageFiles(rootPath, input.paths);

      return {
        diff: await getRepoDiffPanelData(rootPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
        }),
      };
    }),

  unstageFiles: protectedProcedure
    .input(repoDiffMutationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      const thread = await getOwnedThreadForWorkspace(ctx, input);
      const rootPath = assertWorkspaceRootPath(workspace.rootPath);

      await unstageFiles(rootPath, input.paths);

      return {
        diff: await getRepoDiffPanelData(rootPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
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

      await revertFiles(rootPath, input.paths, input.mode);

      return {
        diff: await getRepoDiffPanelData(rootPath, input.mode),
        paths: input.paths,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
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
      const result = await createAndCheckoutBranch(rootPath, input.branchName);
      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
        }),
      };
    }),

  listBranches: protectedProcedure
    .input(workspaceInputSchema)
    .query(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await listBranches(assertWorkspaceRootPath(workspace.rootPath));
    }),

  checkoutBranch: protectedProcedure
    .input(
      workspaceInputSchema.extend({
        branchName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await getOwnedWorkspaceOrThrow(ctx, input.workspaceId);
      return await checkoutBranch(
        assertWorkspaceRootPath(workspace.rootPath),
        input.branchName,
      );
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
      return await generateWorkspaceCommitMessage({
        includeUnstaged: input.includeUnstaged ?? true,
        rootPath,
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
      const includeUnstaged = input.includeUnstaged ?? true;

      let repoContext = await resolveRepoContext(rootPath);
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
          rootPath,
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
              rootPath,
              thread: {
                chatEngine: thread!.chatEngine,
                chatModelId: thread!.chatModelId,
                chatReasoningEffort: thread!.chatReasoningEffort,
              },
              user: ctx.user,
            })
          ).message;
        await commitAllChanges(rootPath, commitMessage, includeUnstaged);
        repoChanged = true;
      }

      if (repoChanged) {
        repoContext = await resolveRepoContext(rootPath);
      }

      const shouldPush =
        !repoContext.hasUpstream || (repoContext.aheadCount ?? 0) > 0;
      if (shouldPush) {
        await pushCurrentBranch(rootPath);
        repoChanged = true;
      }

      if (repoChanged) {
        repoContext = await resolveRepoContext(rootPath);
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
      let pullRequestUrl: string;

      if (
        githubService &&
        repoContext.branch &&
        repoContext.githubRemote.defaultBranch
      ) {
        const message = await resolvePullRequestMessage({
          commitMessage: commitMessage ?? input.message?.trim() ?? null,
          rootPath,
        });
        const { body, subject } = parseCommitMessage(message);
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

      updateThreadRepoState(thread!.id, { lastPullRequest });

      return {
        branch: repoContext.branch,
        commitMessage,
        createdBranch,
        pullRequestUrl,
        repoContext: await buildRepoContextResponse({
          lastPullRequest,
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
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
      const result = await pushCurrentBranch(rootPath);
      return {
        ...result,
        repoContext: await buildRepoContextResponse({
          pathValue: rootPath,
          preferredOpenTargetId: ctx.user.lastProjectOpenTargetId ?? null,
          thread,
        }),
      };
    }),
});
