// @ts-nocheck

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const getOwnedWorkspaceOrThrow = mock(async () => ({
  id: "workspace-1",
  rootPath: "/tmp/workspace",
}));
const getOwnedThreadOrThrow = mock(async () => ({
  chatEngine: "codex",
  chatEngineState: null,
  chatModelId: "gpt-5.4",
  chatReasoningEffort: "high",
  id: "thread-1",
  workspaceId: "workspace-1",
}));
const run = mock(() => undefined);
const where = mock(() => ({ run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));
const resolveRepoContext = mock(async () => ({
  aheadCount: 0,
  branch: "feature/test",
  changedFileCount: 0,
  deletions: 0,
  githubRemote: {
    defaultBranch: "main",
    owner: "openai",
    pullRequestUrl:
      "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
    pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
    remoteName: "origin",
    remoteUrl: "git@github.com:openai/sentinel.git",
    repo: "sentinel",
    repositoryUrl: "https://github.com/openai/sentinel",
  },
  hasChanges: false,
  hasCommits: true,
  hasRemotes: true,
  hasUpstream: true,
  insertions: 0,
  isDefaultBranch: false,
  isGitRepo: true,
  pushRemoteName: "origin",
  repoRoot: "/tmp/workspace",
}));
const getCommitMessageContext = mock(async () => ({
  branch: "feature/test",
  changes: [{ path: "file.ts", type: "modified" }],
  patch: "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
  repoRoot: "/tmp/workspace",
  summary: "M file.ts",
}));
const getHeadCommitMessage = mock(async () => ({
  body: "- latest body",
  message: "Latest subject\n\n- latest body",
  subject: "Latest subject",
}));
const getRepoDiffPanelData = mock(async (rootPath, mode: string) => ({
  branch: "feature/test",
  disabledReason: mode === "branch" ? null : null,
  fileCount: 1,
  files: [
    {
      additions: 1,
      deletions: 1,
      firstChangedLine: 42,
      isUntracked: false,
      patch:
        "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -42,1 +42,1 @@\n-old\n+new\n",
      path: "file.ts",
    },
  ],
  mode,
  sourceLabel: mode === "branch" ? "feature/test -> origin/main" : "Staged",
  totalAdditions: 1,
  totalDeletions: 1,
}));
const getRepoDiffPanelBundleData = mock(async (rootPath) => ({
  diffs: {
    branch: await getRepoDiffPanelData(rootPath, "branch"),
    staged: await getRepoDiffPanelData(rootPath, "staged"),
    unstaged: await getRepoDiffPanelData(rootPath, "unstaged"),
  },
}));
const buildFallbackCommitMessage = mock(() => "Update file");
const commitAllChanges = mock(async () => ({
  commit: "1234567",
  summary: "[feature/test 1234567] Update file",
}));
const checkoutBranch = mock(async (_rootPath, branchName) => ({
  branch: branchName,
}));
const createAndCheckoutBranch = mock(async (_rootPath, branchName) => ({
  branch: branchName,
}));
const ensureThreadWorktree = mock(async (_rootPath, threadId, branchName) => ({
  branch: branchName,
  created: true,
  path: `/tmp/.sentinel-worktrees/sentinel/${threadId}`,
}));
const initializeRepository = mock(async () => ({ repoRoot: "/tmp/workspace" }));
const listBranches = mock(async () => ({
  branch: "feature/test",
  branches: [
    { current: true, name: "feature/test" },
    { current: false, name: "main" },
  ],
}));
const pushCurrentBranch = mock(async () => ({ branch: "feature/test" }));
const removeThreadWorktreeAtPath = mock(async (_rootPath, threadId) => ({
  path: `/tmp/.sentinel-worktrees/sentinel/${threadId}`,
  removed: true,
}));
const revertFiles = mock(async () => ({ paths: ["file.ts"] }));
const stashChanges = mock(async (_rootPath, stashName) => ({
  message: stashName,
}));
const stageFiles = mock(async () => ({ paths: ["file.ts"] }));
const unstageFiles = mock(async () => ({ paths: ["file.ts"] }));
const generateGitCommitMessage = mock(async () => ({
  body: "- add tests",
  message: "Add generated message\n\n- add tests",
  subject: "Add generated message",
}));
const findGithubIntegration = mock(async () => null);
const getValidAccessToken = mock(async () => "github-token");
const toggleThreadRepoCheckpoint = mock(async () => ({
  changed: true,
  checkpointCursorId: "checkpoint-1",
  checkpointLatestId: "checkpoint-2",
}));
const resetThreadRepoCheckpoint = mock(async () => ({
  changed: true,
  checkpointAnchorMessageId: "message-1",
  checkpointCursorId: null,
  checkpointLatestId: null,
}));
const getThreadCheckpointAnchorMessageId = mock(
  (thread?: {
    chatEngineState?: { repo?: { checkpointAnchorMessageId?: string | null } };
  }) => thread?.chatEngineState?.repo?.checkpointAnchorMessageId ?? null,
);
const persistenceNoopAsync = mock(async () => undefined);
const persistenceNoopSync = mock(() => undefined);
const updateThreadRepoState = mock(() => undefined);
const githubCreatePr = mock(async (input: any) => ({
  additions: 10,
  author: "user-1",
  base: input.base,
  body: input.body ?? "",
  changedFiles: 1,
  comments: 0,
  createdAt: "2026-03-28T10:00:00.000Z",
  deletions: 2,
  draft: input.draft ?? false,
  head: input.head,
  htmlUrl: "https://github.com/openai/sentinel/pull/42",
  id: 42,
  labels: [],
  mergeable: true,
  merged: false,
  number: 42,
  reviewDecision: "",
  state: "open",
  title: input.title,
  updatedAt: "2026-03-28T10:05:00.000Z",
}));
const githubGetActivePullRequestStatus = mock(async () => null);

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedThreadOrThrow,
  getOwnedWorkspaceOrThrow,
}));

