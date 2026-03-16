import { tool } from "ai";
import { z } from "zod";

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
    gh_search_repos: tool({
      description:
        "Search GitHub repositories by name, description, topic, or language.",
      inputSchema: z.object({
        query: z.string().describe("Search query (GitHub search syntax)."),
        maxResults: z.number().optional().describe("Max results (default 20)."),
      }),
      outputSchema: z.object({
        repos: z.array(repoSchema),
        totalCount: z.number(),
      }),
      needsApproval: () => approvalFn("gh_search_repos"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.searchRepos(input);
      },
      experimental_toModelOutput: ({ output }) => ({
        totalCount: output.totalCount,
        repos: output.repos.map((r) => ({
          fullName: r.fullName,
          description: truncateBody(r.description),
          stars: r.stars,
          language: r.language,
          htmlUrl: r.htmlUrl,
        })),
      }),
    }),

    gh_list_repos: tool({
      description:
        "List repositories for the authenticated user, sorted by recently updated.",
      inputSchema: z.object({
        maxResults: z.number().optional().describe("Max results (default 30)."),
        sort: z
          .enum(["updated", "created", "pushed", "full_name"])
          .optional()
          .describe("Sort order."),
      }),
      outputSchema: z.object({ repos: z.array(repoSchema) }),
      needsApproval: () => approvalFn("gh_list_repos"),
      execute: async (input) => {
        const service = getGitHubService(context);
        const repos = await service.listRepos(input);
        return { repos };
      },
      experimental_toModelOutput: ({ output }) => ({
        repos: output.repos.map((r) => ({
          fullName: r.fullName,
          description: truncateBody(r.description),
          stars: r.stars,
          language: r.language,
        })),
      }),
    }),

    gh_get_repo: tool({
      description: "Get detailed information about a specific GitHub repository.",
      inputSchema: z.object(ownerRepoInput),
      outputSchema: repoSchema,
      needsApproval: () => approvalFn("gh_get_repo"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.getRepo(input.owner, input.repo);
      },
    }),

    // ── Issues ─────────────────────────────────────────────
    gh_list_issues: tool({
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
        maxResults: z.number().optional().describe("Max results (default 30)."),
      }),
      outputSchema: z.object({ issues: z.array(issueSchema) }),
      needsApproval: () => approvalFn("gh_list_issues"),
      execute: async (input) => {
        const service = getGitHubService(context);
        const issues = await service.listIssues(input);
        return { issues };
      },
      experimental_toModelOutput: ({ output }) => ({
        issues: output.issues.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: i.labels,
          author: i.author,
          htmlUrl: i.htmlUrl,
        })),
      }),
    }),

    gh_get_issue: tool({
      description: "Get full details of a specific GitHub issue.",
      inputSchema: z.object({
        ...ownerRepoInput,
        issueNumber: z.number().describe("Issue number."),
      }),
      outputSchema: issueSchema,
      needsApproval: () => approvalFn("gh_get_issue"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.getIssue(input.owner, input.repo, input.issueNumber);
      },
    }),

    gh_create_issue: tool({
      description: "Create a new issue in a GitHub repository.",
      inputSchema: z.object({
        ...ownerRepoInput,
        title: z.string().describe("Issue title."),
        body: z.string().optional().describe("Issue body (Markdown)."),
        labels: z.array(z.string()).optional().describe("Label names."),
        assignees: z.array(z.string()).optional().describe("Usernames to assign."),
      }),
      outputSchema: issueSchema,
      needsApproval: () => approvalFn("gh_create_issue"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.createIssue(input);
      },
    }),

    gh_update_issue: tool({
      description: "Update an existing GitHub issue (title, body, labels, assignees, state).",
      inputSchema: z.object({
        ...ownerRepoInput,
        issueNumber: z.number().describe("Issue number."),
        title: z.string().optional().describe("New title."),
        body: z.string().optional().describe("New body."),
        state: z.enum(["open", "closed"]).optional().describe("New state."),
        labels: z.array(z.string()).optional().describe("Replace labels."),
        assignees: z.array(z.string()).optional().describe("Replace assignees."),
      }),
      outputSchema: issueSchema,
      needsApproval: () => approvalFn("gh_update_issue"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.updateIssue(input);
      },
    }),

    gh_close_issue: tool({
      description: "Close a GitHub issue.",
      inputSchema: z.object({
        ...ownerRepoInput,
        issueNumber: z.number().describe("Issue number to close."),
      }),
      outputSchema: issueSchema,
      needsApproval: () => approvalFn("gh_close_issue"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.closeIssue(input.owner, input.repo, input.issueNumber);
      },
    }),

    gh_add_issue_comment: tool({
      description: "Add a comment to a GitHub issue.",
      inputSchema: z.object({
        ...ownerRepoInput,
        issueNumber: z.number().describe("Issue number."),
        body: z.string().describe("Comment body (Markdown)."),
      }),
      outputSchema: commentSchema,
      needsApproval: () => approvalFn("gh_add_issue_comment"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.addIssueComment(input);
      },
    }),

    // ── Pull Requests ──────────────────────────────────────
    gh_list_prs: tool({
      description: "List pull requests for a GitHub repository.",
      inputSchema: z.object({
        ...ownerRepoInput,
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Filter by state (default open)."),
        maxResults: z.number().optional().describe("Max results (default 30)."),
      }),
      outputSchema: z.object({ prs: z.array(prSchema) }),
      needsApproval: () => approvalFn("gh_list_prs"),
      execute: async (input) => {
        const service = getGitHubService(context);
        const prs = await service.listPrs(input);
        return { prs };
      },
      experimental_toModelOutput: ({ output }) => ({
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
      }),
    }),

    gh_get_pr: tool({
      description: "Get full details of a specific pull request.",
      inputSchema: z.object({
        ...ownerRepoInput,
        prNumber: z.number().describe("Pull request number."),
      }),
      outputSchema: prSchema,
      needsApproval: () => approvalFn("gh_get_pr"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.getPr(input.owner, input.repo, input.prNumber);
      },
    }),

    gh_create_pr: tool({
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
      needsApproval: () => approvalFn("gh_create_pr"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.createPr(input);
      },
    }),

    gh_merge_pr: tool({
      description: "Merge a pull request.",
      inputSchema: z.object({
        ...ownerRepoInput,
        prNumber: z.number().describe("Pull request number."),
        mergeMethod: z
          .enum(["merge", "squash", "rebase"])
          .optional()
          .describe("Merge strategy (default merge)."),
        commitTitle: z.string().optional().describe("Custom merge commit title."),
      }),
      outputSchema: z.object({
        merged: z.boolean(),
        message: z.string(),
        sha: z.string(),
      }),
      needsApproval: () => approvalFn("gh_merge_pr"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.mergePr(input);
      },
    }),

    gh_review_pr: tool({
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
      needsApproval: () => approvalFn("gh_review_pr"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.reviewPr(input);
      },
    }),

    gh_add_pr_comment: tool({
      description: "Add a comment to a pull request.",
      inputSchema: z.object({
        ...ownerRepoInput,
        prNumber: z.number().describe("Pull request number."),
        body: z.string().describe("Comment body (Markdown)."),
      }),
      outputSchema: commentSchema,
      needsApproval: () => approvalFn("gh_add_pr_comment"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.addPrComment(input);
      },
    }),

    // ── Code Search ────────────────────────────────────────
    gh_search_code: tool({
      description:
        "Search code across GitHub repositories. Use GitHub code search syntax.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Code search query (GitHub search syntax, e.g. 'useState repo:facebook/react')."),
        maxResults: z.number().optional().describe("Max results (default 20)."),
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
      needsApproval: () => approvalFn("gh_search_code"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.searchCode(input);
      },
    }),

    // ── Branches ───────────────────────────────────────────
    gh_list_branches: tool({
      description: "List branches for a GitHub repository.",
      inputSchema: z.object({
        ...ownerRepoInput,
        maxResults: z.number().optional().describe("Max results (default 30)."),
      }),
      outputSchema: z.object({ branches: z.array(branchSchema) }),
      needsApproval: () => approvalFn("gh_list_branches"),
      execute: async (input) => {
        const service = getGitHubService(context);
        const branches = await service.listBranches(input);
        return { branches };
      },
    }),

    gh_create_branch: tool({
      description:
        "Create a new branch from a given commit SHA.",
      inputSchema: z.object({
        ...ownerRepoInput,
        branchName: z.string().describe("Name for the new branch."),
        sha: z.string().describe("Commit SHA to branch from."),
      }),
      outputSchema: branchSchema,
      needsApproval: () => approvalFn("gh_create_branch"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.createBranch(input);
      },
    }),

    // ── Actions ────────────────────────────────────────────
    gh_list_runs: tool({
      description: "List recent workflow runs for a GitHub repository.",
      inputSchema: z.object({
        ...ownerRepoInput,
        maxResults: z.number().optional().describe("Max results (default 20)."),
        branch: z.string().optional().describe("Filter by branch."),
        status: z
          .string()
          .optional()
          .describe("Filter by status (e.g. completed, in_progress, queued)."),
      }),
      outputSchema: z.object({
        runs: z.array(runSchema),
        totalCount: z.number(),
      }),
      needsApproval: () => approvalFn("gh_list_runs"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.listRuns(input);
      },
      experimental_toModelOutput: ({ output }) => ({
        totalCount: output.totalCount,
        runs: output.runs.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          branch: r.branch,
          htmlUrl: r.htmlUrl,
        })),
      }),
    }),

    gh_get_run_logs: tool({
      description:
        "Get the download URL for workflow run logs (returns a URL to the log archive).",
      inputSchema: z.object({
        ...ownerRepoInput,
        runId: z.number().describe("Workflow run ID."),
      }),
      outputSchema: z.object({ url: z.string() }),
      needsApproval: () => approvalFn("gh_get_run_logs"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.getRunLogs(input.owner, input.repo, input.runId);
      },
    }),

    gh_rerun_workflow: tool({
      description: "Re-run a failed or completed workflow run.",
      inputSchema: z.object({
        ...ownerRepoInput,
        runId: z.number().describe("Workflow run ID to re-run."),
      }),
      outputSchema: z.object({ success: z.boolean() }),
      needsApproval: () => approvalFn("gh_rerun_workflow"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.rerunWorkflow(input.owner, input.repo, input.runId);
      },
    }),

    // ── Releases ───────────────────────────────────────────
    gh_list_releases: tool({
      description: "List releases for a GitHub repository.",
      inputSchema: z.object({
        ...ownerRepoInput,
        maxResults: z.number().optional().describe("Max results (default 20)."),
      }),
      outputSchema: z.object({ releases: z.array(releaseSchema) }),
      needsApproval: () => approvalFn("gh_list_releases"),
      execute: async (input) => {
        const service = getGitHubService(context);
        const releases = await service.listReleases(input);
        return { releases };
      },
      experimental_toModelOutput: ({ output }) => ({
        releases: output.releases.map((r) => ({
          tagName: r.tagName,
          name: r.name,
          htmlUrl: r.htmlUrl,
          draft: r.draft,
          prerelease: r.prerelease,
          publishedAt: r.publishedAt,
        })),
      }),
    }),

    gh_create_release: tool({
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
          .describe("Branch or commit SHA to tag (defaults to default branch)."),
      }),
      outputSchema: releaseSchema,
      needsApproval: () => approvalFn("gh_create_release"),
      execute: async (input) => {
        const service = getGitHubService(context);
        return service.createRelease(input);
      },
    }),
  };
}
