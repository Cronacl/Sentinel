import { describe, expect, it } from "bun:test";

import {
  buildCreatePullRequestInput,
  buildGenerateCommitMessageInput,
  formatRepoActionErrorMessage,
  getActivePullRequestUrl,
  getGeneratedCommitPromptValue,
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
