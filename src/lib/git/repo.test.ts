import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "@/lib/process/run-command";

import {
  commitAllChanges,
  createAndCheckoutBranch,
  initializeRepository,
  pushCurrentBranch,
  resolveRepoContext,
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
});

describe("repo actions", () => {
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
});
