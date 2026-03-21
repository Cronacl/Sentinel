import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "@/lib/process/run-command";

import { executeGit } from "./git";

async function createDirectory() {
  return await mkdtemp(path.join(tmpdir(), "sentinel-git-"));
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
}

async function createRepo() {
  const directory = await createDirectory();
  await runGit(["init"], directory);
  await runGit(["config", "user.email", "sentinel@example.com"], directory);
  await runGit(["config", "user.name", "Sentinel"], directory);
  await writeFile(path.join(directory, "file.ts"), "export const value = 1;\n");
  await runGit(["add", "--", "file.ts"], directory);
  await runGit(["commit", "-m", "Initial commit"], directory);
  return directory;
}

describe("executeGit", () => {
  it("returns structured status, diff, and log output", async () => {
    const defaultDirectory = await createRepo();
    await writeFile(
      path.join(defaultDirectory, "file.ts"),
      "export const value = 2;\n",
    );

    const status = await executeGit({
      defaultDirectory,
      input: { action: "status" },
      permissionMode: "default",
    });
    const diff = await executeGit({
      defaultDirectory,
      input: { action: "diff" },
      permissionMode: "default",
    });
    const log = await executeGit({
      defaultDirectory,
      input: { action: "log", limit: 1 },
      permissionMode: "default",
    });

    if (
      status.action !== "status" ||
      diff.action !== "diff" ||
      log.action !== "log"
    ) {
      throw new Error("Unexpected git action output");
    }

    expect(status.action).toBe("status");
    expect(status.isClean).toBe(false);
    expect(diff.action).toBe("diff");
    expect(diff.diff).toContain("-export const value = 1;");
    expect(log.action).toBe("log");
    expect(log.commits).toHaveLength(1);
  });

  it("rejects branch changes on a dirty worktree", async () => {
    const defaultDirectory = await createRepo();
    await writeFile(
      path.join(defaultDirectory, "file.ts"),
      "export const value = 2;\n",
    );

    await expect(
      executeGit({
        defaultDirectory,
        input: { action: "branch_create", name: "feature/test" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/clean worktree/i);

    await expect(
      executeGit({
        defaultDirectory,
        input: { action: "checkout", branch: "main" },
        permissionMode: "default",
      }),
    ).rejects.toThrow(/clean worktree/i);
  });

  it("stages and commits files with structured responses", async () => {
    const defaultDirectory = await createRepo();
    await writeFile(
      path.join(defaultDirectory, "file.ts"),
      "export const value = 2;\n",
    );

    const addResult = await executeGit({
      defaultDirectory,
      input: { action: "add", paths: ["file.ts"] },
      permissionMode: "default",
    });
    const commitResult = await executeGit({
      defaultDirectory,
      input: { action: "commit", message: "Update value" },
      permissionMode: "default",
    });

    if (addResult.action !== "add" || commitResult.action !== "commit") {
      throw new Error("Unexpected git action output");
    }

    expect(addResult.action).toBe("add");
    expect(addResult.paths).toEqual(["file.ts"]);
    expect(commitResult.action).toBe("commit");
    expect(commitResult.commit).toHaveLength(40);
  });
});
