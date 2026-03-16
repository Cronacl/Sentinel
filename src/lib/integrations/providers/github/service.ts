import "server-only";

import { Octokit } from "@octokit/rest";

export type GHRepo = {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  visibility: string;
  defaultBranch: string;
  updatedAt: string;
  owner: string;
  isPrivate: boolean;
};

export type GHIssue = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  assignees: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  milestone: string;
};

export type GHPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  author: string;
  head: string;
  base: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  reviewDecision: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type GHBranch = {
  name: string;
  sha: string;
  protected: boolean;
};

export type GHCodeResult = {
  name: string;
  path: string;
  htmlUrl: string;
  repository: string;
  textMatches: string[];
};

export type GHWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  runNumber: number;
  actor: string;
};

export type GHRelease = {
  id: number;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string;
  author: string;
  assets: { name: string; downloadUrl: string; size: number }[];
};

export type GHComment = {
  id: number;
  body: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
};

function parseRepo(r: Record<string, unknown>): GHRepo {
  return {
    id: r.id as number,
    name: r.name as string,
    fullName: r.full_name as string,
    description: (r.description as string) ?? "",
    htmlUrl: r.html_url as string,
    language: (r.language as string) ?? "",
    stars: r.stargazers_count as number,
    forks: r.forks_count as number,
    openIssues: r.open_issues_count as number,
    visibility: r.visibility as string,
    defaultBranch: r.default_branch as string,
    updatedAt: r.updated_at as string,
    owner: (r.owner as { login: string })?.login ?? "",
    isPrivate: r.private as boolean,
  };
}

function parseIssue(i: Record<string, unknown>): GHIssue {
  return {
    id: i.id as number,
    number: i.number as number,
    title: i.title as string,
    body: ((i.body as string) ?? "").slice(0, 5000),
    state: i.state as string,
    htmlUrl: i.html_url as string,
    labels: ((i.labels as { name: string }[]) ?? []).map((l) => l.name),
    assignees: ((i.assignees as { login: string }[]) ?? []).map(
      (a) => a.login,
    ),
    author: (i.user as { login: string })?.login ?? "",
    createdAt: i.created_at as string,
    updatedAt: i.updated_at as string,
    comments: i.comments as number,
    milestone:
      (i.milestone as { title: string } | null)?.title ?? "",
  };
}

function parsePR(p: Record<string, unknown>): GHPullRequest {
  const head = p.head as { ref: string } | undefined;
  const base = p.base as { ref: string } | undefined;
  return {
    id: p.id as number,
    number: p.number as number,
    title: p.title as string,
    body: ((p.body as string) ?? "").slice(0, 5000),
    state: p.state as string,
    htmlUrl: p.html_url as string,
    labels: ((p.labels as { name: string }[]) ?? []).map((l) => l.name),
    author: (p.user as { login: string })?.login ?? "",
    head: head?.ref ?? "",
    base: base?.ref ?? "",
    draft: (p.draft as boolean) ?? false,
    merged: (p.merged as boolean) ?? false,
    mergeable: (p.mergeable as boolean | null) ?? null,
    reviewDecision: "",
    createdAt: p.created_at as string,
    updatedAt: p.updated_at as string,
    comments: (p.comments as number) ?? 0,
    additions: (p.additions as number) ?? 0,
    deletions: (p.deletions as number) ?? 0,
    changedFiles: (p.changed_files as number) ?? 0,
  };
}

export class GitHubService {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  async searchRepos(params: {
    query: string;
    maxResults?: number;
  }): Promise<{ repos: GHRepo[]; totalCount: number }> {
    const { data } = await this.octokit.search.repos({
      q: params.query,
      per_page: params.maxResults ?? 20,
      sort: "updated",
    });
    return {
      repos: data.items.map((r) => parseRepo(r as unknown as Record<string, unknown>)),
      totalCount: data.total_count,
    };
  }