mock.module("@/server/db/schema", () => ({
  integrations: {
    id: "integrations.id",
    isEnabled: "integrations.isEnabled",
    provider: "integrations.provider",
    userId: "integrations.userId",
  },
  users: {
    id: "user.id",
  },
}));

mock.module("@/lib/git/repo", () => ({
  buildGitHubRemoteUrls: (
    owner: string,
    repo: string,
    branch: string | null,
    defaultBranch: string | null,
  ) => {
    const repositoryUrl = `https://github.com/${owner}/${repo}`;
    return {
      pullRequestUrl:
        branch && defaultBranch
          ? `${repositoryUrl}/compare/${defaultBranch}...${branch}?expand=1`
          : null,
      pullRequestsUrl: `${repositoryUrl}/pulls`,
      repositoryUrl,
    };
  },
  buildFallbackCommitMessage,
  checkoutBranch,
  commitAllChanges,
  createAndCheckoutBranch,
  ensureThreadWorktree,
  getRepoDiffPanelBundleData,
  getCommitMessageContext,
  getRepoDiffPanelData,
  getHeadCommitMessage,
  initializeRepository,
  listBranches,
  pushCurrentBranch,
  removeThreadWorktree: removeThreadWorktreeAtPath,
  revertFiles,
  resolveRepoContext,
  stashChanges,
  stageFiles,
  unstageFiles,
}));

mock.module("@/lib/git/commit-message", () => ({
  generateGitCommitMessage,
  parseCommitMessage: (message: string) => {
    const normalized = message.replace(/\r\n/g, "\n").trim();
    if (!normalized) {
      return { body: "", subject: "" };
    }
    const [subjectLine = ""] = normalized.split("\n");
    return {
      body: normalized.slice(subjectLine.length).replace(/^\n+/, "").trim(),
      subject: subjectLine.trim(),
    };
  },
}));

mock.module("@/lib/ai/chat/persistence", () => ({
  clearActiveStream: persistenceNoopSync,
  ensureThread: persistenceNoopAsync,
  loadThreadMessages: mock(async () => []),
  setActiveMessage: persistenceNoopAsync,
  setActiveStream: persistenceNoopSync,
  setThreadStatus: persistenceNoopSync,
  updateClaudeThreadState: persistenceNoopSync,
  updateCodexThreadState: persistenceNoopSync,
  updateMessageMetadata: persistenceNoopAsync,
  updateThreadChatSettings: persistenceNoopAsync,
  updateThreadRepoState,
  upsertMessage: persistenceNoopSync,
}));

mock.module("@/lib/ai/chat/repo-checkpoints", () => ({
  beginThreadRepoCheckpointRun: mock(async () => false),
  clearThreadRepoCheckpointRun: mock(async () => {}),
  finalizeThreadRepoCheckpointRun: mock(async () => null),
  getThreadCheckpointAnchorMessageId,
  resetThreadRepoCheckpoint,
  toggleThreadRepoCheckpoint,
}));

mock.module("@/lib/integrations/oauth/token-manager", () => ({
  getValidAccessToken,
}));

mock.module("@/lib/integrations/providers/github/service", () => ({
  GitHubService: class {
    createPr(input: any) {
      return githubCreatePr(input);
    }

    getActivePullRequestStatus(input: any) {
      return githubGetActivePullRequestStatus(input);
    }
  },
}));

const { repoRouter } = await import("./repo");

beforeEach(() => {
  getOwnedWorkspaceOrThrow.mockClear();
  getOwnedThreadOrThrow.mockClear();
  resolveRepoContext.mockClear();
  getCommitMessageContext.mockClear();
  getRepoDiffPanelBundleData.mockClear();
  getRepoDiffPanelData.mockClear();
  getHeadCommitMessage.mockClear();
  buildFallbackCommitMessage.mockClear();
  checkoutBranch.mockClear();
  commitAllChanges.mockClear();
  createAndCheckoutBranch.mockClear();
  ensureThreadWorktree.mockClear();
  initializeRepository.mockClear();
  listBranches.mockClear();
  pushCurrentBranch.mockClear();
  removeThreadWorktreeAtPath.mockClear();
  revertFiles.mockClear();
  stashChanges.mockClear();
  stageFiles.mockClear();
  unstageFiles.mockClear();
  generateGitCommitMessage.mockClear();
  findGithubIntegration.mockClear();
  getValidAccessToken.mockClear();
  getThreadCheckpointAnchorMessageId.mockClear();
  resetThreadRepoCheckpoint.mockClear();
  toggleThreadRepoCheckpoint.mockClear();
  updateThreadRepoState.mockClear();
  githubCreatePr.mockClear();
  githubGetActivePullRequestStatus.mockClear();
  run.mockClear();
  where.mockClear();
  set.mockClear();
  update.mockClear();

  getOwnedThreadOrThrow.mockImplementation(async () => ({
    chatEngine: "codex",
    chatEngineState: null,
    chatModelId: "gpt-5.4",
    chatReasoningEffort: "high",
    id: "thread-1",
    workspaceId: "workspace-1",
  }));

  resolveRepoContext.mockImplementation(async () => ({
    aheadCount: 0,
    branch: "feature/test",
    changedFileCount: 0,
    deletions: 0,
    githubRemote: {
      defaultBranch: "main",
      owner: "openai",
      pullRequestUrl:
        "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
      pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
      remoteName: "origin",
      remoteUrl: "git@github.com:openai/sentinel.git",
      repo: "sentinel",
      repositoryUrl: "https://github.com/openai/sentinel",
    },
    hasChanges: false,
    hasCommits: true,
    hasRemotes: true,
    hasUpstream: true,
    insertions: 0,
    isDefaultBranch: false,
    isGitRepo: true,
    pushRemoteName: "origin",
    repoRoot: "/tmp/workspace",
  }));

  findGithubIntegration.mockImplementation(async () => null);
  getHeadCommitMessage.mockImplementation(async () => ({
    body: "- latest body",
    message: "Latest subject\n\n- latest body",
    subject: "Latest subject",
  }));
  githubGetActivePullRequestStatus.mockImplementation(async () => null);
});

