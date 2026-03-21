import { stat } from "node:fs/promises";

import { runCommand } from "@/lib/process/run-command";

export type RepoGitHubRemote = {
  defaultBranch: string | null;
  owner: string;
  pullRequestUrl: string | null;
  pullRequestsUrl: string;
  remoteName: string;
  remoteUrl: string;
  repo: string;
  repositoryUrl: string;
};

export type RepoContext = {
  aheadCount: number;
  branch: string | null;
  githubRemote: RepoGitHubRemote | null;
  hasChanges: boolean;
  hasCommits: boolean;
  hasRemotes: boolean;
  hasUpstream: boolean;
  isDefaultBranch: boolean;
  isGitRepo: boolean;
  pushRemoteName: string | null;
  repoRoot: string | null;
};

export type RepoBranch = {
  current: boolean;
  name: string;
};

type RepoFileChange = {
  path: string;
  type: "added" | "deleted" | "modified" | "renamed" | "untracked";
};

function emptyRepoContext(): RepoContext {
  return {
    aheadCount: 0,
    branch: null,
    githubRemote: null,
    hasChanges: false,
    hasCommits: false,
    hasRemotes: false,
    hasUpstream: false,
    isDefaultBranch: false,
    isGitRepo: false,
    pushRemoteName: null,
    repoRoot: null,
  };
}

function normalizeChangedPath(value: string) {
  const trimmed = value.trim();
  const renameParts = trimmed.split(" -> ");
  return renameParts[renameParts.length - 1]!.trim();
}

function mapGitStatusCode(code: string): RepoFileChange["type"] {
  if (code === "?") return "untracked";
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "R") return "renamed";
  return "modified";
}

function parseStatusChanges(statusOutput: string) {
  const changes: RepoFileChange[] = [];

  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const stagedCode = line[0] ?? " ";
    const unstagedCode = line[1] ?? " ";
    const rawPath = line.slice(3).trim();
    const path = normalizeChangedPath(rawPath);

    if (stagedCode === "?" && unstagedCode === "?") {
      changes.push({ path, type: "untracked" });
      continue;
    }

    const typeCode =
      stagedCode !== " " && stagedCode !== "?"
        ? stagedCode
        : unstagedCode !== " " && unstagedCode !== "?"
          ? unstagedCode
          : "M";

    changes.push({ path, type: mapGitStatusCode(typeCode) });
  }

  return changes;
}

function summarizeChangeType(type: RepoFileChange["type"]) {
  switch (type) {
    case "added":
      return "Add";
    case "deleted":
      return "Remove";
    case "renamed":
      return "Rename";
    case "untracked":
      return "Add";
    default:
      return "Update";
  }
}

