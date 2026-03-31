import { describe, expect, it } from "bun:test";

import {
  getRepoPullRequestMergeLabel,
  summarizeWorkspaceRepoStatus,
} from "./pull-request-status";

describe("pull request status helpers", () => {
  it("formats merge status labels for UI copy", () => {
    expect(getRepoPullRequestMergeLabel("ready")).toBe("Ready to merge");
    expect(getRepoPullRequestMergeLabel("checks_failed")).toBe(
      "Checks failing",
    );
    expect(getRepoPullRequestMergeLabel("awaiting_review")).toBe(
      "Awaiting review",
    );
  });

  it("summarizes live pull request state when a branch has an active PR", () => {
    expect(
      summarizeWorkspaceRepoStatus({
        aheadCount: 0,
        branch: "feature/pr-status",
        githubRemote: {
          owner: "openai",
          repo: "sentinel",
        },
        hasChanges: false,
        integrationStatus: "connected",
        pullRequestStatus: {
          additions: 12,
          baseBranch: "main",
          branch: "feature/pr-status",
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
          title: "Add PR status sidebar",
          updatedAt: "2026-03-31T08:05:00.000Z",
          url: "https://github.com/openai/sentinel/pull/42",
        },
      }),
    ).toBe("PR #42 · Ready to merge");
  });

  it("falls back to ahead-count and integration state when no PR exists", () => {
    expect(
      summarizeWorkspaceRepoStatus({
        aheadCount: 2,
        branch: "feature/pr-status",
        githubRemote: {
          owner: "openai",
          repo: "sentinel",
        },
        hasChanges: false,
        integrationStatus: "connected",
        pullRequestStatus: null,
      }),
    ).toBe("No PR · 2 commits ahead");

    expect(
      summarizeWorkspaceRepoStatus({
        aheadCount: 0,
        branch: "feature/pr-status",
        githubRemote: {
          owner: "openai",
          repo: "sentinel",
        },
        hasChanges: false,
        integrationStatus: "needs_github",
        pullRequestStatus: null,
      }),
    ).toBe("Connect GitHub for live PR status");
  });
});
