// @ts-nocheck

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
const revertFiles = mock(async () => ({ paths: ["file.ts"] }));
const stageFiles = mock(async () => ({ paths: ["file.ts"] }));
const unstageFiles = mock(async () => ({ paths: ["file.ts"] }));
const generateGitCommitMessage = mock(async () => ({
  body: "- add tests",
  message: "Add generated message\n\n- add tests",
  subject: "Add generated message",
}));
const findGithubIntegration = mock(async () => null);
const getValidAccessToken = mock(async () => "github-token");
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
  updateThreadRepoState,
}));

mock.module("@/lib/integrations/oauth/token-manager", () => ({
  getValidAccessToken,
}));

mock.module("@/lib/integrations/providers/github/service", () => ({
  GitHubService: class {
    createPr(input: any) {
      return githubCreatePr(input);
    }
  },
}));

const { repoRouter } = await import("./repo");

beforeEach(() => {
  getOwnedWorkspaceOrThrow.mockClear();
  getOwnedThreadOrThrow.mockClear();
  resolveRepoContext.mockClear();
  getCommitMessageContext.mockClear();
  getRepoDiffPanelData.mockClear();
  getHeadCommitMessage.mockClear();
  buildFallbackCommitMessage.mockClear();
  checkoutBranch.mockClear();
  commitAllChanges.mockClear();
  createAndCheckoutBranch.mockClear();
  initializeRepository.mockClear();
  listBranches.mockClear();
  pushCurrentBranch.mockClear();
  revertFiles.mockClear();
  stageFiles.mockClear();
  unstageFiles.mockClear();
  generateGitCommitMessage.mockClear();
  findGithubIntegration.mockClear();
  getValidAccessToken.mockClear();
  updateThreadRepoState.mockClear();
  githubCreatePr.mockClear();
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
    expect(updateThreadRepoState).toHaveBeenCalledWith("thread-1", {
      lastPullRequest: expect.objectContaining({
        kind: "compare",
        repoFullName: "openai/sentinel",
        url: expect.stringContaining("/compare/main...feature/test"),
      }),
    });
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
        session: { user: { id: "user-1" } },
        user: {
          defaultChatModelId: null,
          id: "user-1",
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
    expect(updateThreadRepoState).toHaveBeenCalledWith("thread-1", {
      lastPullRequest: expect.objectContaining({
        kind: "github",
        draft: true,
        number: 42,
        repoFullName: "openai/sentinel",
        url: "https://github.com/openai/sentinel/pull/42",
      }),
    });
    expect(result.pullRequestUrl).toBe(
      "https://github.com/openai/sentinel/pull/42",
    );
    expect(result.repoContext.lastPullRequest).toMatchObject({
      kind: "github",
      draft: true,
      number: 42,
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

    expect(getRepoDiffPanelData).toHaveBeenCalledWith(
      "/tmp/workspace",
      "staged",
    );
    expect(result.diff).toMatchObject({
      fileCount: 1,
      mode: "staged",
      sourceLabel: "Staged",
    });
    expect(result.repoContext.preferredOpenTargetId).toBe("cursor");
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
