import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "@/lib/process/run-command";

import {
  buildFallbackCommitMessage,
  checkoutBranch,
  commitAllChanges,
  createAndCheckoutBranch,
  getHeadCommitMessage,
  getCommitMessageContext,
  getRepoDiffPanelData,
  initializeRepository,
  listBranches,
  parseShortStat,
  pushCurrentBranch,
  revertFiles,
  resolveRepoContext,
  stageFiles,
  unstageFiles,
} from "./repo";

async function createDirectory(prefix: string) {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

async function runGit(args: string[], cwd: string) {
  const result = await runCommand({
    args,
    command: "git",
    cwd,
  });

  if (result.code !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

async function createRepo() {
  const directory = await createDirectory("sentinel-repo-");
  await runGit(["init", "-b", "main"], directory);
  await runGit(["config", "user.email", "sentinel@example.com"], directory);
  await runGit(["config", "user.name", "Sentinel"], directory);
  await writeFile(path.join(directory, "file.ts"), "export const value = 1;\n");
  await runGit(["add", "-A"], directory);
  await runGit(["commit", "-m", "Initial commit"], directory);
  return directory;
}

describe("parseShortStat", () => {
  it("parses insertions and deletions from shortstat output", () => {
    expect(
      parseShortStat(" 3 files changed, 50 insertions(+), 10 deletions(-)"),
    ).toEqual({ deletions: 10, insertions: 50 });
  });

  it("handles insertions only", () => {
    expect(parseShortStat(" 1 file changed, 3 insertions(+)")).toEqual({
      deletions: 0,
      insertions: 3,
    });
  });

  it("handles deletions only", () => {
    expect(parseShortStat(" 1 file changed, 7 deletions(-)")).toEqual({
      deletions: 7,
      insertions: 0,
    });
  });

  it("returns zeros for empty input", () => {
    expect(parseShortStat("")).toEqual({ deletions: 0, insertions: 0 });
  });
});

describe("resolveRepoContext", () => {
  it("returns git repo context for the repo root and nested directories", async () => {
    const repoRoot = await createRepo();
    const nestedDirectory = path.join(repoRoot, "src");
    await mkdir(nestedDirectory, { recursive: true });

    const rootContext = await resolveRepoContext(repoRoot);
    const nestedContext = await resolveRepoContext(nestedDirectory);
    const missingContext = await resolveRepoContext(
      path.join(repoRoot, "missing"),
    );

    expect(rootContext.isGitRepo).toBe(true);
    expect(path.basename(rootContext.repoRoot ?? "")).toBe(
      path.basename(repoRoot),
    );
    expect(rootContext.branch).toBe("main");
    expect(rootContext.changedFileCount).toBe(0);
    expect(rootContext.insertions).toBe(0);
    expect(rootContext.deletions).toBe(0);
    expect(nestedContext.isGitRepo).toBe(true);
    expect(path.basename(nestedContext.repoRoot ?? "")).toBe(
      path.basename(repoRoot),
    );
    expect(missingContext.isGitRepo).toBe(false);
  });

  it("detects GitHub remotes, upstream state, and ahead counts", async () => {
    const repoRoot = await createRepo();
    const remoteRoot = await createDirectory("sentinel-remote-");
    await runGit(["init", "--bare"], remoteRoot);
    await runGit(["remote", "add", "origin", remoteRoot], repoRoot);
    await runGit(["push", "-u", "origin", "main"], repoRoot);
    await runGit(
      ["remote", "set-url", "origin", "git@github.com:openai/sentinel.git"],
      repoRoot,
    );

    let context = await resolveRepoContext(repoRoot);
    expect(context.hasUpstream).toBe(true);
    expect(context.aheadCount).toBe(0);
    expect(context.githubRemote).toMatchObject({
      owner: "openai",
      repo: "sentinel",
      defaultBranch: "main",
    });

    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );
    await commitAllChanges(repoRoot, "Update value");

    context = await resolveRepoContext(repoRoot);
    expect(context.aheadCount).toBe(1);
    expect(context.hasChanges).toBe(false);
  });

  it("reports changed file count and line stats for dirty trees", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\nexport const extra = true;\n",
    );
    await writeFile(path.join(repoRoot, "new.ts"), "export const n = 1;\n");

    const context = await resolveRepoContext(repoRoot);
    expect(context.hasChanges).toBe(true);
    expect(context.changedFileCount).toBe(2);
    expect(context.insertions).toBeGreaterThan(0);
  });

  it("detects first-push state when a remote exists without upstream", async () => {
    const repoRoot = await createRepo();
    const remoteRoot = await createDirectory("sentinel-first-push-");
    await runGit(["init", "--bare"], remoteRoot);
    await runGit(["remote", "add", "origin", remoteRoot], repoRoot);

    const context = await resolveRepoContext(repoRoot);
    expect(context.hasRemotes).toBe(true);
    expect(context.hasCommits).toBe(true);
    expect(context.hasUpstream).toBe(false);
    expect(context.pushRemoteName).toBe("origin");
  });
});