describe("repoRouter.createPullRequest", () => {
  it("commits, pushes, and returns a PR URL for a feature branch with changes", async () => {
    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 1,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: true,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: false,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 1,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: false,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(commitAllChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "Add generated message\n\n- add tests",
      true,
    );
    expect(pushCurrentBranch).toHaveBeenCalledWith("/tmp/workspace");
    expect(generateGitCommitMessage).toHaveBeenCalledWith({
      context: {
        branch: "feature/test",
        changes: [{ path: "file.ts", type: "modified" }],
        patch:
          "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
        repoRoot: "/tmp/workspace",
        summary: "M file.ts",
      },
      defaultChatModelId: null,
      engine: "codex",
      modelId: "gpt-5.4",
      reasoningEffort: "high",
      userId: "user-1",
    });
    expect(result.pullRequestUrl).toContain("/compare/main...feature/test");
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "feature/test",
        lastPullRequest: expect.objectContaining({
          kind: "compare",
          repoFullName: "openai/sentinel",
          url: expect.stringContaining("/compare/main...feature/test"),
        }),
      }),
    );
    expect(result.repoContext.lastPullRequest).toMatchObject({
      kind: "compare",
    });
  });

  it("creates a branch first when invoked from the default branch", async () => {
    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "main",
        changedFileCount: 1,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...main?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: true,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: true,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementation(async () => ({
        aheadCount: 0,
        branch: "feature/new-pr",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/new-pr?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        branchName: "feature/new-pr",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(createAndCheckoutBranch).toHaveBeenCalledWith(
      "/tmp/workspace",
      "feature/new-pr",
    );
    expect(result.createdBranch).toBe("feature/new-pr");
  });

  it("creates a real draft PR through the GitHub integration when connected", async () => {
    findGithubIntegration.mockImplementationOnce(async () => ({
      id: "integration-1",
    }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-2" } },
        user: {
          defaultChatModelId: null,
          id: "user-2",
        },
      },
      input: {
        draft: true,
        message: "Ship draft PR\n\n- include metadata",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(getValidAccessToken).toHaveBeenCalledWith("integration-1");
    expect(githubCreatePr).toHaveBeenCalledWith({
      base: "main",
      body: "- include metadata",
      draft: true,
      head: "feature/test",
      owner: "openai",
      repo: "sentinel",
      title: "Ship draft PR",
    });
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "feature/test",
        lastPullRequest: expect.objectContaining({
          kind: "github",
          draft: true,
          number: 42,
          repoFullName: "openai/sentinel",
          url: "https://github.com/openai/sentinel/pull/42",
        }),
      }),
    );
    expect(result.pullRequestUrl).toBe(
      "https://github.com/openai/sentinel/pull/42",
    );
    expect(result.repoContext.lastPullRequest).toMatchObject({
      kind: "github",
      draft: true,
      number: 42,
    });
  });

  it("links an existing branch PR to the thread when GitHub reports one already exists", async () => {
    findGithubIntegration.mockImplementationOnce(async () => ({
      id: "integration-1",
    }));
    githubCreatePr.mockImplementationOnce(async () => {
      throw new Error(
        "Validation Failed: A pull request already exists for openai:feature/test.",
      );
    });
    githubGetActivePullRequestStatus.mockImplementationOnce(async () => ({
      additions: 12,
      baseBranch: "main",
      branch: "feature/test",
      changedFiles: 3,
      checks: {
        failingCount: 0,
        passingCount: 5,
        pendingCount: 0,
        state: "success",
        totalCount: 5,
      },
      comments: 2,
      createdAt: "2026-03-31T08:00:00.000Z",
      deletions: 4,
      mergeStatus: "ready",
      number: 51,
      provider: "github",
      reviewDecision: "APPROVED",
      state: "open",
      title: "Existing branch PR",
      updatedAt: "2026-03-31T08:05:00.000Z",
      url: "https://github.com/openai/sentinel/pull/51",
    }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-2" } },
        user: {
          defaultChatModelId: null,
          id: "user-2",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(githubGetActivePullRequestStatus).toHaveBeenCalledWith({
      branch: "feature/test",
      owner: "openai",
      repo: "sentinel",
    });
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "feature/test",
        lastPullRequest: expect.objectContaining({
          kind: "github",
          number: 51,
          repoFullName: "openai/sentinel",
          title: "Existing branch PR",
          url: "https://github.com/openai/sentinel/pull/51",
        }),
      }),
    );
    expect(result.linkedExistingPullRequest).toBe(true);
    expect(result.pullRequestUrl).toBe(
      "https://github.com/openai/sentinel/pull/51",
    );
    expect(result.repoContext.lastPullRequest).toMatchObject({
      kind: "github",
      number: 51,
    });
    expect(result.repoContext.pullRequestStatus).toMatchObject({
      number: 51,
      title: "Existing branch PR",
    });
  });

  it("rejects draft PR creation when GitHub is not connected", async () => {
    await expect(
      repoRouter.createPullRequest({
        ctx: {
          db: {
            query: {
              integrations: {
                findFirst: findGithubIntegration,
              },
            },
          },
          session: { user: { id: "user-1" } },
          user: {
            defaultChatModelId: null,
            id: "user-1",
          },
        },
        input: {
          draft: true,
          threadId: "thread-1",
          workspaceId: "workspace-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Connect GitHub to create draft pull requests.",
    });
  });

  it("passes includeUnstaged and the provided message through to the commit step", async () => {
    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 1,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: true,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementation(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        includeUnstaged: false,
        message: "Use typed message",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(commitAllChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "Use typed message",
      false,
    );
    expect(generateGitCommitMessage).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic message when external generation fails", async () => {
    generateGitCommitMessage.mockImplementationOnce(async () => {
      throw new Error("CLI failed");
    });

    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 1,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: true,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: false,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementation(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(commitAllChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "Update file",
      true,
    );
  });

  it("creates a PR from workspace repo state when the draft thread does not exist yet", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Thread not found.",
      });
    });

    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 1,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: true,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: false,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 1,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: false,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
        changedFileCount: 0,
        deletions: 0,
        githubRemote: {
          defaultBranch: "main",
          owner: "openai",
          pullRequestUrl:
            "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
          pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
          remoteName: "origin",
          remoteUrl: "git@github.com:openai/sentinel.git",
          repo: "sentinel",
          repositoryUrl: "https://github.com/openai/sentinel",
        },
        hasChanges: false,
        hasCommits: true,
        hasRemotes: true,
        hasUpstream: true,
        insertions: 0,
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-draft" } },
        user: {
          defaultChatModelId: "openai:gpt-4.1-mini",
          id: "user-draft",
        },
      },
      input: {
        threadId: "draft-thread",
        workspaceId: "workspace-1",
      },
    });

    expect(generateGitCommitMessage).toHaveBeenCalledWith({
      context: {
        branch: "feature/test",
        changes: [{ path: "file.ts", type: "modified" }],
        patch:
          "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
        repoRoot: "/tmp/workspace",
        summary: "M file.ts",
      },
      defaultChatModelId: "openai:gpt-4.1-mini",
      engine: "sentinel",
      modelId: null,
      reasoningEffort: null,
      userId: "user-draft",
    });
    expect(commitAllChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "Add generated message\n\n- add tests",
      true,
    );
    expect(updateThreadRepoState).not.toHaveBeenCalled();
    expect(result.pullRequestUrl).toContain("/compare/main...feature/test");
    expect(result.repoContext.lastPullRequest).toMatchObject({
      kind: "compare",
    });
  });
});