function formatPathForCommit(pathValue: string) {
  const fileName = pathValue.split("/").filter(Boolean).at(-1) ?? pathValue;
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

export function buildFallbackCommitMessage(changes: RepoFileChange[]) {
  if (changes.length === 0) {
    return "Update repository";
  }

  if (changes.length === 1) {
    const change = changes[0]!;
    return `${summarizeChangeType(change.type)} ${formatPathForCommit(change.path)}`;
  }

  const uniqueTypes = new Set(changes.map((change) => change.type));
  if (uniqueTypes.size === 1) {
    const [type] = [...uniqueTypes];
    return `${summarizeChangeType(type!)} ${changes.length} files`;
  }

  return `Update ${changes.length} files`;
}

async function runGit(args: string[], cwd: string) {
  return await runCommand({
    args,
    command: "git",
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

async function ensureDirectory(pathValue: string | null | undefined) {
  const trimmed = pathValue?.trim();
  if (!trimmed) {
    return null;
  }

  const stats = await stat(trimmed).catch(() => null);
  if (!stats?.isDirectory()) {
    return null;
  }

  return trimmed;
}

async function resolveRepoRoot(pathValue: string) {
  const result = await runGit(["rev-parse", "--show-toplevel"], pathValue);
  if (result.code !== 0 || !result.stdout.trim()) {
    return null;
  }

  return result.stdout.trim();
}

function normalizeBranch(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "HEAD") {
    return null;
  }

  return trimmed;
}

function buildGitHubRemoteUrls(
  owner: string,
  repo: string,
  branch: string | null,
  defaultBranch: string | null,
) {
  const repositoryUrl = `https://github.com/${owner}/${repo}`;
  const pullRequestsUrl = `${repositoryUrl}/pulls`;
  const pullRequestUrl =
    branch && defaultBranch
      ? `${repositoryUrl}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch)}?expand=1`
      : null;

  return {
    pullRequestUrl,
    pullRequestsUrl,
    repositoryUrl,
  };
}

export function parseGitHubRemoteUrl(remoteUrl: string | null | undefined) {
  const value = remoteUrl?.trim();
  if (!value) {
    return null;
  }

  const scpLikeMatch = value.match(
    /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (scpLikeMatch) {
    return {
      owner: scpLikeMatch[1]!,
      repo: scpLikeMatch[2]!,
    };
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "github.com") {
      return null;
    }

    const [owner = "", repo = ""] = parsed.pathname
      .replace(/^\/+/, "")
      .replace(/\.git$/, "")
      .split("/");

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function listRemotes(repoRoot: string) {
  const remoteList = await runGit(["remote"], repoRoot);
  if (remoteList.code !== 0) {
    return [];
  }

  const names = remoteList.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const remotes = await Promise.all(
    names.map(async (name) => {
      const result = await runGit(
        ["config", "--get", `remote.${name}.url`],
        repoRoot,
      );
      return {
        name,
        url: result.code === 0 ? result.stdout.trim() : "",
      };
    }),
  );

  return remotes.filter((remote) => remote.url);
}

async function resolveDefaultBranch(repoRoot: string, remoteName: string) {
  const symbolicHead = await runGit(
    ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remoteName}/HEAD`],
    repoRoot,
  );
  if (symbolicHead.code === 0) {
    const shortRef = symbolicHead.stdout.trim();
    const prefix = `${remoteName}/`;
    if (shortRef.startsWith(prefix)) {
      return shortRef.slice(prefix.length);
    }
  }

  const remoteBranches = await runGit(
    ["for-each-ref", `refs/remotes/${remoteName}`, "--format=%(refname:short)"],
    repoRoot,
  );
  if (remoteBranches.code !== 0) {
    return null;
  }

  const branches = remoteBranches.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== `${remoteName}/HEAD`)
    .map((line) => line.replace(new RegExp(`^${remoteName}/`), ""));

  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";

  return branches[0] ?? null;
}

export async function resolveRepoContext(
  pathValue: string | null | undefined,
): Promise<RepoContext> {
  const directory = await ensureDirectory(pathValue);
  if (!directory) {
    return emptyRepoContext();
  }

  const repoRoot = await resolveRepoRoot(directory);
  if (!repoRoot) {
    return emptyRepoContext();
  }

  const [branchResult, statusResult, upstreamResult, remotes] =
    await Promise.all([
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
      runGit(["status", "--porcelain=v1"], repoRoot),
      runGit(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        repoRoot,
      ),
      listRemotes(repoRoot),
    ]);

  let branch = normalizeBranch(
    branchResult.code === 0 ? branchResult.stdout : null,
  );
  if (!branch) {
    const symbolicHead = await runGit(
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      repoRoot,
    );
    branch = normalizeBranch(
      symbolicHead.code === 0 ? symbolicHead.stdout : null,
    );
  }
  const hasChanges = Boolean(statusResult.stdout.trim());
  const upstreamRef =
    upstreamResult.code === 0 ? upstreamResult.stdout.trim() : null;
  const hasUpstream = Boolean(upstreamRef);
  const hasRemotes = remotes.length > 0;
  const headResult = await runGit(["rev-parse", "--verify", "HEAD"], repoRoot);
  const hasCommits = headResult.code === 0;

  const aheadResult = hasUpstream
    ? await runGit(["rev-list", "--count", "@{upstream}..HEAD"], repoRoot)
    : null;
  const aheadCount =
    aheadResult?.code === 0 ? Number.parseInt(aheadResult.stdout, 10) || 0 : 0;

  const preferredRemoteName = upstreamRef?.split("/")[0] ?? null;
  const pushRemoteName =
    preferredRemoteName &&
    remotes.some((remote) => remote.name === preferredRemoteName)
      ? preferredRemoteName
      : (remotes.find((remote) => remote.name === "origin")?.name ??
        remotes[0]?.name ??
        null);
  const githubRemoteMatch =
    remotes.find(
      (remote) =>
        remote.name === preferredRemoteName && parseGitHubRemoteUrl(remote.url),
    ) ?? remotes.find((remote) => parseGitHubRemoteUrl(remote.url));

  if (!githubRemoteMatch) {
    return {
      aheadCount,
      branch,
      githubRemote: null,
      hasChanges,
      hasCommits,
      hasRemotes,
      hasUpstream,
      isDefaultBranch: false,
      isGitRepo: true,
      pushRemoteName,
      repoRoot,
    };
  }

  const parsedRemote = parseGitHubRemoteUrl(githubRemoteMatch.url);
  if (!parsedRemote) {
    return {
      aheadCount,
      branch,
      githubRemote: null,
      hasChanges,
      hasCommits,
      hasRemotes,
      hasUpstream,
      isDefaultBranch: false,
      isGitRepo: true,
      pushRemoteName,
      repoRoot,
    };
  }

  const defaultBranch = await resolveDefaultBranch(
    repoRoot,
    githubRemoteMatch.name,
  );
  const urls = buildGitHubRemoteUrls(
    parsedRemote.owner,
    parsedRemote.repo,
    branch,
    defaultBranch,
  );

  return {
    aheadCount,
    branch,
    githubRemote: {
      defaultBranch,
      owner: parsedRemote.owner,
      pullRequestUrl: urls.pullRequestUrl,
      pullRequestsUrl: urls.pullRequestsUrl,
      remoteName: githubRemoteMatch.name,
      remoteUrl: githubRemoteMatch.url,
      repo: parsedRemote.repo,
      repositoryUrl: urls.repositoryUrl,
    },
    hasChanges,
    hasCommits,
    hasRemotes,
    hasUpstream,
    isDefaultBranch: Boolean(
      branch && defaultBranch && branch === defaultBranch,
    ),
    isGitRepo: true,
    pushRemoteName,
    repoRoot,
  };
}

async function resolveRepoRootOrThrow(pathValue: string | null | undefined) {
  const directory = await ensureDirectory(pathValue);
  if (!directory) {
    throw new Error("Workspace root path is not available.");
  }

  const repoRoot = await resolveRepoRoot(directory);
  if (!repoRoot) {
    throw new Error("The selected workspace root is not a git repository.");
  }

  return repoRoot;
}

export async function commitAllChanges(
  pathValue: string | null | undefined,
  message: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Commit message is required.");
  }

  const context = await resolveRepoContext(repoRoot);
  if (!context.hasChanges) {
    throw new Error("Commit requires changes in the working tree.");
  }

  const addResult = await runGit(["add", "-A"], repoRoot);
  if (addResult.code !== 0) {
    throw new Error(addResult.stderr || "Failed to stage changes.");
  }

  const commitResult = await runGit(["commit", "-m", trimmedMessage], repoRoot);
  if (commitResult.code !== 0) {
    throw new Error(commitResult.stderr || "Failed to create commit.");
  }

  const headResult = await runGit(["rev-parse", "HEAD"], repoRoot);
  if (headResult.code !== 0) {
    throw new Error(headResult.stderr || "Failed to read commit hash.");
  }

  return {
    commit: headResult.stdout.trim(),
    summary: commitResult.stdout.split("\n")[0] ?? "",
  };
}

export async function createAndCheckoutBranch(
  pathValue: string | null | undefined,
  branchName: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const trimmedName = branchName.trim();
  if (!trimmedName) {
    throw new Error("Branch name is required.");
  }

  const validation = await runGit(
    ["check-ref-format", "--branch", trimmedName],
    repoRoot,
  );
  if (validation.code !== 0) {
    throw new Error(validation.stderr || "Enter a valid branch name.");
  }

  const createResult = await runGit(["checkout", "-b", trimmedName], repoRoot);
  if (createResult.code !== 0) {
    throw new Error(createResult.stderr || "Failed to create branch.");
  }

  return { branch: trimmedName };
}

export async function listBranches(
  pathValue: string | null | undefined,
): Promise<{ branch: string | null; branches: RepoBranch[] }> {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const context = await resolveRepoContext(repoRoot);

  const result = await runGit(
    ["branch", "--list", "--format=%(refname:short)"],
    repoRoot,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to list branches.");
  }

  const branches = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      current: context.branch === name,
      name,
    }));

  return {
    branch: context.branch,
    branches,
  };
}

export async function checkoutBranch(
  pathValue: string | null | undefined,
  branchName: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const trimmedName = branchName.trim();
  if (!trimmedName) {
    throw new Error("Branch name is required.");
  }

  const validation = await runGit(
    ["check-ref-format", "--branch", trimmedName],
    repoRoot,
  );
  if (validation.code !== 0) {
    throw new Error(validation.stderr || "Enter a valid branch name.");
  }

  const result = await runGit(["checkout", trimmedName], repoRoot);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to checkout branch.");
  }

  return { branch: trimmedName };
}

export async function pushCurrentBranch(pathValue: string | null | undefined) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const context = await resolveRepoContext(repoRoot);

  if (!context.branch) {
    throw new Error("Push requires a current branch.");
  }

  if (!context.hasRemotes || !context.pushRemoteName) {
    throw new Error("Push requires a configured git remote.");
  }

  if (!context.hasCommits) {
    throw new Error("Push requires at least one local commit.");
  }

  if (context.hasUpstream && context.aheadCount < 1) {
    throw new Error("Push requires commits ahead of upstream.");
  }

  const pushArgs = context.hasUpstream
    ? ["push"]
    : ["push", "-u", context.pushRemoteName, context.branch];
  const pushResult = await runGit(pushArgs, repoRoot);
  if (pushResult.code !== 0) {
    throw new Error(pushResult.stderr || "Failed to push branch.");
  }

  return { branch: context.branch };
}

export async function initializeRepository(
  pathValue: string | null | undefined,
): Promise<{ repoRoot: string }> {
  const directory = await ensureDirectory(pathValue);
  if (!directory) {
    throw new Error("Workspace root path is not available.");
  }

  const existingContext = await resolveRepoContext(directory);
  if (existingContext.isGitRepo) {
    throw new Error("This workspace is already a git repository.");
  }

  const initWithMain = await runGit(["init", "-b", "main"], directory);
  if (initWithMain.code !== 0) {
    const fallbackInit = await runGit(["init"], directory);
    if (fallbackInit.code !== 0) {
      throw new Error(
        fallbackInit.stderr || "Failed to initialize repository.",
      );
    }

    const setHead = await runGit(
      ["symbolic-ref", "HEAD", "refs/heads/main"],
      directory,
    );
    if (setHead.code !== 0) {
      throw new Error(setHead.stderr || "Failed to set default branch.");
    }
  }

  const repoRoot = await resolveRepoRoot(directory);
  if (!repoRoot) {
    throw new Error("Repository initialization did not produce a repo root.");
  }

  return { repoRoot };
}

export async function getCommitMessageContext(
  pathValue: string | null | undefined,
): Promise<{
  branch: string | null;
  changes: RepoFileChange[];
  diffStat: string;
  repoRoot: string;
}> {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const context = await resolveRepoContext(repoRoot);
  if (!context.hasChanges) {
    throw new Error(
      "Commit message generation requires changes in the working tree.",
    );
  }

  const [statusResult, stagedDiffStat, unstagedDiffStat] = await Promise.all([
    runGit(["status", "--porcelain=v1"], repoRoot),
    runGit(["diff", "--stat", "--cached"], repoRoot),
    runGit(["diff", "--stat"], repoRoot),
  ]);

  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to inspect git status.");
  }

  const changes = parseStatusChanges(statusResult.stdout);
  const diffStat = [
    stagedDiffStat.stdout.trim(),
    unstagedDiffStat.stdout.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    branch: context.branch,
    changes,
    diffStat,
    repoRoot,
  };
}
