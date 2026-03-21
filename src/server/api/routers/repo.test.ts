// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

const getOwnedWorkspaceOrThrow = mock(async () => ({
  rootPath: "/tmp/workspace",
}));
const run = mock(() => undefined);
const where = mock(() => ({ run }));
const set = mock(() => ({ where }));
const update = mock(() => ({ set }));
const resolveRepoContext = mock(async () => ({
  aheadCount: 0,
  branch: "feature/test",
  githubRemote: {
    defaultBranch: "main",
    owner: "openai",
    pullRequestUrl: "https://github.com/openai/sentinel/compare/main...feature/test?expand=1",
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
  isDefaultBranch: false,
  isGitRepo: true,
  pushRemoteName: "origin",
  repoRoot: "/tmp/workspace",
}));
const getCommitMessageContext = mock(async () => ({
  branch: "feature/test",
  changes: [{ path: "file.ts", type: "modified" }],
  diffStat: " file.ts | 2 +-",
  repoRoot: "/tmp/workspace",
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
const initializeRepository = mock(async () => ({ repoRoot: "/tmp/workspace" }));
const listBranches = mock(async () => ({
  branch: "feature/test",
  branches: [
    { current: true, name: "feature/test" },
    { current: false, name: "main" },
  ],
}));
const pushCurrentBranch = mock(async () => ({ branch: "feature/test" }));
const getEnabledModels = mock(async () => []);

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
  getOwnedWorkspaceOrThrow,
}));

mock.module("@/server/db/schema", () => ({
  users: {
    id: "user.id",
  },
}));

mock.module("@/lib/git/repo", () => ({
  buildFallbackCommitMessage,
  checkoutBranch,
  commitAllChanges,
  createAndCheckoutBranch,
  getCommitMessageContext,
  initializeRepository,
  listBranches,
  pushCurrentBranch,
  resolveRepoContext,
}));

mock.module("@/lib/ai/providers/resolver", () => ({
  getEnabledModels,
  parseModelId: (value: string) => {
    const [provider, model] = value.split(":");
    return { model, provider };
  },
}));

mock.module("@/lib/ai/chat/title/model", () => ({
  resolveThreadTitleModel: mock(async () => null),
}));

mock.module("ai", () => ({
  generateText: mock(async () => ({ text: "Update file" })),
}));

const { repoRouter } = await import("./repo");

beforeEach(() => {
  getOwnedWorkspaceOrThrow.mockClear();
  resolveRepoContext.mockClear();
  getCommitMessageContext.mockClear();
  buildFallbackCommitMessage.mockClear();
  checkoutBranch.mockClear();
  commitAllChanges.mockClear();
  createAndCheckoutBranch.mockClear();
  initializeRepository.mockClear();
  listBranches.mockClear();
  pushCurrentBranch.mockClear();
  getEnabledModels.mockClear();
  run.mockClear();
  where.mockClear();
  set.mockClear();
  update.mockClear();

  resolveRepoContext.mockImplementation(async () => ({
    aheadCount: 0,
    branch: "feature/test",
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
    isDefaultBranch: false,
    isGitRepo: true,
    pushRemoteName: "origin",
    repoRoot: "/tmp/workspace",
  }));
});

describe("repoRouter.createPullRequest", () => {
  it("commits, pushes, and returns a PR URL for a feature branch with changes", async () => {
    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
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
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 1,
        branch: "feature/test",
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
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "feature/test",
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
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        workspaceId: "workspace-1",
      },
    });

    expect(commitAllChanges).toHaveBeenCalledWith("/tmp/workspace", "Update file");
    expect(pushCurrentBranch).toHaveBeenCalledWith("/tmp/workspace");
    expect(result.pullRequestUrl).toContain("/compare/main...feature/test");
  });

  it("creates a branch first when invoked from the default branch", async () => {
    resolveRepoContext
      .mockImplementationOnce(async () => ({
        aheadCount: 0,
        branch: "main",
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
        isDefaultBranch: true,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }))
      .mockImplementation(async () => ({
        aheadCount: 0,
        branch: "feature/new-pr",
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
        isDefaultBranch: false,
        isGitRepo: true,
        pushRemoteName: "origin",
        repoRoot: "/tmp/workspace",
      }));

    const result = await repoRouter.createPullRequest({
      ctx: {
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
        },
      },
      input: {
        branchName: "feature/new-pr",
        workspaceId: "workspace-1",
      },
    });

    expect(createAndCheckoutBranch).toHaveBeenCalledWith(
      "/tmp/workspace",
      "feature/new-pr",
    );
    expect(result.createdBranch).toBe("feature/new-pr");
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
    expect(result).toEqual({ branch: "main" });
  });
});