describe("repoRouter.commit", () => {
  it("creates a commit from the workspace repo when the draft thread is missing", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Thread not found.",
      });
    });

    const result = await repoRouter.commit({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-draft" } },
        user: {
          id: "user-draft",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        message: "Commit from new thread",
        threadId: "draft-thread",
        workspaceId: "workspace-1",
      },
    });

    expect(commitAllChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "Commit from new thread",
      true,
    );
    expect(result.repoContext.isGitRepo).toBe(true);
  });
});

describe("repoRouter workspace PR status queries", () => {
  it("links the active branch PR to the thread when repo context is loaded", async () => {
    findGithubIntegration.mockImplementationOnce(async () => ({
      id: "integration-1",
    }));
    githubGetActivePullRequestStatus.mockImplementationOnce(async () => ({
      additions: 12,
      baseBranch: "main",
      branch: "feature/test",
      changedFiles: 3,
      checks: {
        failingCount: 0,
        passingCount: 5,
        pendingCount: 0,
        state: "success",
        totalCount: 5,
      },
      comments: 2,
      createdAt: "2026-03-31T08:00:00.000Z",
      deletions: 4,
      mergeStatus: "ready",
      number: 42,
      provider: "github",
      reviewDecision: "APPROVED",
      state: "open",
      title: "Active branch PR",
      updatedAt: "2026-03-31T08:05:00.000Z",
      url: "https://github.com/openai/sentinel/pull/42",
    }));

    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-sync" } },
        user: {
          defaultChatModelId: null,
          id: "user-sync",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result.lastPullRequest).toMatchObject({
      kind: "github",
      number: 42,
      title: "Active branch PR",
      url: "https://github.com/openai/sentinel/pull/42",
    });
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "feature/test",
        lastPullRequest: expect.objectContaining({
          kind: "github",
          number: 42,
        }),
      }),
    );
    expect(result.threadBranch).toBe("feature/test");
    expect(result.branchResumeStatus).toBe("matched");
  });

  it("returns connected workspace PR status when GitHub is available", async () => {
    findGithubIntegration.mockImplementationOnce(async () => ({
      id: "integration-1",
    }));
    githubGetActivePullRequestStatus.mockImplementationOnce(async () => ({
      additions: 12,
      baseBranch: "main",
      branch: "feature/test",
      changedFiles: 3,
      checks: {
        failingCount: 0,
        passingCount: 5,
        pendingCount: 0,
        state: "success",
        totalCount: 5,
      },
      comments: 2,
      createdAt: "2026-03-31T08:00:00.000Z",
      deletions: 4,
      mergeStatus: "ready",
      number: 42,
      provider: "github",
      reviewDecision: "APPROVED",
      state: "open",
      title: "Add workspace PR status",
      updatedAt: "2026-03-31T08:05:00.000Z",
      url: "https://github.com/openai/sentinel/pull/42",
    }));

    const result = await repoRouter.listWorkspaceStatuses({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        workspaceIds: ["workspace-1"],
      },
    });

    expect(result[0]).toMatchObject({
      pullRequestIntegrationStatus: "connected",
      pullRequestStatus: {
        mergeStatus: "ready",
        number: 42,
        title: "Add workspace PR status",
      },
      workspaceId: "workspace-1",
    });
    expect(githubGetActivePullRequestStatus).toHaveBeenCalledWith({
      branch: "feature/test",
      owner: "openai",
      repo: "sentinel",
    });
  });

  it("reports that GitHub needs to be connected before live PR status is available", async () => {
    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result.pullRequestIntegrationStatus).toBe("needs_github");
    expect(result.pullRequestStatus).toBeNull();
  });

  it("remembers the current branch the first time a thread repo context is loaded", async () => {
    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-bind" } },
        user: {
          defaultChatModelId: null,
          id: "user-bind",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result.threadBranch).toBe("feature/test");
    expect(result.branchResumeStatus).toBe("matched");
    expect(result.threadProjectMode).toBe("local");
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "feature/test",
      }),
    );
  });

  it("matches checkpoint availability against the thread project path instead of the repo root", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatEngineState: {
        repo: {
          checkpointProjectPath: "/tmp/workspace",
          projectMode: "local",
        },
      },
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      id: "thread-1",
      workspaceId: "workspace-1",
    }));
    resolveRepoContext.mockImplementationOnce(async () => ({
      aheadCount: 0,
      branch: "feature/test",
      changedFileCount: 0,
      deletions: 0,
      githubRemote: {
        defaultBranch: "main",
        owner: "openai",
        pullRequestUrl:
          "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
        pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
        remoteName: "origin",
        remoteUrl: "git@github.com:openai/sentinel.git",
        repo: "sentinel",
        repositoryUrl: "https://github.com/openai/sentinel",
      },
      hasChanges: false,
      hasCommits: true,
      hasRemotes: true,
      hasUpstream: true,
      insertions: 0,
      isDefaultBranch: false,
      isGitRepo: true,
      pushRemoteName: "origin",
      repoRoot: "/tmp/workspace/apps/web",
    }));

    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-checkpoint" } },
        user: {
          defaultChatModelId: null,
          id: "user-checkpoint",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result.checkpointPathMatches).toBe(true);
    expect(result.effectiveProjectPath).toBe("/tmp/workspace");
    expect(result.effectiveRootPath).toBe("/tmp/workspace/apps/web");
  });

  it("reports blocked branch resume when the thread branch differs and the local project is dirty", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatEngineState: {
        repo: {
          activeBranch: "feature/linked",
          projectMode: "local",
        },
      },
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      id: "thread-1",
      workspaceId: "workspace-1",
    }));
    resolveRepoContext.mockImplementationOnce(async () => ({
      aheadCount: 0,
      branch: "main",
      changedFileCount: 2,
      deletions: 0,
      githubRemote: {
        defaultBranch: "main",
        owner: "openai",
        pullRequestUrl:
          "https://github.com/openai/sentinel/compare/main...main?expand=1",
        pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
        remoteName: "origin",
        remoteUrl: "git@github.com:openai/sentinel.git",
        repo: "sentinel",
        repositoryUrl: "https://github.com/openai/sentinel",
      },
      hasChanges: true,
      hasCommits: true,
      hasRemotes: true,
      hasUpstream: true,
      insertions: 4,
      isDefaultBranch: true,
      isGitRepo: true,
      pushRemoteName: "origin",
      repoRoot: "/tmp/workspace",
    }));

    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-dirty" } },
        user: {
          defaultChatModelId: null,
          id: "user-dirty",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result.threadBranch).toBe("feature/linked");
    expect(result.branchResumeStatus).toBe("blocked_dirty");
    expect(result.branchResumeReason).toContain("uncommitted changes");
  });

  it("ignores a missing optional draft thread when loading repo context", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Thread not found.",
      });
    });

    const result = await repoRouter.getContext({
      ctx: {
        db: {
          query: {
            integrations: {
              findFirst: findGithubIntegration,
            },
          },
        },
        session: { user: { id: "user-draft" } },
        user: {
          defaultChatModelId: null,
          id: "user-draft",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        threadId: "draft-thread",
        workspaceId: "workspace-1",
      },
    });

    expect(result.isGitRepo).toBe(true);
    expect(result.threadBranch).toBe("feature/test");
  });
});