describe("repo actions", () => {
  it("builds commit message context and a fallback message", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "src.ts"),
      "export const created = true;\n",
    );

    const context = await getCommitMessageContext(repoRoot);

    expect(context.changes).toEqual([
      {
        path: "src.ts",
        type: "untracked",
      },
    ]);
    expect(context.summary).toBe("? src.ts");
    expect(context.patch).toContain("diff --git a/src.ts b/src.ts");
    expect(context.patch).toContain("new file mode 100644");
    expect(context.patch).toContain("+export const created = true;");
    expect(buildFallbackCommitMessage(context.changes)).toBe("Add src");
  });

  it("creates commits with subject and body when a formatted message is provided", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );

    await commitAllChanges(
      repoRoot,
      "Update value\n\n- add body line\n- add another line",
    );

    const subject = await runGit(["log", "-1", "--pretty=%s"], repoRoot);
    const body = await runGit(["log", "-1", "--pretty=%b"], repoRoot);

    expect(subject.trim()).toBe("Update value");
    expect(body.trim()).toBe("- add body line\n- add another line");
  });

  it("commits only staged changes when unstaged changes are excluded", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );
    await writeFile(path.join(repoRoot, "new.ts"), "export const n = 1;\n");
    await runGit(["add", "file.ts"], repoRoot);

    await commitAllChanges(repoRoot, "Update staged value", false);

    const changedFiles = await runGit(
      ["show", "--name-only", "--pretty="],
      repoRoot,
    );
    const status = await runGit(["status", "--porcelain=v1"], repoRoot);

    expect(changedFiles.trim()).toBe("file.ts");
    expect(status).toContain("?? new.ts");
  });

  it("fails when no staged changes are available and unstaged changes are excluded", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 3;\n",
    );

    await expect(
      commitAllChanges(repoRoot, "Skip unstaged changes", false),
    ).rejects.toThrow(
      "Commit requires staged changes when unstaged changes are excluded.",
    );
  });

  it("reads the latest commit message as subject and body", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );

    await commitAllChanges(repoRoot, "Update latest\n\n- include body");

    await expect(getHeadCommitMessage(repoRoot)).resolves.toEqual({
      body: "- include body",
      message: "Update latest\n\n- include body",
      subject: "Update latest",
    });
  });

  it("initializes a repository for a plain directory", async () => {
    const directory = await createDirectory("sentinel-init-");

    await expect(resolveRepoContext(directory)).resolves.toMatchObject({
      isGitRepo: false,
    });

    await expect(initializeRepository(directory)).resolves.toMatchObject({
      repoRoot: expect.any(String),
    });

    const context = await resolveRepoContext(directory);
    expect(context.isGitRepo).toBe(true);
    expect(context.branch).toBe("main");
  });

  it("creates and checks out a branch", async () => {
    const repoRoot = await createRepo();

    const result = await createAndCheckoutBranch(
      repoRoot,
      "feature/header-actions",
    );
    const branch = await runGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoRoot,
    );

    expect(result.branch).toBe("feature/header-actions");
    expect(branch.trim()).toBe("feature/header-actions");
  });

  it("lists local branches and marks the current branch", async () => {
    const repoRoot = await createRepo();
    await createAndCheckoutBranch(repoRoot, "feature/list-branches");
    await runGit(["checkout", "main"], repoRoot);

    const result = await listBranches(repoRoot);

    expect(result.branch).toBe("main");
    expect(result.branches).toEqual(
      expect.arrayContaining([
        { current: true, name: "main" },
        { current: false, name: "feature/list-branches" },
      ]),
    );
  });

  it("checks out an existing branch", async () => {
    const repoRoot = await createRepo();
    await createAndCheckoutBranch(repoRoot, "feature/switch-target");
    await runGit(["checkout", "main"], repoRoot);

    await expect(
      checkoutBranch(repoRoot, "feature/switch-target"),
    ).resolves.toEqual({
      branch: "feature/switch-target",
    });
  });

  it("pushes the current branch when upstream exists and commits are ahead", async () => {
    const repoRoot = await createRepo();
    const remoteRoot = await createDirectory("sentinel-remote-push-");
    await runGit(["init", "--bare"], remoteRoot);
    await runGit(["remote", "add", "origin", remoteRoot], repoRoot);
    await runGit(["push", "-u", "origin", "main"], repoRoot);

    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 3;\n",
    );
    await commitAllChanges(repoRoot, "Pushable change");

    await expect(pushCurrentBranch(repoRoot)).resolves.toEqual({
      branch: "main",
    });

    const context = await resolveRepoContext(repoRoot);
    expect(context.aheadCount).toBe(0);
  });

  it("pushes the current branch for the first time and sets upstream", async () => {
    const repoRoot = await createRepo();
    const remoteRoot = await createDirectory("sentinel-remote-first-push-");
    await runGit(["init", "--bare"], remoteRoot);
    await runGit(["remote", "add", "origin", remoteRoot], repoRoot);

    await expect(pushCurrentBranch(repoRoot)).resolves.toEqual({
      branch: "main",
    });

    const context = await resolveRepoContext(repoRoot);
    expect(context.hasUpstream).toBe(true);
    expect(context.pushRemoteName).toBe("origin");
  });

  it("returns unstaged diff data including untracked files", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );
    await writeFile(path.join(repoRoot, "new.ts"), "export const n = 1;\n");

    const result = await getRepoDiffPanelData(repoRoot, "unstaged");

    expect(result.mode).toBe("unstaged");
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["file.ts", "new.ts"]),
    );
    expect(
      result.files.find((file) => file.path === "new.ts")?.isUntracked,
    ).toBe(true);
  });

  it("returns only staged entries for staged diff mode", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );
    await writeFile(path.join(repoRoot, "new.ts"), "export const n = 1;\n");
    await runGit(["add", "file.ts"], repoRoot);

    const result = await getRepoDiffPanelData(repoRoot, "staged");

    expect(result.mode).toBe("staged");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("file.ts");
  });

  it("stages, unstages, and reverts files by path", async () => {
    const repoRoot = await createRepo();
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 2;\n",
    );

    await stageFiles(repoRoot, ["file.ts"]);
    await expect(
      getRepoDiffPanelData(repoRoot, "staged"),
    ).resolves.toMatchObject({
      fileCount: 1,
    });

    await unstageFiles(repoRoot, ["file.ts"]);
    await expect(
      getRepoDiffPanelData(repoRoot, "staged"),
    ).resolves.toMatchObject({
      fileCount: 0,
    });

    await revertFiles(repoRoot, ["file.ts"], "unstaged");
    await expect(resolveRepoContext(repoRoot)).resolves.toMatchObject({
      hasChanges: false,
    });
  });

  it("returns branch diff data against the remote default branch", async () => {
    const repoRoot = await createRepo();
    const remoteRoot = await createDirectory("sentinel-branch-diff-");
    await runGit(["init", "--bare"], remoteRoot);
    await runGit(["remote", "add", "origin", remoteRoot], repoRoot);
    await runGit(["push", "-u", "origin", "main"], repoRoot);
    await runGit(
      ["remote", "set-url", "origin", "git@github.com:openai/sentinel.git"],
      repoRoot,
    );
    await createAndCheckoutBranch(repoRoot, "feature/branch-diff");
    await writeFile(
      path.join(repoRoot, "file.ts"),
      "export const value = 4;\n",
    );
    await commitAllChanges(repoRoot, "Branch diff change");

    const result = await getRepoDiffPanelData(repoRoot, "branch");

    expect(result.mode).toBe("branch");
    expect(result.sourceLabel).toBe("feature/branch-diff -> origin/main");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("file.ts");
  });
});
