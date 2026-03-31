import { describe, expect, it } from "bun:test";

import {
  buildCreatePullRequestInput,
  buildGenerateCommitMessageInput,
  formatRepoActionErrorMessage,
  getActivePullRequestUrl,
  getGeneratedCommitPromptValue,
  getLinkedPullRequestStatus,
  getThreadLinkedPullRequest,
} from "./thread-repo-actions.helpers";

describe("thread repo action helpers", () => {
  it("passes threadId when generating a commit message", () => {
    expect(
      buildGenerateCommitMessageInput({
        includeUnstaged: false,
        threadId: "thread-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      includeUnstaged: false,
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
  });

  it("passes threadId and trims branch names for PR creation", () => {
    expect(
      buildCreatePullRequestInput({
        branchName: " feature/new-pr ",
        draft: true,
        includeUnstaged: false,
        message: " Add commit generator ",
        threadId: "thread-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      branchName: "feature/new-pr",
      draft: true,
      includeUnstaged: false,
      message: "Add commit generator",
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
  });

  it("uses the generated multiline message directly in the commit field", () => {
    expect(
      getGeneratedCommitPromptValue({
        message: "Add commit generator\n\n- support codex\n- support claude",
      }),
    ).toBe("Add commit generator\n\n- support codex\n- support claude");
  });

  it("returns the active PR url when the current branch has an open PR", () => {
    expect(
      getActivePullRequestUrl({
        branch: "feature/new-pr",
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T00:00:00.000Z",
          draft: false,
          head: "feature/new-pr",
          kind: "github",
          number: 42,
          repoFullName: "openai/sentinel",
          state: "open",
          title: "Add PR state",
          updatedAt: "2026-03-28T00:00:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBe("https://github.com/openai/sentinel/pull/42");
  });

  it("prefers the live pull request status when present", () => {
    expect(
      getActivePullRequestUrl({
        branch: "feature/new-pr",
        lastPullRequest: null,
        pullRequestStatus: {
          additions: 12,
          baseBranch: "main",
          branch: "feature/new-pr",
          changedFiles: 3,
          checks: null,
          comments: 0,
          createdAt: "2026-03-31T08:00:00.000Z",
          deletions: 1,
          mergeStatus: "ready",
          number: 42,
          provider: "github",
          reviewDecision: "APPROVED",
          state: "open",
          title: "Add PR chip",
          updatedAt: "2026-03-31T08:05:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBe("https://github.com/openai/sentinel/pull/42");
  });

  it("ignores PR metadata for a different branch or closed PR", () => {
    expect(
      getActivePullRequestUrl({
        branch: "feature/new-pr",
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T00:00:00.000Z",
          draft: false,
          head: "feature/other",
          kind: "compare",
          repoFullName: "openai/sentinel",
          url: "https://github.com/openai/sentinel/compare/main...feature/other",
        },
      }),
    ).toBeNull();

    expect(
      getActivePullRequestUrl({
        branch: "feature/new-pr",
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T00:00:00.000Z",
          draft: false,
          head: "feature/new-pr",
          kind: "github",
          number: 42,
          repoFullName: "openai/sentinel",
          state: "closed",
          title: "Add PR state",
          updatedAt: "2026-03-28T00:00:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBeNull();
  });

  it("only treats branch PRs as linked when they belong to the thread", () => {
    expect(
      getThreadLinkedPullRequest({
        branch: "feature/new-pr",
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T00:00:00.000Z",
          draft: false,
          head: "feature/new-pr",
          kind: "github",
          number: 42,
          repoFullName: "openai/sentinel",
          state: "open",
          title: "Add PR state",
          updatedAt: "2026-03-28T00:00:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toEqual({
      base: "main",
      createdAt: "2026-03-28T00:00:00.000Z",
      draft: false,
      head: "feature/new-pr",
      kind: "github",
      number: 42,
      repoFullName: "openai/sentinel",
      state: "open",
      title: "Add PR state",
      updatedAt: "2026-03-28T00:00:00.000Z",
      url: "https://github.com/openai/sentinel/pull/42",
    });

    expect(
      getThreadLinkedPullRequest({
        branch: "feature/new-pr",
        lastPullRequest: null,
      }),
    ).toBeNull();
  });

  it("ignores live PR status when the thread does not link that specific PR", () => {
    expect(
      getLinkedPullRequestStatus({
        branch: "feature/new-pr",
        lastPullRequest: null,
        pullRequestStatus: {
          additions: 12,
          baseBranch: "main",
          branch: "feature/new-pr",
          changedFiles: 3,
          checks: null,
          comments: 0,
          createdAt: "2026-03-31T08:00:00.000Z",
          deletions: 1,
          mergeStatus: "ready",
          number: 42,
          provider: "github",
          reviewDecision: "APPROVED",
          state: "open",
          title: "Add PR chip",
          updatedAt: "2026-03-31T08:05:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBeNull();

    expect(
      getLinkedPullRequestStatus({
        branch: "feature/new-pr",
        lastPullRequest: {
          base: "main",
          createdAt: "2026-03-28T00:00:00.000Z",
          draft: false,
          head: "feature/new-pr",
          kind: "github",
          number: 7,
          repoFullName: "openai/sentinel",
          state: "open",
          title: "Older PR",
          updatedAt: "2026-03-28T00:00:00.000Z",
          url: "https://github.com/openai/sentinel/pull/7",
        },
        pullRequestStatus: {
          additions: 12,
          baseBranch: "main",
          branch: "feature/new-pr",
          changedFiles: 3,
          checks: null,
          comments: 0,
          createdAt: "2026-03-31T08:00:00.000Z",
          deletions: 1,
          mergeStatus: "ready",
          number: 42,
          provider: "github",
          reviewDecision: "APPROVED",
          state: "open",
          title: "Different PR",
          updatedAt: "2026-03-31T08:05:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBeNull();
  });

  it("formats GitHub validation payloads into readable text", () => {
    expect(
      formatRepoActionErrorMessage(
        'Validation Failed: {"resource":"PullRequest","code":"custom","message":"A pull request already exists for chaqchase:feat/new."} - https://docs.github.com/rest/pulls/pulls#create-a-pull-request',
      ),
    ).toBe("A pull request already exists for chaqchase:feat/new.");
  });

  it("strips GitHub docs links from plain error messages", () => {
    expect(
      formatRepoActionErrorMessage(
        "Unable to create PR. - https://docs.github.com/rest/pulls/pulls#create-a-pull-request",
      ),
    ).toBe("Unable to create PR.");
  });
});
