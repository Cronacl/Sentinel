import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rm, stat } from "node:fs/promises";

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
  changedFileCount: number;
  deletions: number;
  githubRemote: RepoGitHubRemote | null;
  hasChanges: boolean;
  hasCommits: boolean;
  hasRemotes: boolean;
  hasUpstream: boolean;
  insertions: number;
  isDefaultBranch: boolean;
  isGitRepo: boolean;
  pushRemoteName: string | null;
  repoRoot: string | null;
  statusFingerprint: string;
};

export type RepoBranch = {
  current: boolean;
  name: string;
};

export type RepoDiffMode = "branch" | "staged" | "unstaged";

export type RepoDiffFile = {
  additions: number;
  deletions: number;
  firstChangedLine: number | null;
  isUntracked: boolean;
  newContents?: string;
  oldContents?: string;
  patch: string;
  path: string;
};

export type RepoDiffPanelData = {
  branch: string | null;
  disabledReason: string | null;
  fileCount: number;
  files: RepoDiffFile[];
  mode: RepoDiffMode;
  sourceLabel: string;
  totalAdditions: number;
  totalDeletions: number;
};

export type RepoDiffPanelBundleData = {
  branch: string | null;
  diffs: Record<RepoDiffMode, RepoDiffPanelData>;
  isGitRepo: boolean;
  repoRoot: string | null;
};

export type RepoWorktree = {
  branch: string | null;
  detached: boolean;
  path: string;
};

const GENERATED_THREAD_BRANCH_NAMES = [
  "atlas",
  "comet",
  "ember",
  "fern",
  "harbor",
  "iris",
  "juniper",
  "kestrel",
  "lagoon",
  "marble",
  "nova",
  "onyx",
  "poppy",
  "quartz",
  "river",
  "solstice",
  "thistle",
  "vapor",
  "willow",
  "zephyr",
] as const;

const inflightRepoDiffBundles = new Map<
  string,
  Promise<RepoDiffPanelBundleData>
>();

type RepoFileChange = {
  path: string;
  type: "added" | "deleted" | "modified" | "renamed" | "untracked";
};

function emptyRepoContext(): RepoContext {
  return {
    aheadCount: 0,
    branch: null,
    changedFileCount: 0,
    deletions: 0,
    githubRemote: null,
    hasChanges: false,
    hasCommits: false,
    hasRemotes: false,
    hasUpstream: false,
    insertions: 0,
    isDefaultBranch: false,
    isGitRepo: false,
    pushRemoteName: null,
    repoRoot: null,
    statusFingerprint: "missing",
  };
}

function buildStatusFingerprint(parts: Array<string | null | undefined>) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function buildEmptyRepoDiffPanelData(input: {
  branch?: string | null;
  disabledReason?: string | null;
  mode: RepoDiffMode;
  sourceLabel?: string;
}) {
  return {
    branch: input.branch ?? null,
    disabledReason: input.disabledReason ?? null,
    fileCount: 0,
    files: [],
    mode: input.mode,
    sourceLabel:
      input.sourceLabel ??
      (input.mode === "unstaged"
        ? "Unstaged"
        : input.mode === "staged"
          ? "Staged"
          : "Branch"),
    totalAdditions: 0,
    totalDeletions: 0,
  } satisfies RepoDiffPanelData;
}

function buildEmptyRepoDiffPanelBundle(input?: {
  branch?: string | null;
  disabledReason?: string | null;
  repoRoot?: string | null;
}) {
  return {
    branch: input?.branch ?? null,
    diffs: {
      unstaged: buildEmptyRepoDiffPanelData({
        branch: input?.branch,
        disabledReason: input?.disabledReason,
        mode: "unstaged",
      }),
      staged: buildEmptyRepoDiffPanelData({
        branch: input?.branch,
        disabledReason: input?.disabledReason,
        mode: "staged",
      }),
      branch: buildEmptyRepoDiffPanelData({
        branch: input?.branch,
        disabledReason: input?.disabledReason,
        mode: "branch",
      }),
    },
    isGitRepo: false,
    repoRoot: input?.repoRoot ?? null,
  } satisfies RepoDiffPanelBundleData;
}

