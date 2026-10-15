import { tool } from "ai";
import { z } from "zod";
import { withToolApproval } from "@/lib/ai/chat/tools/approval";

import type { IntegrationContext } from "../../types";
import { GitHubService } from "./service";

function getGitHubService(context: IntegrationContext): GitHubService {
  const token = context.tokens.github;
  if (!token) {
    throw new Error(
      "GitHub is not connected. Connect it in Settings > Integrations.",
    );
  }
  return new GitHubService(token);
}

const MAX_BODY_FOR_MODEL = 3000;

function truncateBody(text: string): string {
  if (text.length <= MAX_BODY_FOR_MODEL) return text;
  return text.slice(0, MAX_BODY_FOR_MODEL) + "\n...[truncated]";
}

const repoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  description: z.string(),
  htmlUrl: z.string(),
  language: z.string(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  visibility: z.string(),
  defaultBranch: z.string(),
  updatedAt: z.string(),
  owner: z.string(),
  isPrivate: z.boolean(),
});

const issueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  htmlUrl: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  author: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  comments: z.number(),
  milestone: z.string(),
});

const prSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  htmlUrl: z.string(),
  labels: z.array(z.string()),
  author: z.string(),
  head: z.string(),
  base: z.string(),
  draft: z.boolean(),
  merged: z.boolean(),
  mergeable: z.boolean().nullable(),
  reviewDecision: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  comments: z.number(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
});

const commentSchema = z.object({
  id: z.number(),
  body: z.string(),
  htmlUrl: z.string(),
  author: z.string(),
  createdAt: z.string(),
});

const branchSchema = z.object({
  name: z.string(),
  sha: z.string(),
  protected: z.boolean(),
});

const runSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  htmlUrl: z.string(),
  branch: z.string(),
  event: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  runNumber: z.number(),
  actor: z.string(),
});

const releaseSchema = z.object({
  id: z.number(),
  tagName: z.string(),
  name: z.string(),
  body: z.string(),
  htmlUrl: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  createdAt: z.string(),
  publishedAt: z.string(),
  author: z.string(),
  assets: z.array(
    z.object({
      name: z.string(),
      downloadUrl: z.string(),
      size: z.number(),
    }),
  ),
});

const ownerRepoInput = {
  owner: z.string().describe("Repository owner (user or organization)."),
  repo: z.string().describe("Repository name."),
};

