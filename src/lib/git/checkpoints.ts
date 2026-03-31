import path from "node:path";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

type PatchApplyFailure = {
  error: string;
  path: string;
};

type TreeEntry = {
  content: Buffer;
  mode: string;
};

type TreeSnapshot = {
  repoRoot: string;
  scopePath: string | null;
  treeHash: string;
};

export type RepoCheckpointDiff = {
  afterTreeHash: string;
  changedPaths: string[];
  forwardPatch: string;
  reversePatch: string;
};

export type RepoCheckpointPatchApplyResult = {
  appliedPaths: string[];
  failedPaths: PatchApplyFailure[];
};

export type RepoCheckpointSnapshot = {
  projectPath: string;
  repoRoot: string;
  scopePath: string | null;
  treeHash: string;
};

const SNAPSHOT_PREFIX = "sentinel-repo-checkpoint-";

async function runGitBuffer(
  args: string[],
  cwd: string,
  options?: { env?: Record<string, string | undefined> },
) {
  return await new Promise<{ code: number; stderr: string; stdout: Buffer }>(
    (resolve, reject) => {
      const child = spawn("git", args, {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          ...(options?.env ?? {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          code: code ?? 1,
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          stdout: Buffer.concat(stdoutChunks),
        });
      });
    },
  );
}

async function runGitText(
  args: string[],
  cwd: string,
  options?: { env?: Record<string, string | undefined> },
) {
  const result = await runGitBuffer(args, cwd, options);
  return {
    ...result,
    stdout: result.stdout.toString("utf8"),
  };
}

function normalizeGitCommandOutput(value: string) {
  return value.replace(/\s+$/, "");
}