  async listRepos(params?: {
    maxResults?: number;
    sort?: "updated" | "created" | "pushed" | "full_name";
  }): Promise<GHRepo[]> {
    const { data } = await this.octokit.repos.listForAuthenticatedUser({
      per_page: params?.maxResults ?? 30,
      sort: params?.sort ?? "updated",
    });
    return data.map((r) => parseRepo(r as unknown as Record<string, unknown>));
  }

  async getRepo(owner: string, repo: string): Promise<GHRepo> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return parseRepo(data as unknown as Record<string, unknown>);
  }

  async listIssues(params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    maxResults?: number;
    labels?: string;
  }): Promise<GHIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      per_page: params.maxResults ?? 30,
      labels: params.labels,
    });
    return data
      .filter((i) => !i.pull_request)
      .map((i) => parseIssue(i as unknown as Record<string, unknown>));
  }

  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GHIssue> {
    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return parseIssue(data as unknown as Record<string, unknown>);
  }

  async createIssue(params: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }): Promise<GHIssue> {
    const { data } = await this.octokit.issues.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
      milestone: params.milestone,
    });
    return parseIssue(data as unknown as Record<string, unknown>);
  }

  async updateIssue(params: {
    owner: string;
    repo: string;
    issueNumber: number;
    title?: string;
    body?: string;
    state?: "open" | "closed";
    labels?: string[];
    assignees?: string[];
  }): Promise<GHIssue> {
    const { data } = await this.octokit.issues.update({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      title: params.title,
      body: params.body,
      state: params.state,
      labels: params.labels,
      assignees: params.assignees,
    });
    return parseIssue(data as unknown as Record<string, unknown>);
  }

  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<GHIssue> {
    const { data } = await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: "closed",
    });
    return parseIssue(data as unknown as Record<string, unknown>);
  }

  async addIssueComment(params: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  }): Promise<GHComment> {
    const { data } = await this.octokit.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      body: params.body,
    });
    return {
      id: data.id,
      body: data.body ?? "",
      htmlUrl: data.html_url,
      author: data.user?.login ?? "",
      createdAt: data.created_at,
    };
  }

  async listPrs(params: {
    owner: string;
    repo: string;
    state?: "open" | "closed" | "all";
    maxResults?: number;
  }): Promise<GHPullRequest[]> {
    const { data } = await this.octokit.pulls.list({
      owner: params.owner,
      repo: params.repo,
      state: params.state ?? "open",
      per_page: params.maxResults ?? 30,
    });
    return data.map((p) => parsePR(p as unknown as Record<string, unknown>));
  }

  async getPr(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GHPullRequest> {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return parsePR(data as unknown as Record<string, unknown>);
  }

  async createPr(params: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<GHPullRequest> {
    const { data } = await this.octokit.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft,
    });
    return parsePR(data as unknown as Record<string, unknown>);
  }

  async mergePr(params: {
    owner: string;
    repo: string;
    prNumber: number;
    mergeMethod?: "merge" | "squash" | "rebase";
    commitTitle?: string;
  }): Promise<{ merged: boolean; message: string; sha: string }> {
    const { data } = await this.octokit.pulls.merge({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.prNumber,
      merge_method: params.mergeMethod ?? "merge",
      commit_title: params.commitTitle,
    });
    return {
      merged: data.merged,
      message: data.message,
      sha: data.sha,
    };
  }

  async reviewPr(params: {
    owner: string;
    repo: string;
    prNumber: number;
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
    body?: string;
  }): Promise<{ id: number; state: string; htmlUrl: string }> {
    const { data } = await this.octokit.pulls.createReview({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.prNumber,
      event: params.event,
      body: params.body,
    });
    return {
      id: data.id,
      state: data.state,
      htmlUrl: data.html_url,
    };
  }

  async addPrComment(params: {
    owner: string;
    repo: string;
    prNumber: number;
    body: string;
  }): Promise<GHComment> {
    const { data } = await this.octokit.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.prNumber,
      body: params.body,
    });
    return {
      id: data.id,
      body: data.body ?? "",
      htmlUrl: data.html_url,
      author: data.user?.login ?? "",
      createdAt: data.created_at,
    };
  }

  async searchCode(params: {
    query: string;
    maxResults?: number;
  }): Promise<{ results: GHCodeResult[]; totalCount: number }> {
    const { data } = await this.octokit.search.code({
      q: params.query,
      per_page: params.maxResults ?? 20,
    });
    return {
      results: data.items.map((item) => ({
        name: item.name,
        path: item.path,
        htmlUrl: item.html_url,
        repository: item.repository.full_name,
        textMatches: (
          (item as Record<string, unknown>).text_matches as
            | { fragment: string }[]
            | undefined
        )?.map((m) => m.fragment) ?? [],
      })),
      totalCount: data.total_count,
    };
  }

  async listBranches(params: {
    owner: string;
    repo: string;
    maxResults?: number;
  }): Promise<GHBranch[]> {
    const { data } = await this.octokit.repos.listBranches({
      owner: params.owner,
      repo: params.repo,
      per_page: params.maxResults ?? 30,
    });
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
  }

  async createBranch(params: {
    owner: string;
    repo: string;
    branchName: string;
    sha: string;
  }): Promise<GHBranch> {
    const { data } = await this.octokit.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${params.branchName}`,
      sha: params.sha,
    });
    return {
      name: params.branchName,
      sha: data.object.sha,
      protected: false,
    };
  }

  async listRuns(params: {
    owner: string;
    repo: string;
    maxResults?: number;
    branch?: string;
    status?: string;
  }): Promise<{ runs: GHWorkflowRun[]; totalCount: number }> {
    const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
      owner: params.owner,
      repo: params.repo,
      per_page: params.maxResults ?? 20,
      branch: params.branch,
      status: params.status as "completed" | undefined,
    });
    return {
      runs: data.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name ?? "",
        status: run.status ?? "",
        conclusion: run.conclusion ?? null,
        htmlUrl: run.html_url,
        branch: run.head_branch ?? "",
        event: run.event,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        runNumber: run.run_number,
        actor: run.actor?.login ?? "",
      })),
      totalCount: data.total_count,
    };
  }

  async getRunLogs(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<{ url: string }> {
    const { url } = await this.octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });
    return { url };
  }

  async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<{ success: boolean }> {
    await this.octokit.actions.reRunWorkflow({
      owner,
      repo,
      run_id: runId,
    });
    return { success: true };
  }

  async listReleases(params: {
    owner: string;
    repo: string;
    maxResults?: number;
  }): Promise<GHRelease[]> {
    const { data } = await this.octokit.repos.listReleases({
      owner: params.owner,
      repo: params.repo,
      per_page: params.maxResults ?? 20,
    });
    return data.map((r) => ({
      id: r.id,
      tagName: r.tag_name,
      name: r.name ?? "",
      body: ((r.body as string) ?? "").slice(0, 5000),
      htmlUrl: r.html_url,
      draft: r.draft,
      prerelease: r.prerelease,
      createdAt: r.created_at,
      publishedAt: r.published_at ?? "",
      author: r.author?.login ?? "",
      assets: r.assets.map((a) => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
      })),
    }));
  }

  async createRelease(params: {
    owner: string;
    repo: string;
    tagName: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    targetCommitish?: string;
  }): Promise<GHRelease> {
    const { data } = await this.octokit.repos.createRelease({
      owner: params.owner,
      repo: params.repo,
      tag_name: params.tagName,
      name: params.name,
      body: params.body,
      draft: params.draft,
      prerelease: params.prerelease,
      target_commitish: params.targetCommitish,
    });
    return {
      id: data.id,
      tagName: data.tag_name,
      name: data.name ?? "",
      body: ((data.body as string) ?? "").slice(0, 5000),
      htmlUrl: data.html_url,
      draft: data.draft,
      prerelease: data.prerelease,
      createdAt: data.created_at,
      publishedAt: data.published_at ?? "",
      author: data.author?.login ?? "",
      assets: data.assets.map((a) => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
      })),
    };
  }
}