export function buildGitHubTools(
  context: IntegrationContext,
  approvalFn: (toolName: string) => boolean,
) {
  return {
    // ── Repos ──────────────────────────────────────────────
    gh_search_repos: withToolApproval(
      tool({
        description:
          "Search GitHub repositories by name, description, topic, or language.",
        inputSchema: z.object({
          query: z.string().describe("Search query (GitHub search syntax)."),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 20)."),
        }),
        outputSchema: z.object({
          repos: z.array(repoSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.searchRepos(input);
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            totalCount: output.totalCount,
            repos: output.repos.map((r) => ({
              fullName: r.fullName,
              description: truncateBody(r.description),
              stars: r.stars,
              language: r.language,
              htmlUrl: r.htmlUrl,
            })),
          },
        }),
      }),
      () => approvalFn("gh_search_repos"),
    ),

    gh_list_repos: withToolApproval(
      tool({
        description:
          "List repositories for the authenticated user, sorted by recently updated.",
        inputSchema: z.object({
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 30)."),
          sort: z
            .enum(["updated", "created", "pushed", "full_name"])
            .optional()
            .describe("Sort order."),
        }),
        outputSchema: z.object({ repos: z.array(repoSchema) }),
        execute: async (input) => {
          const service = getGitHubService(context);
          const repos = await service.listRepos(input);
          return { repos };
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            repos: output.repos.map((r) => ({
              fullName: r.fullName,
              description: truncateBody(r.description),
              stars: r.stars,
              language: r.language,
            })),
          },
        }),
      }),
      () => approvalFn("gh_list_repos"),
    ),

    gh_get_repo: withToolApproval(
      tool({
        description:
          "Get detailed information about a specific GitHub repository.",
        inputSchema: z.object(ownerRepoInput),
        outputSchema: repoSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.getRepo(input.owner, input.repo);
        },
      }),
      () => approvalFn("gh_get_repo"),
    ),

    // ── Issues ─────────────────────────────────────────────
    gh_list_issues: withToolApproval(
      tool({
        description: "List issues for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          state: z
            .enum(["open", "closed", "all"])
            .optional()
            .describe("Filter by state (default open)."),
          labels: z
            .string()
            .optional()
            .describe("Comma-separated label names to filter by."),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 30)."),
        }),
        outputSchema: z.object({ issues: z.array(issueSchema) }),
        execute: async (input) => {
          const service = getGitHubService(context);
          const issues = await service.listIssues(input);
          return { issues };
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            issues: output.issues.map((i) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              labels: i.labels,
              author: i.author,
              htmlUrl: i.htmlUrl,
            })),
          },
        }),
      }),
      () => approvalFn("gh_list_issues"),
    ),

    gh_get_issue: withToolApproval(
      tool({
        description: "Get full details of a specific GitHub issue.",
        inputSchema: z.object({
          ...ownerRepoInput,
          issueNumber: z.number().describe("Issue number."),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.getIssue(input.owner, input.repo, input.issueNumber);
        },
      }),
      () => approvalFn("gh_get_issue"),
    ),

    gh_create_issue: withToolApproval(
      tool({
        description: "Create a new issue in a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          title: z.string().describe("Issue title."),
          body: z.string().optional().describe("Issue body (Markdown)."),
          labels: z.array(z.string()).optional().describe("Label names."),
          assignees: z
            .array(z.string())
            .optional()
            .describe("Usernames to assign."),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.createIssue(input);
        },
      }),
      () => approvalFn("gh_create_issue"),
    ),

    gh_update_issue: withToolApproval(
      tool({
        description:
          "Update an existing GitHub issue (title, body, labels, assignees, state).",
        inputSchema: z.object({
          ...ownerRepoInput,
          issueNumber: z.number().describe("Issue number."),
          title: z.string().optional().describe("New title."),
          body: z.string().optional().describe("New body."),
          state: z.enum(["open", "closed"]).optional().describe("New state."),
          labels: z.array(z.string()).optional().describe("Replace labels."),
          assignees: z
            .array(z.string())
            .optional()
            .describe("Replace assignees."),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.updateIssue(input);
        },
      }),
      () => approvalFn("gh_update_issue"),
    ),

    gh_close_issue: withToolApproval(
      tool({
        description: "Close a GitHub issue.",
        inputSchema: z.object({
          ...ownerRepoInput,
          issueNumber: z.number().describe("Issue number to close."),
        }),
        outputSchema: issueSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.closeIssue(input.owner, input.repo, input.issueNumber);
        },
      }),
      () => approvalFn("gh_close_issue"),
    ),

    gh_add_issue_comment: withToolApproval(
      tool({
        description: "Add a comment to a GitHub issue.",
        inputSchema: z.object({
          ...ownerRepoInput,
          issueNumber: z.number().describe("Issue number."),
          body: z.string().describe("Comment body (Markdown)."),
        }),
        outputSchema: commentSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.addIssueComment(input);
        },
      }),
      () => approvalFn("gh_add_issue_comment"),
    ),

    // ── Pull Requests ──────────────────────────────────────
    gh_list_prs: withToolApproval(
      tool({
        description: "List pull requests for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          state: z
            .enum(["open", "closed", "all"])
            .optional()
            .describe("Filter by state (default open)."),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 30)."),
        }),
        outputSchema: z.object({ prs: z.array(prSchema) }),
        execute: async (input) => {
          const service = getGitHubService(context);
          const prs = await service.listPrs(input);
          return { prs };
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            prs: output.prs.map((p) => ({
              number: p.number,
              title: p.title,
              state: p.state,
              author: p.author,
              head: p.head,
              base: p.base,
              draft: p.draft,
              htmlUrl: p.htmlUrl,
            })),
          },
        }),
      }),
      () => approvalFn("gh_list_prs"),
    ),

    gh_get_pr: withToolApproval(
      tool({
        description: "Get full details of a specific pull request.",
        inputSchema: z.object({
          ...ownerRepoInput,
          prNumber: z.number().describe("Pull request number."),
        }),
        outputSchema: prSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.getPr(input.owner, input.repo, input.prNumber);
        },
      }),
      () => approvalFn("gh_get_pr"),
    ),

    gh_create_pr: withToolApproval(
      tool({
        description: "Create a new pull request.",
        inputSchema: z.object({
          ...ownerRepoInput,
          title: z.string().describe("PR title."),
          body: z.string().optional().describe("PR description (Markdown)."),
          head: z.string().describe("Branch containing changes."),
          base: z.string().describe("Branch to merge into."),
          draft: z.boolean().optional().describe("Create as draft PR."),
        }),
        outputSchema: prSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.createPr(input);
        },
      }),
      () => approvalFn("gh_create_pr"),
    ),

    gh_merge_pr: withToolApproval(
      tool({
        description: "Merge a pull request.",
        inputSchema: z.object({
          ...ownerRepoInput,
          prNumber: z.number().describe("Pull request number."),
          mergeMethod: z
            .enum(["merge", "squash", "rebase"])
            .optional()
            .describe("Merge strategy (default merge)."),
          commitTitle: z
            .string()
            .optional()
            .describe("Custom merge commit title."),
        }),
        outputSchema: z.object({
          merged: z.boolean(),
          message: z.string(),
          sha: z.string(),
        }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.mergePr(input);
        },
      }),
      () => approvalFn("gh_merge_pr"),
    ),

    gh_review_pr: withToolApproval(
      tool({
        description:
          "Submit a review on a pull request (approve, request changes, or comment).",
        inputSchema: z.object({
          ...ownerRepoInput,
          prNumber: z.number().describe("Pull request number."),
          event: z
            .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
            .describe("Review action."),
          body: z.string().optional().describe("Review comment body."),
        }),
        outputSchema: z.object({
          id: z.number(),
          state: z.string(),
          htmlUrl: z.string(),
        }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.reviewPr(input);
        },
      }),
      () => approvalFn("gh_review_pr"),
    ),

    gh_add_pr_comment: withToolApproval(
      tool({
        description: "Add a comment to a pull request.",
        inputSchema: z.object({
          ...ownerRepoInput,
          prNumber: z.number().describe("Pull request number."),
          body: z.string().describe("Comment body (Markdown)."),
        }),
        outputSchema: commentSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.addPrComment(input);
        },
      }),
      () => approvalFn("gh_add_pr_comment"),
    ),

    // ── Code Search ────────────────────────────────────────
    gh_search_code: withToolApproval(
      tool({
        description:
          "Search code across GitHub repositories. Use GitHub code search syntax.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Code search query (GitHub search syntax, e.g. 'useState repo:facebook/react').",
            ),
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 20)."),
        }),
        outputSchema: z.object({
          results: z.array(
            z.object({
              name: z.string(),
              path: z.string(),
              htmlUrl: z.string(),
              repository: z.string(),
              textMatches: z.array(z.string()),
            }),
          ),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.searchCode(input);
        },
      }),
      () => approvalFn("gh_search_code"),
    ),

    // ── Branches ───────────────────────────────────────────
    gh_list_branches: withToolApproval(
      tool({
        description: "List branches for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 30)."),
        }),
        outputSchema: z.object({ branches: z.array(branchSchema) }),
        execute: async (input) => {
          const service = getGitHubService(context);
          const branches = await service.listBranches(input);
          return { branches };
        },
      }),
      () => approvalFn("gh_list_branches"),
    ),

    gh_create_branch: withToolApproval(
      tool({
        description: "Create a new branch from a given commit SHA.",
        inputSchema: z.object({
          ...ownerRepoInput,
          branchName: z.string().describe("Name for the new branch."),
          sha: z.string().describe("Commit SHA to branch from."),
        }),
        outputSchema: branchSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.createBranch(input);
        },
      }),
      () => approvalFn("gh_create_branch"),
    ),

    // ── Actions ────────────────────────────────────────────
    gh_list_runs: withToolApproval(
      tool({
        description: "List recent workflow runs for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 20)."),
          branch: z.string().optional().describe("Filter by branch."),
          status: z
            .string()
            .optional()
            .describe(
              "Filter by status (e.g. completed, in_progress, queued).",
            ),
        }),
        outputSchema: z.object({
          runs: z.array(runSchema),
          totalCount: z.number(),
        }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.listRuns(input);
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            totalCount: output.totalCount,
            runs: output.runs.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status,
              conclusion: r.conclusion,
              branch: r.branch,
              htmlUrl: r.htmlUrl,
            })),
          },
        }),
      }),
      () => approvalFn("gh_list_runs"),
    ),

    gh_get_run_logs: withToolApproval(
      tool({
        description:
          "Get the download URL for workflow run logs (returns a URL to the log archive).",
        inputSchema: z.object({
          ...ownerRepoInput,
          runId: z.number().describe("Workflow run ID."),
        }),
        outputSchema: z.object({ url: z.string() }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.getRunLogs(input.owner, input.repo, input.runId);
        },
      }),
      () => approvalFn("gh_get_run_logs"),
    ),

    gh_rerun_workflow: withToolApproval(
      tool({
        description: "Re-run a failed or completed workflow run.",
        inputSchema: z.object({
          ...ownerRepoInput,
          runId: z.number().describe("Workflow run ID to re-run."),
        }),
        outputSchema: z.object({ success: z.boolean() }),
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.rerunWorkflow(input.owner, input.repo, input.runId);
        },
      }),
      () => approvalFn("gh_rerun_workflow"),
    ),

    // ── Releases ───────────────────────────────────────────
    gh_list_releases: withToolApproval(
      tool({
        description: "List releases for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          maxResults: z
            .number()
            .optional()
            .describe("Max results (default 20)."),
        }),
        outputSchema: z.object({ releases: z.array(releaseSchema) }),
        execute: async (input) => {
          const service = getGitHubService(context);
          const releases = await service.listReleases(input);
          return { releases };
        },
        toModelOutput: ({ output }) => ({
          type: "json" as const,
          value: {
            releases: output.releases.map((r) => ({
              tagName: r.tagName,
              name: r.name,
              htmlUrl: r.htmlUrl,
              draft: r.draft,
              prerelease: r.prerelease,
              publishedAt: r.publishedAt,
            })),
          },
        }),
      }),
      () => approvalFn("gh_list_releases"),
    ),

    gh_create_release: withToolApproval(
      tool({
        description: "Create a new release for a GitHub repository.",
        inputSchema: z.object({
          ...ownerRepoInput,
          tagName: z.string().describe("Tag name for the release."),
          name: z.string().optional().describe("Release title."),
          body: z.string().optional().describe("Release notes (Markdown)."),
          draft: z.boolean().optional().describe("Create as draft."),
          prerelease: z.boolean().optional().describe("Mark as pre-release."),
          targetCommitish: z
            .string()
            .optional()
            .describe(
              "Branch or commit SHA to tag (defaults to default branch).",
            ),
        }),
        outputSchema: releaseSchema,
        execute: async (input) => {
          const service = getGitHubService(context);
          return service.createRelease(input);
        },
      }),
      () => approvalFn("gh_create_release"),
    ),
  };
}