async function runGitTrimmed(
  args: string[],
  cwd: string,
  options?: { env?: Record<string, string | undefined> },
) {
  const result = await runGitText(args, cwd, options);
  return {
    ...result,
    stderr: normalizeGitCommandOutput(result.stderr),
    stdout: normalizeGitCommandOutput(result.stdout),
  };
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function normalizePatchPaths(patch: string) {
  return patch
    .replaceAll("a/before/", "a/")
    .replaceAll("b/after/", "b/")
    .replaceAll("a/after/", "a/")
    .replaceAll("b/before/", "b/");
}

function splitPatchSections(patch: string) {
  const trimmed = patch.trim();
  if (!trimmed) {
    return [];
  }

  const sectionStarts = [...patch.matchAll(/^diff --git /gm)].map(
    (match) => match.index ?? 0,
  );

  if (sectionStarts.length === 0) {
    return [];
  }

  return sectionStarts.map((start, index) => {
    const end = sectionStarts[index + 1] ?? patch.length;
    return patch.slice(start, end);
  });
}

function parsePatchPath(patch: string) {
  const diffHeader = patch.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (diffHeader) {
    const leftPath = diffHeader[1]?.trim().replace(/^"|"$/g, "") ?? "";
    const rightPath = diffHeader[2]?.trim().replace(/^"|"$/g, "") ?? "";

    if (rightPath && rightPath !== "/dev/null") {
      return rightPath;
    }

    if (leftPath && leftPath !== "/dev/null") {
      return leftPath;
    }
  }

  const oldPath =
    patch
      .match(/^--- (.+)$/m)?.[1]
      ?.trim()
      .replace(/^a\//, "")
      .replace(/^"|"$/g, "") ?? "";
  const newPath =
    patch
      .match(/^\+\+\+ (.+)$/m)?.[1]
      ?.trim()
      .replace(/^b\//, "")
      .replace(/^"|"$/g, "") ?? "";

  return newPath && newPath !== "/dev/null"
    ? newPath
    : oldPath && oldPath !== "/dev/null"
      ? oldPath
      : null;
}

function getScopePath(projectPath: string, repoRoot: string) {
  const relativePath = path.relative(repoRoot, projectPath);
  return relativePath ? toPosixPath(relativePath) : null;
}

async function getRepoRoot(projectPath: string) {
  const result = await runGitTrimmed(
    ["rev-parse", "--show-toplevel"],
    projectPath,
  );
  if (result.code !== 0 || !result.stdout) {
    throw new Error(result.stderr || "Unable to resolve repo root.");
  }

  return await realpath(result.stdout);
}

async function withTemporaryIndex<T>(
  repoRoot: string,
  fn: (input: {
    env: Record<string, string | undefined>;
    tempRoot: string;
  }) => Promise<T>,
) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), SNAPSHOT_PREFIX));
  const indexPath = path.join(tempRoot, "index");

  try {
    return await fn({
      env: {
        GIT_INDEX_FILE: indexPath,
      },
      tempRoot,
    });
  } finally {
    await rm(tempRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function captureTreeSnapshot(
  projectPath: string,
  repoRoot?: string,
): Promise<TreeSnapshot> {
  const resolvedProjectPath = await realpath(projectPath);
  const resolvedRepoRoot =
    repoRoot != null
      ? await realpath(repoRoot)
      : await getRepoRoot(projectPath);
  const scopePath = getScopePath(resolvedProjectPath, resolvedRepoRoot);

  return await withTemporaryIndex(resolvedRepoRoot, async ({ env }) => {
    const headResult = await runGitTrimmed(
      ["rev-parse", "--verify", "HEAD"],
      resolvedRepoRoot,
    );
    const readTreeArgs =
      headResult.code === 0 && headResult.stdout
        ? ["read-tree", "HEAD"]
        : ["read-tree", "--empty"];
    const readTreeResult = await runGitTrimmed(readTreeArgs, resolvedRepoRoot, {
      env,
    });
    if (readTreeResult.code !== 0) {
      throw new Error(
        readTreeResult.stderr || "Unable to prepare checkpoint index.",
      );
    }

    const addResult = await runGitTrimmed(
      ["add", "-A", "--", "."],
      resolvedProjectPath,
      {
        env,
      },
    );
    if (addResult.code !== 0) {
      throw new Error(addResult.stderr || "Unable to capture checkpoint tree.");
    }

    const treeResult = await runGitTrimmed(["write-tree"], resolvedRepoRoot, {
      env,
    });
    if (treeResult.code !== 0 || !treeResult.stdout) {
      throw new Error(
        treeResult.stderr || "Unable to write checkpoint tree snapshot.",
      );
    }

    return {
      repoRoot: resolvedRepoRoot,
      scopePath,
      treeHash: treeResult.stdout,
    };
  });
}

async function buildTreePatch(input: {
  fromTreeHash: string;
  repoRoot: string;
  scopePath: string | null;
  toTreeHash: string;
}) {
  const args = [
    "diff",
    "--binary",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...(input.scopePath ? [`--relative=${input.scopePath}`] : []),
    input.fromTreeHash,
    input.toTreeHash,
    ...(input.scopePath ? ["--", input.scopePath] : []),
  ];
  const result = await runGitText(args, input.repoRoot);
  if (result.stdout) {
    return normalizePatchPaths(result.stdout);
  }

  if (result.code === 0) {
    return "";
  }

  if (result.code !== 1) {
    throw new Error(result.stderr || "Failed to build checkpoint patch.");
  }

  return normalizePatchPaths(result.stdout);
}

async function listChangedPathsBetweenTrees(input: {
  fromTreeHash: string;
  projectPath: string;
  repoRoot: string;
  scopePath: string | null;
  toTreeHash: string;
}) {
  const args = [
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    ...(input.scopePath ? [`--relative=${input.scopePath}`] : []),
    input.fromTreeHash,
    input.toTreeHash,
    ...(input.scopePath ? ["--", input.scopePath] : []),
  ];
  const result = await runGitBuffer(args, input.repoRoot);
  if (result.code !== 0 && result.code !== 1) {
    throw new Error(result.stderr || "Failed to list checkpoint file changes.");
  }

  const output = result.stdout.toString("utf8");
  return output
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.split("\t").at(-1)?.trim() ?? "")
    .filter(Boolean);
}

async function readTreeEntry(input: {
  pathRelativeToProject: string;
  projectPath: string;
  repoRoot: string;
  scopePath: string | null;
  treeHash: string;
}): Promise<TreeEntry | null> {
  const repoRelativePath = input.scopePath
    ? `${input.scopePath}/${toPosixPath(input.pathRelativeToProject)}`
    : toPosixPath(input.pathRelativeToProject);
  const lsTreeResult = await runGitTrimmed(
    ["ls-tree", input.treeHash, "--", repoRelativePath],
    input.repoRoot,
  );
  if (lsTreeResult.code !== 0) {
    throw new Error(
      lsTreeResult.stderr || "Unable to inspect checkpoint tree.",
    );
  }

  if (!lsTreeResult.stdout) {
    return null;
  }

  const mode = lsTreeResult.stdout.split(/\s+/)[0] ?? "";
  const showResult = await runGitBuffer(
    ["show", `${input.treeHash}:${repoRelativePath}`],
    input.repoRoot,
  );
  if (showResult.code !== 0) {
    throw new Error(showResult.stderr || "Unable to read checkpoint file.");
  }

  return {
    content: showResult.stdout,
    mode,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function createRepoCheckpointSnapshot(
  projectPath: string,
): Promise<RepoCheckpointSnapshot> {
  const snapshot = await captureTreeSnapshot(projectPath);
  return {
    projectPath,
    repoRoot: snapshot.repoRoot,
    scopePath: snapshot.scopePath,
    treeHash: snapshot.treeHash,
  };
}

export async function disposeRepoCheckpointSnapshot(
  _snapshot: RepoCheckpointSnapshot | null | undefined,
) {}

export async function buildRepoCheckpointDiff(
  snapshot: RepoCheckpointSnapshot,
): Promise<RepoCheckpointDiff> {
  const afterSnapshot = await captureTreeSnapshot(
    snapshot.projectPath,
    snapshot.repoRoot,
  );
  if (afterSnapshot.treeHash === snapshot.treeHash) {
    return {
      afterTreeHash: afterSnapshot.treeHash,
      changedPaths: [],
      forwardPatch: "",
      reversePatch: "",
    };
  }

  const [forwardPatch, reversePatch] = await Promise.all([
    buildTreePatch({
      fromTreeHash: snapshot.treeHash,
      repoRoot: snapshot.repoRoot,
      scopePath: snapshot.scopePath,
      toTreeHash: afterSnapshot.treeHash,
    }),
    buildTreePatch({
      fromTreeHash: afterSnapshot.treeHash,
      repoRoot: snapshot.repoRoot,
      scopePath: snapshot.scopePath,
      toTreeHash: snapshot.treeHash,
    }),
  ]);

  const changedPaths = splitPatchSections(forwardPatch)
    .map((section) => parsePatchPath(section))
    .filter((value): value is string => Boolean(value));

  return {
    afterTreeHash: afterSnapshot.treeHash,
    changedPaths,
    forwardPatch,
    reversePatch,
  };
}

export async function getRepoHeadCommit(
  projectPath: string,
): Promise<string | null> {
  const result = await runGit(["rev-parse", "--verify", "HEAD"], projectPath);
  const stdout = normalizeGitCommandOutput(result.stdout);
  return result.code === 0 && stdout ? stdout : null;
}

async function runGit(args: string[], cwd: string) {
  const result = await runGitText(args, cwd);
  return {
    ...result,
    stdout: result.stdout,
  };
}

export async function applyRepoCheckpointPatch({
  patch,
  projectPath,
}: {
  patch: string;
  projectPath: string;
}): Promise<RepoCheckpointPatchApplyResult> {
  const sections = splitPatchSections(patch);
  if (sections.length === 0) {
    return {
      appliedPaths: [],
      failedPaths: [],
    };
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), SNAPSHOT_PREFIX));

  try {
    const appliedPaths: string[] = [];
    const failedPaths: PatchApplyFailure[] = [];

    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index]!.endsWith("\n")
        ? sections[index]!
        : `${sections[index]}\n`;
      const filePath = parsePatchPath(section) ?? `patch-${index + 1}`;
      const patchPath = path.join(tempRoot, `patch-${index + 1}.diff`);
      await writeFile(patchPath, section, "utf8");

      const checkResult = await runGit(
        ["apply", "--check", "--binary", "--whitespace=nowarn", patchPath],
        projectPath,
      );
      if (checkResult.code !== 0) {
        failedPaths.push({
          error:
            normalizeGitCommandOutput(checkResult.stderr) ||
            "Patch check failed.",
          path: filePath,
        });
        continue;
      }

      const applyResult = await runGitTrimmed(
        ["apply", "--binary", "--whitespace=nowarn", patchPath],
        projectPath,
      );
      if (applyResult.code !== 0) {
        failedPaths.push({
          error: applyResult.stderr || "Patch apply failed.",
          path: filePath,
        });
        continue;
      }

      appliedPaths.push(filePath);
    }

    return {
      appliedPaths,
      failedPaths,
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

export async function restoreRepoCheckpointTree(input: {
  projectPath: string;
  repoRoot: string;
  targetTreeHash: string;
}) {
  const currentSnapshot = await captureTreeSnapshot(
    input.projectPath,
    input.repoRoot,
  );
  const changedPaths = await listChangedPathsBetweenTrees({
    fromTreeHash: currentSnapshot.treeHash,
    projectPath: input.projectPath,
    repoRoot: input.repoRoot,
    scopePath: currentSnapshot.scopePath,
    toTreeHash: input.targetTreeHash,
  });

  if (changedPaths.length === 0) {
    return {
      appliedPaths: [],
      failedPaths: [],
    };
  }

  const appliedPaths: string[] = [];
  const failedPaths: PatchApplyFailure[] = [];

  for (const changedPath of changedPaths) {
    const absolutePath = path.join(input.projectPath, changedPath);

    try {
      const entry = await readTreeEntry({
        pathRelativeToProject: changedPath,
        projectPath: input.projectPath,
        repoRoot: input.repoRoot,
        scopePath: currentSnapshot.scopePath,
        treeHash: input.targetTreeHash,
      });

      if (!entry) {
        await rm(absolutePath, { force: true, recursive: true });
        appliedPaths.push(changedPath);
        continue;
      }

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, entry.content);
      if (entry.mode === "100755") {
        await chmod(absolutePath, 0o755).catch(() => undefined);
      }
      appliedPaths.push(changedPath);
    } catch (error) {
      failedPaths.push({
        error: toErrorMessage(error),
        path: changedPath,
      });
    }
  }

  return {
    appliedPaths,
    failedPaths,
  };
}