describe("repoRouter.generateCommitMessage", () => {
  it("uses the active thread engine and returns subject, body, and message", async () => {
    const result = await repoRouter.generateCommitMessage({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: "openai:gpt-4.1",
          id: "user-1",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(generateGitCommitMessage).toHaveBeenCalledWith({
      context: {
        branch: "feature/test",
        changes: [{ path: "file.ts", type: "modified" }],
        patch:
          "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
        repoRoot: "/tmp/workspace",
        summary: "M file.ts",
      },
      defaultChatModelId: "openai:gpt-4.1",
      engine: "codex",
      modelId: "gpt-5.4",
      reasoningEffort: "high",
      userId: "user-1",
    });
    expect(result).toEqual({
      body: "- add tests",
      message: "Add generated message\n\n- add tests",
      subject: "Add generated message",
    });
  });

  it("falls back to sentinel generation inputs when the thread has no external model", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "claude",
      chatModelId: null,
      chatReasoningEffort: "medium",
      workspaceId: "workspace-1",
    }));

    await repoRouter.generateCommitMessage({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: "openai:gpt-4.1-mini",
          id: "user-1",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(generateGitCommitMessage).toHaveBeenCalledWith({
      context: {
        branch: "feature/test",
        changes: [{ path: "file.ts", type: "modified" }],
        patch:
          "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
        repoRoot: "/tmp/workspace",
        summary: "M file.ts",
      },
      defaultChatModelId: "openai:gpt-4.1-mini",
      engine: "claude",
      modelId: null,
      reasoningEffort: "medium",
      userId: "user-1",
    });
  });

  it("rejects threads from a different workspace", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      workspaceId: "workspace-2",
    }));

    await expect(
      repoRouter.generateCommitMessage({
        ctx: {
          session: { user: { id: "user-1" } },
          user: {
            defaultChatModelId: null,
            id: "user-1",
          },
        },
        input: {
          threadId: "thread-1",
          workspaceId: "workspace-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("falls back to workspace repo generation when the draft thread is missing", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Thread not found.",
      });
    });

    await repoRouter.generateCommitMessage({
      ctx: {
        session: { user: { id: "user-draft" } },
        user: {
          defaultChatModelId: "openai:gpt-4.1",
          id: "user-draft",
        },
      },
      input: {
        threadId: "draft-thread",
        workspaceId: "workspace-1",
      },
    });

    expect(generateGitCommitMessage).toHaveBeenCalledWith({
      context: {
        branch: "feature/test",
        changes: [{ path: "file.ts", type: "modified" }],
        patch:
          "diff --git a/file.ts b/file.ts\n+export const updated = true;\n",
        repoRoot: "/tmp/workspace",
        summary: "M file.ts",
      },
      defaultChatModelId: "openai:gpt-4.1",
      engine: "sentinel",
      modelId: null,
      reasoningEffort: null,
      userId: "user-draft",
    });
  });
});