function buildRepoDiffPanelData(input: {
  branch: string | null;
  disabledReason?: string | null;
  mode: RepoDiffMode;
  patch: string;
  sourceLabel: string;
  untrackedPaths?: Set<string>;
}) {
  const files = splitPatchIntoFiles(input.patch, {
    untrackedPaths: input.untrackedPaths,
  });
  const totals = files.reduce(
    (acc, file) => ({
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  return {
    branch: input.branch,
    disabledReason: input.disabledReason ?? null,
    fileCount: files.length,
    files,
    mode: input.mode,
    sourceLabel: input.sourceLabel,
    totalAdditions: totals.additions,
    totalDeletions: totals.deletions,
  } satisfies RepoDiffPanelData;
}

export function parseShortStat(output: string) {
  let insertions = 0;
  let deletions = 0;

  const insertionMatch = output.match(/(\d+)\s+insertion/);
  if (insertionMatch) {
    insertions = Number.parseInt(insertionMatch[1]!, 10);
  }

  const deletionMatch = output.match(/(\d+)\s+deletion/);
  if (deletionMatch) {
    deletions = Number.parseInt(deletionMatch[1]!, 10);
  }

  return { deletions, insertions };
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

function parseStatusChanges(
  statusOutput: string,
  options?: { stagedOnly?: boolean },
) {
  const changes: RepoFileChange[] = [];

  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const stagedCode = line[0] ?? " ";
    const unstagedCode = line[1] ?? " ";
    const rawPath = line.slice(3).trim();
    const path = normalizeChangedPath(rawPath);

    if (options?.stagedOnly) {
      if (stagedCode === " " || stagedCode === "?") {
        continue;
      }

      changes.push({ path, type: mapGitStatusCode(stagedCode) });
      continue;
    }

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

function parseCommitMessage(message: string) {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return {
      body: "",
      subject: "",
    };
  }

  const [subjectLine = ""] = normalized.split("\n");
  const subject = subjectLine.trim();
  const body = normalized.slice(subjectLine.length).replace(/^\n+/, "").trim();

  return {
    body,
    subject,
  };
}

function formatChangeSummaryLine(change: RepoFileChange) {
  const prefix =
    change.type === "added"
      ? "A"
      : change.type === "deleted"
        ? "D"
        : change.type === "renamed"
          ? "R"
          : change.type === "untracked"
            ? "?"
            : "M";

  return `${prefix} ${change.path}`;
}

function isProbablyBinaryContent(content: Buffer) {
  return content.includes(0);
}

function buildSyntheticAddPatch(filePath: string, rawContent: string) {
  const normalizedContent = rawContent.replace(/\r\n/g, "\n");
  const hasTrailingNewline = normalizedContent.endsWith("\n");
  const lines = normalizedContent.split("\n");
  if (hasTrailingNewline && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
  ];

  if (lines.length === 0) {
    return header.join("\n");
  }

  return [
    ...header,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join("\n");
}

async function buildUntrackedPatch(repoRoot: string, filePath: string) {
  const absolutePath = path.join(repoRoot, filePath);
  const fileStats = await stat(absolutePath).catch(() => null);
  if (!fileStats?.isFile()) {
    return null;
  }

  const content = await readFile(absolutePath).catch(() => null);
  if (!content || isProbablyBinaryContent(content)) {
    return null;
  }

  return buildSyntheticAddPatch(filePath, content.toString("utf8"));
}

async function readWorktreeTextFile(repoRoot: string, filePath: string) {
  const absolutePath = path.join(repoRoot, filePath);
  const fileStats = await stat(absolutePath).catch(() => null);
  if (!fileStats?.isFile()) {
    return null;
  }

  const content = await readFile(absolutePath).catch(() => null);
  if (!content || isProbablyBinaryContent(content)) {
    return null;
  }

  return content.toString("utf8");
}

async function readGitTextFile(repoRoot: string, objectSpec: string) {
  const result = await runGit(["show", objectSpec], repoRoot);
  if (result.code !== 0) {
    return null;
  }

  return result.stdout;
}

function parseStatusLines(statusOutput: string) {
  return statusOutput
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "));
}

function collectUntrackedPaths(statusOutput: string) {
  return new Set(
    parseStatusLines(statusOutput)
      .filter((line) => line.startsWith("?? "))
      .map((line) => normalizeChangedPath(line.slice(3))),
  );
}

function parsePatchFilePath(patch: string) {
  const diffHeader = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (diffHeader) {
    const leftPath = diffHeader[1]?.trim() ?? "";
    const rightPath = diffHeader[2]?.trim() ?? "";
    if (rightPath && rightPath !== "/dev/null") {
      return normalizeChangedPath(rightPath.replace(/^"|"$/g, ""));
    }
    if (leftPath && leftPath !== "/dev/null") {
      return normalizeChangedPath(leftPath.replace(/^"|"$/g, ""));
    }
  }

  const oldPath = patch.match(/^--- (.+)$/m)?.[1]?.trim() ?? "";
  const newPath = patch.match(/^\+\+\+ (.+)$/m)?.[1]?.trim() ?? "";
  const normalizedNewPath = newPath.replace(/^b\//, "").replace(/^"|"$/g, "");
  const normalizedOldPath = oldPath.replace(/^a\//, "").replace(/^"|"$/g, "");

  if (normalizedNewPath && normalizedNewPath !== "/dev/null") {
    return normalizeChangedPath(normalizedNewPath);
  }
  if (normalizedOldPath && normalizedOldPath !== "/dev/null") {
    return normalizeChangedPath(normalizedOldPath);
  }

  return null;
}

function summarizePatch(patch: string) {
  let additions = 0;
  let deletions = 0;

  for (const line of patch.split("\n")) {
    if (
      line.startsWith("+++ ") ||
      line.startsWith("--- ") ||
      line.startsWith("@@") ||
      line.startsWith("diff --git")
    ) {
      continue;
    }
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

function getFirstChangedLine(patch: string) {
  const hunk = patch.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/m);
  if (!hunk) {
    return null;
  }

  const oldStart = Number.parseInt(hunk[1] ?? "", 10);
  const newStart = Number.parseInt(hunk[2] ?? "", 10);

  if (Number.isFinite(newStart) && newStart > 0) {
    return newStart;
  }
  if (Number.isFinite(oldStart) && oldStart > 0) {
    return oldStart;
  }

  return null;
}

function splitPatchIntoFiles(
  patch: string,
  options?: { untrackedPaths?: Set<string> },
): RepoDiffFile[] {
  const normalized = patch.trim();
  if (!normalized) {
    return [];
  }

  const sections = normalized
    .split(/(?=^diff --git )/m)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.flatMap((section) => {
    const path = parsePatchFilePath(section);
    if (!path) {
      return [];
    }

    const { additions, deletions } = summarizePatch(section);
    return [
      {
        additions,
        deletions,
        firstChangedLine: getFirstChangedLine(section),
        isUntracked: options?.untrackedPaths?.has(path) ?? false,
        patch: section,
        path,
      },
    ];
  });
}

function normalizePaths(paths: string[]) {
  const unique = new Set<string>();

  for (const value of paths) {
    const normalized = normalizeChangedPath(value);
    if (!normalized || normalized.startsWith("-")) {
      continue;
    }
    unique.add(normalized);
  }

  return [...unique];
}

async function assertPathSelection(paths: string[]) {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) {
    throw new Error("Select at least one file.");
  }
  return normalized;
}

async function resolveBranchDiffSpec(repoRoot: string, context?: RepoContext) {
  const resolvedContext = context ?? (await resolveRepoContext(repoRoot));
  if (!resolvedContext.branch) {
    return {
      branch: null,
      baseRef: null,
      disabledReason: "Branch diff requires a checked out branch.",
      diffRef: null,
      sourceLabel: "Branch",
    };
  }

  const defaultBranch = resolvedContext.githubRemote?.defaultBranch;
  const remoteName = resolvedContext.githubRemote?.remoteName;
  if (!defaultBranch || !remoteName) {
    return {
      branch: resolvedContext.branch,
      baseRef: null,
      disabledReason:
        "Branch diff requires a GitHub remote with a resolvable default branch.",
      diffRef: null,
      sourceLabel: "Branch",
    };
  }

  const remoteRef = `${remoteName}/${defaultBranch}`;
  const remoteRefResult = await runGit(
    ["rev-parse", "--verify", remoteRef],
    repoRoot,
  );
  if (remoteRefResult.code !== 0) {
    return {
      branch: resolvedContext.branch,
      baseRef: null,
      disabledReason: `Branch diff requires the remote ref ${remoteRef}.`,
      diffRef: null,
      sourceLabel: `${resolvedContext.branch} -> ${remoteRef}`,
    };
  }

  const mergeBaseResult = await runGit(
    ["merge-base", "HEAD", remoteRef],
    repoRoot,
  );
  if (mergeBaseResult.code !== 0 || !mergeBaseResult.stdout.trim()) {
    return {
      branch: resolvedContext.branch,
      baseRef: null,
      disabledReason: `Branch diff could not resolve a merge base with ${remoteRef}.`,
      diffRef: null,
      sourceLabel: `${resolvedContext.branch} -> ${remoteRef}`,
    };
  }

  const mergeBase = mergeBaseResult.stdout.trim();

  return {
    baseRef: mergeBase,
    branch: resolvedContext.branch,
    disabledReason: null,
    diffRef: `${remoteRef}...HEAD`,
    sourceLabel: `${resolvedContext.branch} -> ${remoteRef}`,
  };
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
  const directory = await ensureDirectory(pathValue);
  if (!directory) {
    return null;
  }

  const result = await runGit(["rev-parse", "--show-toplevel"], directory);
  if (result.code !== 0 || !result.stdout.trim()) {
    return null;
  }

  return result.stdout.trim();
}

function getThreadWorktreePath(repoRoot: string, threadId: string) {
  return path.join(
    path.dirname(repoRoot),
    ".sentinel-worktrees",
    path.basename(repoRoot),
    threadId,
  );
}

function pickGeneratedThreadBranchName() {
  return GENERATED_THREAD_BRANCH_NAMES[
    Math.floor(Math.random() * GENERATED_THREAD_BRANCH_NAMES.length)
  ]!;
}

function pickGeneratedThreadBranchSuffix() {
  return randomBytes(3).toString("hex");
}

async function branchExists(repoRoot: string, branchName: string) {
  const result = await runGit(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    repoRoot,
  );
  return result.code === 0;
}

export async function generateThreadBranchName(
  pathValue: string | null | undefined,
  options?: {
    maxAttempts?: number;
    pickName?: () => string;
    pickSuffix?: () => string;
  },
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const maxAttempts = options?.maxAttempts ?? 24;
  const pickName = options?.pickName ?? pickGeneratedThreadBranchName;
  const pickSuffix = options?.pickSuffix ?? pickGeneratedThreadBranchSuffix;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const branchName = `thread/${pickName()}-${pickSuffix()}`;
    if (!(await branchExists(repoRoot, branchName))) {
      return branchName;
    }
  }

  throw new Error("Failed to generate a unique branch name for this thread.");
}

function parseWorktreeList(output: string): RepoWorktree[] {
  const worktrees: RepoWorktree[] = [];
  let current: Partial<RepoWorktree> | null = null;

  const flush = () => {
    if (!current?.path) {
      current = null;
      return;
    }

    worktrees.push({
      branch: current.branch ?? null,
      detached: current.detached ?? false,
      path: current.path,
    });
    current = null;
  };

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }

    if (trimmed.startsWith("worktree ")) {
      flush();
      current = {
        detached: false,
        path: trimmed.slice("worktree ".length).trim(),
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed === "detached") {
      current.detached = true;
      current.branch = null;
      continue;
    }

    if (trimmed.startsWith("branch ")) {
      const value = trimmed.slice("branch ".length).trim();
      current.branch = value.startsWith("refs/heads/")
        ? value.slice("refs/heads/".length)
        : value;
    }
  }

  flush();
  return worktrees;
}

function normalizeBranch(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "HEAD") {
    return null;
  }

  return trimmed;
}

export function buildGitHubRemoteUrls(
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

  const [
    branchResult,
    statusResult,
    upstreamResult,
    remotes,
    stagedStat,
    unstagedStat,
  ] = await Promise.all([
    runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    runGit(["status", "--porcelain=v1"], repoRoot),
    runGit(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      repoRoot,
    ),
    listRemotes(repoRoot),
    runGit(["diff", "--cached", "--shortstat"], repoRoot),
    runGit(["diff", "--shortstat"], repoRoot),
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
  const changedFileCount = statusResult.stdout
    .split("\n")
    .filter((line) => line.trim()).length;
  const staged = parseShortStat(stagedStat.code === 0 ? stagedStat.stdout : "");
  const unstaged = parseShortStat(
    unstagedStat.code === 0 ? unstagedStat.stdout : "",
  );
  const insertions = staged.insertions + unstaged.insertions;
  const deletions = staged.deletions + unstaged.deletions;
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
  const statusFingerprint = buildStatusFingerprint([
    repoRoot,
    branch,
    headResult.code === 0 ? headResult.stdout.trim() : null,
    upstreamRef,
    aheadResult?.code === 0 ? aheadResult.stdout.trim() : null,
    statusResult.code === 0 ? statusResult.stdout : null,
    stagedStat.code === 0 ? stagedStat.stdout : null,
    unstagedStat.code === 0 ? unstagedStat.stdout : null,
  ]);

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
      changedFileCount,
      deletions,
      githubRemote: null,
      hasChanges,
      hasCommits,
      hasRemotes,
      hasUpstream,
      insertions,
      isDefaultBranch: false,
      isGitRepo: true,
      pushRemoteName,
      repoRoot,
      statusFingerprint,
    };
  }

  const parsedRemote = parseGitHubRemoteUrl(githubRemoteMatch.url);
  if (!parsedRemote) {
    return {
      aheadCount,
      branch,
      changedFileCount,
      deletions,
      githubRemote: null,
      hasChanges,
      hasCommits,
      hasRemotes,
      hasUpstream,
      insertions,
      isDefaultBranch: false,
      isGitRepo: true,
      pushRemoteName,
      repoRoot,
      statusFingerprint,
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
    changedFileCount,
    deletions,
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
    insertions,
    isDefaultBranch: Boolean(
      branch && defaultBranch && branch === defaultBranch,
    ),
    isGitRepo: true,
    pushRemoteName,
    repoRoot,
    statusFingerprint,
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

async function hasStagedChanges(repoRoot: string) {
  const stagedStatusResult = await runGit(
    ["diff", "--cached", "--name-only"],
    repoRoot,
  );
  if (stagedStatusResult.code !== 0) {
    throw new Error(
      stagedStatusResult.stderr || "Failed to inspect staged changes.",
    );
  }

  return Boolean(stagedStatusResult.stdout.trim());
}

export async function commitAllChanges(
  pathValue: string | null | undefined,
  message: string,
  includeUnstaged = true,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const { body, subject } = parseCommitMessage(message);
  if (!subject) {
    throw new Error("Commit message is required.");
  }

  const context = await resolveRepoContext(repoRoot);
  if (!context.hasChanges) {
    throw new Error("Commit requires changes in the working tree.");
  }

  if (includeUnstaged) {
    const addResult = await runGit(["add", "-A"], repoRoot);
    if (addResult.code !== 0) {
      throw new Error(addResult.stderr || "Failed to stage changes.");
    }
  } else if (!(await hasStagedChanges(repoRoot))) {
    throw new Error(
      "Commit requires staged changes when unstaged changes are excluded.",
    );
  }

  const commitArgs = ["commit", "-m", subject];
  if (body) {
    commitArgs.push("-m", body);
  }

  const commitResult = await runGit(commitArgs, repoRoot);
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

export async function getHeadCommitMessage(
  pathValue: string | null | undefined,
): Promise<{
  body: string;
  message: string;
  subject: string;
}> {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const result = await runGit(["log", "-1", "--pretty=%B"], repoRoot);
  if (result.code !== 0) {
    throw new Error(
      result.stderr || "Failed to read the latest commit message.",
    );
  }

  const { body, subject } = parseCommitMessage(result.stdout);
  if (!subject) {
    throw new Error("The latest commit message is empty.");
  }

  return {
    body,
    message: body ? `${subject}\n\n${body}` : subject,
    subject,
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
    const branchInUseMatch = result.stderr.match(
      /'([^']+)' is already used by worktree at '([^']+)'/,
    );
    if (branchInUseMatch) {
      const inUsePath = branchInUseMatch[2];
      throw new Error(
        `Branch ${trimmedName} is already checked out at ${inUsePath}. Switch this thread to the local project for that branch, or choose a different branch for this worktree.`,
      );
    }
    throw new Error(result.stderr || "Failed to checkout branch.");
  }

  return { branch: trimmedName };
}

export async function stashChanges(
  pathValue: string | null | undefined,
  stashName: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const trimmedName = stashName.trim();
  if (!trimmedName) {
    throw new Error("Stash name is required.");
  }

  const result = await runGit(
    ["stash", "push", "--include-untracked", "--message", trimmedName],
    repoRoot,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to stash changes.");
  }

  return {
    message: trimmedName,
  };
}

export async function listWorktrees(
  pathValue: string | null | undefined,
): Promise<{ repoRoot: string; worktrees: RepoWorktree[] }> {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const result = await runGit(["worktree", "list", "--porcelain"], repoRoot);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to list worktrees.");
  }

  return {
    repoRoot,
    worktrees: parseWorktreeList(result.stdout),
  };
}

export async function isWorktreeClean(
  pathValue: string | null | undefined,
): Promise<boolean> {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const statusResult = await runGit(["status", "--porcelain=v1"], repoRoot);
  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to inspect worktree state.");
  }

  return !Boolean(statusResult.stdout.trim());
}

export async function ensureThreadWorktree(
  pathValue: string | null | undefined,
  threadId: string,
  branchName: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const trimmedBranchName = branchName.trim();
  if (!trimmedBranchName) {
    throw new Error("Branch name is required.");
  }

  const validation = await runGit(
    ["check-ref-format", "--branch", trimmedBranchName],
    repoRoot,
  );
  if (validation.code !== 0) {
    throw new Error(validation.stderr || "Enter a valid branch name.");
  }

  const targetPath = getThreadWorktreePath(repoRoot, threadId);
  const existingRepoRoot = await resolveRepoRoot(targetPath);
  if (existingRepoRoot) {
    const existingContext = await resolveRepoContext(existingRepoRoot);
    return {
      branch: existingContext.branch ?? trimmedBranchName,
      created: false,
      path: existingRepoRoot,
    };
  }

  await rm(targetPath, { force: true, recursive: true }).catch(() => undefined);
  await mkdir(path.dirname(targetPath), { recursive: true });

  const nextBranchName = await generateThreadBranchName(repoRoot);

  const addResult = await runGit(
    [
      "worktree",
      "add",
      "--force",
      "-b",
      nextBranchName,
      targetPath,
      trimmedBranchName,
    ],
    repoRoot,
  );
  if (addResult.code !== 0) {
    throw new Error(addResult.stderr || "Failed to create worktree.");
  }

  return {
    branch: nextBranchName,
    created: true,
    path: targetPath,
  };
}

export async function removeThreadWorktree(
  pathValue: string | null | undefined,
  threadId: string,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const targetPath = getThreadWorktreePath(repoRoot, threadId);
  const existingRepoRoot = await resolveRepoRoot(targetPath);

  if (!existingRepoRoot) {
    await rm(targetPath, { force: true, recursive: true }).catch(
      () => undefined,
    );
    return {
      path: targetPath,
      removed: false,
    };
  }

  const clean = await isWorktreeClean(existingRepoRoot);
  if (!clean) {
    throw new Error(
      "This worktree has uncommitted changes. Clean it up before removing it.",
    );
  }

  const removeResult = await runGit(
    ["worktree", "remove", "--force", existingRepoRoot],
    repoRoot,
  );
  if (removeResult.code !== 0) {
    throw new Error(removeResult.stderr || "Failed to remove worktree.");
  }

  await rm(targetPath, { force: true, recursive: true }).catch(() => undefined);

  return {
    path: targetPath,
    removed: true,
  };
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

export async function getRepoDiffPanelData(
  pathValue: string | null | undefined,
  mode: RepoDiffMode,
  options?: {
    emptyReason?: string;
    onMissingRepo?: "empty" | "throw";
    repoContext?: RepoContext;
  },
): Promise<RepoDiffPanelData> {
  const repoRoot =
    options?.repoContext?.repoRoot ?? (await resolveRepoRoot(pathValue ?? ""));
  if (!repoRoot) {
    if (options?.onMissingRepo === "empty") {
      return buildEmptyRepoDiffPanelData({
        disabledReason:
          options.emptyReason ??
          "Repo diff is temporarily unavailable while this thread is loading.",
        mode,
      });
    }

    throw new Error("The selected workspace root is not a git repository.");
  }

  const context =
    options?.repoContext?.repoRoot === repoRoot
      ? options.repoContext
      : await resolveRepoContext(repoRoot);

  if (!context.isGitRepo) {
    if (options?.onMissingRepo === "empty") {
      return buildEmptyRepoDiffPanelData({
        branch: context.branch,
        disabledReason:
          options.emptyReason ?? "This workspace is not a git repository.",
        mode,
      });
    }

    throw new Error("The selected workspace root is not a git repository.");
  }

  if (mode === "staged") {
    const stagedPatchResult = await runGit(
      ["diff", "--cached", "--patch", "--minimal"],
      repoRoot,
    );
    if (stagedPatchResult.code !== 0) {
      throw new Error(
        stagedPatchResult.stderr || "Failed to generate staged diff.",
      );
    }

    return buildRepoDiffPanelData({
      branch: context.branch,
      mode: "staged",
      patch: stagedPatchResult.stdout.trim(),
      sourceLabel: "Staged",
    });
  }

  if (mode === "branch") {
    const branchSpec = await resolveBranchDiffSpec(repoRoot, context);
    if (!branchSpec.diffRef) {
      return buildEmptyRepoDiffPanelData({
        branch: branchSpec.branch,
        disabledReason: branchSpec.disabledReason,
        mode: "branch",
        sourceLabel: branchSpec.sourceLabel,
      });
    }

    const branchPatchResult = await runGit(
      ["diff", "--patch", "--minimal", branchSpec.diffRef],
      repoRoot,
    );
    if (branchPatchResult.code !== 0) {
      throw new Error(
        branchPatchResult.stderr || "Failed to generate branch diff.",
      );
    }

    return buildRepoDiffPanelData({
      branch: branchSpec.branch,
      disabledReason: branchSpec.disabledReason,
      mode: "branch",
      patch: branchPatchResult.stdout.trim(),
      sourceLabel: branchSpec.sourceLabel,
    });
  }

  const [statusResult, unstagedPatchResult] = await Promise.all([
    runGit(["status", "--porcelain=v1"], repoRoot),
    runGit(["diff", "--patch", "--minimal"], repoRoot),
  ]);

  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to inspect git status.");
  }
  if (unstagedPatchResult.code !== 0) {
    throw new Error(
      unstagedPatchResult.stderr || "Failed to generate unstaged diff.",
    );
  }

  const untrackedPaths = collectUntrackedPaths(statusResult.stdout);
  const untrackedPatches = await Promise.all(
    [...untrackedPaths].map((filePath) =>
      buildUntrackedPatch(repoRoot, filePath),
    ),
  );
  const unstagedPatch = [
    unstagedPatchResult.stdout.trim(),
    ...untrackedPatches.filter((entry): entry is string =>
      Boolean(entry?.trim()),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return buildRepoDiffPanelData({
    branch: context.branch,
    mode: "unstaged",
    patch: unstagedPatch,
    sourceLabel: "Unstaged",
    untrackedPaths,
  });
}

export async function getRepoDiffPanelBundleData(
  pathValue: string | null | undefined,
  options?: {
    dedupeKey?: string;
    emptyReason?: string;
    onMissingRepo?: "empty" | "throw";
    repoContext?: RepoContext;
  },
): Promise<RepoDiffPanelBundleData> {
  const dedupeKey =
    options?.dedupeKey?.trim() ||
    `repo-diff:${pathValue?.trim() || options?.repoContext?.repoRoot || "missing"}`;
  const cached = inflightRepoDiffBundles.get(dedupeKey);
  if (cached) {
    return await cached;
  }

  const promise = (async () => {
    const repoRoot =
      options?.repoContext?.repoRoot ??
      (await resolveRepoRoot(pathValue ?? ""));
    if (!repoRoot) {
      if (options?.onMissingRepo === "empty") {
        return buildEmptyRepoDiffPanelBundle({
          disabledReason:
            options.emptyReason ??
            "Repo diff is temporarily unavailable while this thread is loading.",
        });
      }

      throw new Error("The selected workspace root is not a git repository.");
    }

    const context =
      options?.repoContext?.repoRoot === repoRoot
        ? options.repoContext
        : await resolveRepoContext(repoRoot);

    if (!context.isGitRepo) {
      if (options?.onMissingRepo === "empty") {
        return buildEmptyRepoDiffPanelBundle({
          branch: context.branch,
          disabledReason:
            options.emptyReason ?? "This workspace is not a git repository.",
          repoRoot: context.repoRoot,
        });
      }

      throw new Error("The selected workspace root is not a git repository.");
    }

    const unstagedStatusPromise = runGit(
      ["status", "--porcelain=v1"],
      repoRoot,
    );
    const unstagedPatchPromise = runGit(
      ["diff", "--patch", "--minimal"],
      repoRoot,
    );
    const stagedPatchPromise = runGit(
      ["diff", "--cached", "--patch", "--minimal"],
      repoRoot,
    );
    const branchSpecPromise = resolveBranchDiffSpec(repoRoot, context);

    const [statusResult, unstagedPatchResult, stagedPatchResult, branchSpec] =
      await Promise.all([
        unstagedStatusPromise,
        unstagedPatchPromise,
        stagedPatchPromise,
        branchSpecPromise,
      ]);

    if (statusResult.code !== 0) {
      throw new Error(statusResult.stderr || "Failed to inspect git status.");
    }
    if (unstagedPatchResult.code !== 0) {
      throw new Error(
        unstagedPatchResult.stderr || "Failed to generate unstaged diff.",
      );
    }
    if (stagedPatchResult.code !== 0) {
      throw new Error(
        stagedPatchResult.stderr || "Failed to generate staged diff.",
      );
    }

    const untrackedPaths = collectUntrackedPaths(statusResult.stdout);
    const untrackedPatches = await Promise.all(
      [...untrackedPaths].map((filePath) =>
        buildUntrackedPatch(repoRoot, filePath),
      ),
    );
    const unstagedPatch = [
      unstagedPatchResult.stdout.trim(),
      ...untrackedPatches.filter((entry): entry is string =>
        Boolean(entry?.trim()),
      ),
    ]
      .filter(Boolean)
      .join("\n\n");

    let branchDiff: RepoDiffPanelData = buildEmptyRepoDiffPanelData({
      branch: branchSpec.branch,
      disabledReason: branchSpec.disabledReason,
      mode: "branch",
      sourceLabel: branchSpec.sourceLabel,
    });

    if (branchSpec.diffRef) {
      const branchPatchResult = await runGit(
        ["diff", "--patch", "--minimal", branchSpec.diffRef],
        repoRoot,
      );
      if (branchPatchResult.code !== 0) {
        throw new Error(
          branchPatchResult.stderr || "Failed to generate branch diff.",
        );
      }

      branchDiff = buildRepoDiffPanelData({
        branch: branchSpec.branch,
        disabledReason: branchSpec.disabledReason,
        mode: "branch",
        patch: branchPatchResult.stdout.trim(),
        sourceLabel: branchSpec.sourceLabel,
      });
    }

    return {
      branch: context.branch,
      diffs: {
        unstaged: buildRepoDiffPanelData({
          branch: context.branch,
          mode: "unstaged",
          patch: unstagedPatch,
          sourceLabel: "Unstaged",
          untrackedPaths,
        }),
        staged: buildRepoDiffPanelData({
          branch: context.branch,
          mode: "staged",
          patch: stagedPatchResult.stdout.trim(),
          sourceLabel: "Staged",
        }),
        branch: branchDiff,
      },
      isGitRepo: true,
      repoRoot: context.repoRoot,
    };
  })();

  inflightRepoDiffBundles.set(dedupeKey, promise);

  try {
    return await promise;
  } finally {
    if (inflightRepoDiffBundles.get(dedupeKey) === promise) {
      inflightRepoDiffBundles.delete(dedupeKey);
    }
  }
}

export async function stageFiles(
  pathValue: string | null | undefined,
  paths: string[],
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const normalizedPaths = await assertPathSelection(paths);
  const result = await runGit(["add", "--", ...normalizedPaths], repoRoot);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to stage files.");
  }

  return { paths: normalizedPaths };
}

export async function unstageFiles(
  pathValue: string | null | undefined,
  paths: string[],
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const normalizedPaths = await assertPathSelection(paths);
  const result = await runGit(
    ["restore", "--staged", "--", ...normalizedPaths],
    repoRoot,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to unstage files.");
  }

  return { paths: normalizedPaths };
}

export async function revertFiles(
  pathValue: string | null | undefined,
  paths: string[],
  mode: Exclude<RepoDiffMode, "branch">,
) {
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const normalizedPaths = await assertPathSelection(paths);

  if (mode === "staged") {
    const result = await runGit(
      [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        ...normalizedPaths,
      ],
      repoRoot,
    );
    if (result.code !== 0) {
      throw new Error(result.stderr || "Failed to revert staged files.");
    }

    return { paths: normalizedPaths };
  }

  const statusResult = await runGit(
    ["status", "--porcelain=v1", "--", ...normalizedPaths],
    repoRoot,
  );
  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to inspect file changes.");
  }

  const untrackedPaths = collectUntrackedPaths(statusResult.stdout);
  const trackedPaths = normalizedPaths.filter(
    (filePath) => !untrackedPaths.has(filePath),
  );

  if (trackedPaths.length > 0) {
    const restoreResult = await runGit(
      ["restore", "--worktree", "--", ...trackedPaths],
      repoRoot,
    );
    if (restoreResult.code !== 0) {
      throw new Error(restoreResult.stderr || "Failed to revert files.");
    }
  }

  if (untrackedPaths.size > 0) {
    const cleanResult = await runGit(
      ["clean", "-f", "--", ...[...untrackedPaths]],
      repoRoot,
    );
    if (cleanResult.code !== 0) {
      throw new Error(
        cleanResult.stderr || "Failed to remove untracked files.",
      );
    }
  }

  return { paths: normalizedPaths };
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
  options?: { includeUnstaged?: boolean },
): Promise<{
  branch: string | null;
  changes: RepoFileChange[];
  patch: string;
  repoRoot: string;
  summary: string;
}> {
  const includeUnstaged = options?.includeUnstaged ?? true;
  const repoRoot = await resolveRepoRootOrThrow(pathValue);
  const context = await resolveRepoContext(repoRoot);
  if (!context.hasChanges) {
    throw new Error(
      "Commit message generation requires changes in the working tree.",
    );
  }

  const [statusResult, stagedPatchResult, unstagedPatchResult] =
    await Promise.all([
      runGit(["status", "--porcelain=v1"], repoRoot),
      runGit(["diff", "--cached", "--patch", "--minimal"], repoRoot),
      includeUnstaged
        ? runGit(["diff", "--patch", "--minimal"], repoRoot)
        : Promise.resolve({ code: 0, stderr: "", stdout: "" }),
    ]);

  if (statusResult.code !== 0) {
    throw new Error(statusResult.stderr || "Failed to inspect git status.");
  }

  const changes = parseStatusChanges(statusResult.stdout, {
    stagedOnly: !includeUnstaged,
  });
  if (changes.length === 0) {
    throw new Error(
      includeUnstaged
        ? "Commit message generation requires changes in the working tree."
        : "Commit message generation requires staged changes when unstaged changes are excluded.",
    );
  }

  const summary = changes.map(formatChangeSummaryLine).join("\n");
  const untrackedPatches = await Promise.all(
    includeUnstaged
      ? changes
          .filter((change) => change.type === "untracked")
          .map((change) => buildUntrackedPatch(repoRoot, change.path))
      : [],
  );
  const patchSections = [
    stagedPatchResult.stdout.trim(),
    unstagedPatchResult.stdout.trim(),
    ...untrackedPatches.filter((patch): patch is string =>
      Boolean(patch?.trim()),
    ),
  ].filter(Boolean);

  return {
    branch: context.branch,
    changes,
    patch: patchSections.join("\n\n"),
    repoRoot,
    summary,
  };
}