describe("repoRouter.setPreferredOpenTarget", () => {
  it("persists the selected open target on the user record", async () => {
    const result = await repoRouter.setPreferredOpenTarget({
      ctx: {
        db: {
          update,
        },
        session: {
          user: {
            id: "user-1",
          },
        },
        user: {
          id: "user-1",
        },
      },
      input: {
        targetId: "cursor",
      },
    });

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      lastProjectOpenTargetId: "cursor",
    });
    expect(run).toHaveBeenCalled();
    expect(result).toEqual({
      targetId: "cursor",
    });
  });
});

describe("repoRouter.diff panel", () => {
  it("returns the aggregated diff bundle for a thread workspace pair", async () => {
    const result = await repoRouter.getDiffPanelBundle({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          id: "user-1",
          lastProjectOpenTargetId: "cursor",
        },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(getRepoDiffPanelBundleData).toHaveBeenCalledWith(
      "/tmp/workspace",
      expect.objectContaining({
        dedupeKey: expect.any(String),
        emptyReason: undefined,
        onMissingRepo: "empty",
      }),
    );
    expect(result.diffs.staged).toMatchObject({
      fileCount: 1,
      mode: "staged",
    });
    expect(result.repoContext.preferredOpenTargetId).toBe("cursor");
  });

  it("returns diff data for the selected mode with refreshed repo context", async () => {
    const result = await repoRouter.getDiffPanelData({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          id: "user-1",
          lastProjectOpenTargetId: "cursor",
        },
      },
      input: {
        mode: "staged",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(getRepoDiffPanelBundleData).toHaveBeenCalledWith(
      "/tmp/workspace",
      expect.objectContaining({
        dedupeKey: expect.any(String),
        emptyReason: undefined,
        onMissingRepo: "empty",
        repoContext: expect.objectContaining({
          branch: "feature/test",
        }),
      }),
    );
    expect(result.diff).toMatchObject({
      fileCount: 1,
      mode: "staged",
      sourceLabel: "Staged",
    });
    expect(result.repoContext.preferredOpenTargetId).toBe("cursor");
  });

  it("ignores a missing optional draft thread when loading diff panel data", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Thread not found.",
      });
    });

    const result = await repoRouter.getDiffPanelData({
      ctx: {
        session: { user: { id: "user-draft" } },
        user: {
          id: "user-draft",
          lastProjectOpenTargetId: null,
        },
      },
      input: {
        mode: "unstaged",
        threadId: "draft-thread",
        workspaceId: "workspace-1",
      },
    });

    expect(getRepoDiffPanelBundleData).toHaveBeenCalledWith(
      "/tmp/workspace",
      expect.objectContaining({
        dedupeKey: expect.any(String),
        onMissingRepo: "empty",
      }),
    );
    expect(result.diff.mode).toBe("unstaged");
    expect(result.repoContext.isGitRepo).toBe(true);
  });

  it("stages, unstages, and reverts files through repo mutations", async () => {
    const ctx = {
      session: { user: { id: "user-1" } },
      user: {
        id: "user-1",
        lastProjectOpenTargetId: "cursor",
      },
    };

    const stageResult = await repoRouter.stageFiles({
      ctx,
      input: {
        mode: "unstaged",
        paths: ["file.ts"],
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });
    const unstageResult = await repoRouter.unstageFiles({
      ctx,
      input: {
        mode: "staged",
        paths: ["file.ts"],
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });
    const revertResult = await repoRouter.revertFiles({
      ctx,
      input: {
        mode: "unstaged",
        paths: ["file.ts"],
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(stageFiles).toHaveBeenCalledWith("/tmp/workspace", ["file.ts"]);
    expect(stageResult.diff).toMatchObject({
      mode: "unstaged",
    });
    expect(unstageFiles).toHaveBeenCalledWith("/tmp/workspace", ["file.ts"]);
    expect(unstageResult.diff).toMatchObject({
      mode: "staged",
    });
    expect(revertFiles).toHaveBeenCalledWith(
      "/tmp/workspace",
      ["file.ts"],
      "unstaged",
    );
    expect(revertResult.diff).toMatchObject({
      mode: "unstaged",
    });
  });

  it("toggles a thread checkpoint and refreshes repo context", async () => {
    const result = await repoRouter.toggleCheckpoint({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          id: "user-1",
          lastProjectOpenTargetId: "cursor",
        },
      },
      input: {
        checkpointId: "checkpoint-1",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(toggleThreadRepoCheckpoint).toHaveBeenCalledWith({
      checkpointId: "checkpoint-1",
      projectPath: "/tmp/workspace",
      thread: expect.objectContaining({
        id: "thread-1",
      }),
      threadId: "thread-1",
    });
    expect(result).toMatchObject({
      ok: true,
      repoContext: expect.objectContaining({
        preferredOpenTargetId: "cursor",
      }),
    });
  });

  it("resets a thread checkpoint from a user message and refreshes repo context", async () => {
    const result = await repoRouter.resetCheckpoint({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          id: "user-1",
          lastProjectOpenTargetId: "cursor",
        },
      },
      input: {
        checkpointId: "checkpoint-1",
        threadId: "thread-1",
        userMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    });

    expect(resetThreadRepoCheckpoint).toHaveBeenCalledWith({
      checkpointId: "checkpoint-1",
      projectPath: "/tmp/workspace",
      thread: expect.objectContaining({
        id: "thread-1",
      }),
      threadId: "thread-1",
      userMessageId: "message-1",
    });
    expect(result).toMatchObject({
      changed: true,
      ok: true,
      repoContext: expect.objectContaining({
        preferredOpenTargetId: "cursor",
      }),
    });
  });
});

describe("repoRouter.branch actions", () => {
  it("lists branches for the workspace", async () => {
    const result = await repoRouter.listBranches({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1" },
      },
      input: {
        workspaceId: "workspace-1",
      },
    });

    expect(listBranches).toHaveBeenCalledWith("/tmp/workspace");
    expect(result.branches).toHaveLength(2);
  });

  it("checks out an existing branch", async () => {
    const result = await repoRouter.checkoutBranch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1" },
      },
      input: {
        branchName: "main",
        workspaceId: "workspace-1",
      },
    });

    expect(checkoutBranch).toHaveBeenCalledWith("/tmp/workspace", "main");
    expect(result).toMatchObject({
      branch: "main",
      repoContext: expect.any(Object),
    });
  });

  it("reuses an existing worktree when the selected branch is already checked out there", async () => {
    checkoutBranch.mockImplementationOnce(async () => {
      throw new Error(
        "Branch main is already checked out at /tmp/worktrees/thread-main. Switch this thread to the local project for that branch, or choose a different branch for this worktree.",
      );
    });
    resolveRepoContext.mockImplementation((pathValue) =>
      Promise.resolve(
        pathValue === "/tmp/worktrees/thread-main"
          ? {
              aheadCount: 0,
              branch: "main",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...main?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: true,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: "/tmp/worktrees/thread-main",
            }
          : {
              aheadCount: 0,
              branch: "feature/test",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: false,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: "/tmp/workspace",
            },
      ),
    );

    const result = await repoRouter.checkoutBranch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        branchName: "main",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "main",
        projectMode: "worktree",
        worktreePath: "/tmp/worktrees/thread-main",
      }),
    );
    expect(result.reusedExistingWorktree).toBe(true);
    expect(result.repoContext.threadProjectMode).toBe("worktree");
    expect(result.repoContext.effectiveRootPath).toBe(
      "/tmp/worktrees/thread-main",
    );
  });

  it("switches a worktree thread back to the local project when the target branch is already active there", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatEngineState: {
        repo: {
          activeBranch: "feature/worktree",
          projectMode: "worktree",
          worktreePath: "/tmp/.sentinel-worktrees/sentinel/thread-1",
        },
      },
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      id: "thread-1",
      workspaceId: "workspace-1",
    }));
    resolveRepoContext.mockImplementation((pathValue) =>
      Promise.resolve(
        pathValue === "/tmp/.sentinel-worktrees/sentinel/thread-1"
          ? {
              aheadCount: 0,
              branch: "thread/atlas-a1b2c3",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...thread/atlas-a1b2c3?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: false,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: pathValue,
            }
          : {
              aheadCount: 0,
              branch: "main",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...main?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: true,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: "/tmp/workspace",
            },
      ),
    );

    const result = await repoRouter.checkoutBranch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        branchName: "main",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(checkoutBranch).not.toHaveBeenCalled();
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "main",
        projectMode: "local",
      }),
    );
    expect(result.switchedToLocalProject).toBe(true);
    expect(result.repoContext.threadProjectMode).toBe("local");
    expect(result.repoContext.threadBranch).toBe("main");
  });

  it("inspects a dirty local thread switch that needs a branch change", async () => {
    getOwnedThreadOrThrow
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "main",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-source",
        workspaceId: "workspace-1",
      }))
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "feature/target",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-target",
        workspaceId: "workspace-1",
      }));
    resolveRepoContext.mockImplementation(async () => ({
      aheadCount: 0,
      branch: "main",
      changedFileCount: 2,
      deletions: 0,
      githubRemote: {
        defaultBranch: "main",
        owner: "openai",
        pullRequestUrl:
          "https://github.com/openai/sentinel/compare/main...main?expand=1",
        pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
        remoteName: "origin",
        remoteUrl: "git@github.com:openai/sentinel.git",
        repo: "sentinel",
        repositoryUrl: "https://github.com/openai/sentinel",
      },
      hasChanges: true,
      hasCommits: true,
      hasRemotes: true,
      hasUpstream: true,
      insertions: 4,
      isDefaultBranch: true,
      isGitRepo: true,
      pushRemoteName: "origin",
      repoRoot: "/tmp/workspace",
    }));

    const result = await repoRouter.inspectThreadSwitch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1" },
      },
      input: {
        sourceThreadId: "thread-source",
        targetThreadId: "thread-target",
        workspaceId: "workspace-1",
      },
    });

    expect(result).toMatchObject({
      currentBranch: "main",
      isDirty: true,
      requiresBranchSwitch: true,
      shouldPrompt: true,
      sourceProjectMode: "local",
      targetBranch: "feature/target",
      targetProjectMode: "local",
    });
  });

  it("stashes dirty changes before switching to the target thread branch", async () => {
    getOwnedThreadOrThrow
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "main",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-source",
        workspaceId: "workspace-1",
      }))
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "feature/target",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-target",
        workspaceId: "workspace-1",
      }));
    resolveRepoContext.mockImplementation(async () => ({
      aheadCount: 0,
      branch: "main",
      changedFileCount: 2,
      deletions: 0,
      githubRemote: {
        defaultBranch: "main",
        owner: "openai",
        pullRequestUrl:
          "https://github.com/openai/sentinel/compare/main...main?expand=1",
        pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
        remoteName: "origin",
        remoteUrl: "git@github.com:openai/sentinel.git",
        repo: "sentinel",
        repositoryUrl: "https://github.com/openai/sentinel",
      },
      hasChanges: true,
      hasCommits: true,
      hasRemotes: true,
      hasUpstream: true,
      insertions: 4,
      isDefaultBranch: true,
      isGitRepo: true,
      pushRemoteName: "origin",
      repoRoot: "/tmp/workspace",
    }));

    const result = await repoRouter.handoffThreadSwitch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        sourceThreadId: "thread-source",
        stashName: "keep-main-safe",
        strategy: "stash",
        targetThreadId: "thread-target",
        workspaceId: "workspace-1",
      },
    });

    expect(stashChanges).toHaveBeenCalledWith(
      "/tmp/workspace",
      "thread:thread-source:main:keep-main-safe",
    );
    expect(checkoutBranch).toHaveBeenCalledWith(
      "/tmp/workspace",
      "feature/target",
    );
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-target",
      expect.objectContaining({
        activeBranch: "feature/target",
        projectMode: "local",
      }),
    );
    expect(result.action).toBe("stash");
  });

  it("moves dirty local changes to the target thread by adopting the current branch", async () => {
    getOwnedThreadOrThrow
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "main",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-source",
        workspaceId: "workspace-1",
      }))
      .mockImplementationOnce(async () => ({
        chatEngine: "codex",
        chatEngineState: {
          repo: {
            activeBranch: "feature/target",
            projectMode: "local",
          },
        },
        chatModelId: "gpt-5.4",
        chatReasoningEffort: "high",
        id: "thread-target",
        workspaceId: "workspace-1",
      }));
    resolveRepoContext.mockImplementation(async () => ({
      aheadCount: 0,
      branch: "main",
      changedFileCount: 2,
      deletions: 0,
      githubRemote: {
        defaultBranch: "main",
        owner: "openai",
        pullRequestUrl:
          "https://github.com/openai/sentinel/compare/main...main?expand=1",
        pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
        remoteName: "origin",
        remoteUrl: "git@github.com:openai/sentinel.git",
        repo: "sentinel",
        repositoryUrl: "https://github.com/openai/sentinel",
      },
      hasChanges: true,
      hasCommits: true,
      hasRemotes: true,
      hasUpstream: true,
      insertions: 4,
      isDefaultBranch: true,
      isGitRepo: true,
      pushRemoteName: "origin",
      repoRoot: "/tmp/workspace",
    }));

    const result = await repoRouter.handoffThreadSwitch({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        sourceThreadId: "thread-source",
        strategy: "migrate",
        targetThreadId: "thread-target",
        workspaceId: "workspace-1",
      },
    });

    expect(stashChanges).not.toHaveBeenCalled();
    expect(checkoutBranch).not.toHaveBeenCalled();
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-target",
      expect.objectContaining({
        activeBranch: "main",
        projectMode: "local",
      }),
    );
    expect(result.action).toBe("migrate");
    expect(result.branch).toBe("main");
  });

  it("creates a thread worktree and switches the thread into it", async () => {
    ensureThreadWorktree.mockImplementationOnce(async () => ({
      branch: "thread/atlas-a1b2c3",
      created: true,
      path: "/tmp/.sentinel-worktrees/sentinel/thread-1",
    }));
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatEngineState: {
        repo: {
          activeBranch: "feature/worktree",
          projectMode: "local",
        },
      },
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      id: "thread-1",
      workspaceId: "workspace-1",
    }));
    resolveRepoContext.mockImplementation((pathValue) =>
      Promise.resolve(
        pathValue === "/tmp/.sentinel-worktrees/sentinel/thread-1"
          ? {
              aheadCount: 0,
              branch: "thread/atlas-a1b2c3",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...thread/atlas-a1b2c3?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: false,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: "/tmp/.sentinel-worktrees/sentinel/thread-1",
            }
          : {
              aheadCount: 0,
              branch: "main",
              changedFileCount: 0,
              deletions: 0,
              githubRemote: {
                defaultBranch: "main",
                owner: "openai",
                pullRequestUrl:
                  "https://github.com/openai/sentinel/compare/main...main?expand=1",
                pullRequestsUrl: "https://github.com/openai/sentinel/pulls",
                remoteName: "origin",
                remoteUrl: "git@github.com:openai/sentinel.git",
                repo: "sentinel",
                repositoryUrl: "https://github.com/openai/sentinel",
              },
              hasChanges: false,
              hasCommits: true,
              hasRemotes: true,
              hasUpstream: true,
              insertions: 0,
              isDefaultBranch: true,
              isGitRepo: true,
              pushRemoteName: "origin",
              repoRoot: "/tmp/workspace",
            },
      ),
    );

    const result = await repoRouter.enableThreadWorktree({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(ensureThreadWorktree).toHaveBeenCalledWith(
      "/tmp/workspace",
      "thread-1",
      "feature/worktree",
    );
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        activeBranch: "thread/atlas-a1b2c3",
        projectMode: "worktree",
        worktreePath: "/tmp/.sentinel-worktrees/sentinel/thread-1",
      }),
    );
    expect(result.repoContext.threadProjectMode).toBe("worktree");
    expect(result.repoContext.worktreeStatus).toBe("ready");
    expect(result.repoContext.effectiveRootPath).toBe(
      "/tmp/.sentinel-worktrees/sentinel/thread-1",
    );
  });

  it("removes a thread worktree and returns the thread to local mode", async () => {
    getOwnedThreadOrThrow.mockImplementationOnce(async () => ({
      chatEngine: "codex",
      chatEngineState: {
        repo: {
          activeBranch: "feature/worktree",
          projectMode: "worktree",
          worktreePath: "/tmp/.sentinel-worktrees/sentinel/thread-1",
        },
      },
      chatModelId: "gpt-5.4",
      chatReasoningEffort: "high",
      id: "thread-1",
      workspaceId: "workspace-1",
    }));

    const result = await repoRouter.removeThreadWorktree({
      ctx: {
        session: { user: { id: "user-1" } },
        user: { id: "user-1", lastProjectOpenTargetId: null },
      },
      input: {
        threadId: "thread-1",
        workspaceId: "workspace-1",
      },
    });

    expect(removeThreadWorktreeAtPath).toHaveBeenCalledWith(
      "/tmp/workspace",
      "thread-1",
    );
    expect(updateThreadRepoState).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        projectMode: "local",
        worktreePath: null,
      }),
    );
    expect(result.repoContext.threadProjectMode).toBe("local");
  });
});
