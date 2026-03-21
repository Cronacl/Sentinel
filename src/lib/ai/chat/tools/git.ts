import path from "node:path";
import { z } from "zod";

import { runCommand } from "@/lib/process/run-command";
import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

const MAX_GIT_DIFF_CHARS = 120_000;
const MAX_GIT_LOG_LIMIT = 50;

export const gitInputSchema = z
  .object({
    action: z.enum([
      "status",
      "diff",
      "log",
      "branch_list",
      "branch_create",
      "checkout",
      "add",
      "commit",
    ]),
    branch: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(MAX_GIT_LOG_LIMIT).optional(),
    message: z.string().min(1).max(500).optional(),
    name: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).min(1).max(50).optional(),
    ref: z.string().min(1).optional(),
    staged: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "branch_create" && !value.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "name is required for branch_create",
        path: ["name"],
      });
    }

    if (value.action === "checkout" && !value.branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "branch is required for checkout",
        path: ["branch"],
      });
    }

    if (value.action === "add" && (!value.paths || value.paths.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "paths is required for add",
        path: ["paths"],
      });
    }

    if (value.action === "commit" && !value.message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message is required for commit",
        path: ["message"],
      });
    }
  });

const gitStatusEntrySchema = z.object({
  path: z.string(),
  staged: z.string(),
  unstaged: z.string(),
});

export const gitOutputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    branch: z.string().nullable(),
    isClean: z.boolean(),
    staged: z.array(gitStatusEntrySchema),
    untracked: z.array(z.string()),
    unstaged: z.array(gitStatusEntrySchema),
  }),
  z.object({
    action: z.literal("diff"),
    additions: z.number().int().min(0),
    deletions: z.number().int().min(0),
    diff: z.string(),
    truncated: z.boolean(),
  }),
  z.object({
    action: z.literal("log"),
    commits: z.array(
      z.object({
        author: z.string(),
        date: z.string(),
        hash: z.string(),
        subject: z.string(),
      }),
    ),
    limit: z.number().int().min(1),
  }),
  z.object({
    action: z.literal("branch_list"),
    branches: z.array(
      z.object({
        current: z.boolean(),
        name: z.string(),
      }),
    ),
  }),
  z.object({
    action: z.literal("branch_create"),
    name: z.string(),
  }),
  z.object({
    action: z.literal("checkout"),
    branch: z.string(),
  }),
  z.object({
    action: z.literal("add"),
    paths: z.array(z.string()),
  }),
  z.object({
    action: z.literal("commit"),
    commit: z.string(),
    summary: z.string(),
  }),
]);

export type GitInput = z.infer<typeof gitInputSchema>;
export type GitOutput = z.infer<typeof gitOutputSchema>;

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

function assertSafeName(value: string, label: string) {
  if (value.startsWith("-")) {
    throw new Error(`${label} cannot start with '-'.`);
  }
  if (value === "HEAD") {
    throw new Error(`${label} cannot be HEAD.`);
  }
}

async function assertGitRepo(cwd: string) {
  const result = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (result.code !== 0 || result.stdout !== "true") {
    throw new Error("The selected workspace root is not a git repository.");
  }
}

async function getStatusEntries(cwd: string) {
  const result = await runGit(["status", "--porcelain=v1", "--branch"], cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr || "Failed to read git status.");
  }

  let branch: string | null = null;
  const staged: Array<{ path: string; staged: string; unstaged: string }> = [];
  const unstaged: Array<{ path: string; staged: string; unstaged: string }> =
    [];
  const untracked: string[] = [];

  for (const line of result.stdout.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      branch = line.slice(3).split("...")[0]?.trim() || null;
      continue;
    }

    const stagedCode = line[0] ?? " ";
    const unstagedCode = line[1] ?? " ";
    const filePath = line.slice(3).trim();

    if (stagedCode === "?" && unstagedCode === "?") {
      untracked.push(filePath);
      continue;
    }

    const entry = {
      path: filePath,
      staged: stagedCode,
      unstaged: unstagedCode,
    };

    if (stagedCode !== " ") staged.push(entry);
    if (unstagedCode !== " ") unstaged.push(entry);
  }

  return {
    branch,
    isClean:
      staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
    staged,
    untracked,
    unstaged,
  };
}

function countDiffChanges(diff: string) {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

function resolveGitPath(
  requestedPath: string,
  cwd: string,
  permissionMode: PermissionMode,
) {
  const resolved = resolveToolPath({
    defaultDirectory: cwd,
    permissionMode,
    requestedPath,
    toolName: "git",
  });
  return path.relative(cwd, resolved.resolvedPath) || ".";
}

export async function executeGit({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: GitInput;
  permissionMode: PermissionMode;
}): Promise<GitOutput> {
  await assertGitRepo(defaultDirectory);

  switch (input.action) {
    case "status":
      return {
        action: "status",
        ...(await getStatusEntries(defaultDirectory)),
      };

    case "diff": {
      const args = ["diff"];
      if (input.staged) args.push("--cached");
      if (input.ref) {
        assertSafeName(input.ref, "Git ref");
        args.push(input.ref);
      }
      if (input.path) {
        args.push(
          "--",
          resolveGitPath(input.path, defaultDirectory, permissionMode),
        );
      }
      const result = await runGit(args, defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to generate git diff.");
      }
      const { additions, deletions } = countDiffChanges(result.stdout);
      return {
        action: "diff",
        additions,
        deletions,
        diff:
          result.stdout.length > MAX_GIT_DIFF_CHARS
            ? `${result.stdout.slice(0, MAX_GIT_DIFF_CHARS)}\n... [truncated]`
            : result.stdout,
        truncated: result.stdout.length > MAX_GIT_DIFF_CHARS,
      };
    }

    case "log": {
      const limit = input.limit ?? 10;
      const result = await runGit(
        [
          "log",
          `--max-count=${limit}`,
          "--date=iso-strict",
          "--pretty=format:%H%x1f%an%x1f%ad%x1f%s",
        ],
        defaultDirectory,
      );
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to read git history.");
      }
      const commits = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash = "", author = "", date = "", subject = ""] =
            line.split("\u001f");
          return { author, date, hash, subject };
        });
      return {
        action: "log",
        commits,
        limit,
      };
    }

    case "branch_list": {
      const result = await runGit(["branch", "--list"], defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to list branches.");
      }
      return {
        action: "branch_list",
        branches: result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => ({
            current: line.startsWith("*"),
            name: line.replace(/^[* ]+/, "").trim(),
          })),
      };
    }

    case "branch_create": {
      const branchName = input.name;
      if (!branchName) {
        throw new Error("name is required for branch_create");
      }
      assertSafeName(branchName, "Branch name");
      const status = await getStatusEntries(defaultDirectory);
      if (!status.isClean) {
        throw new Error("Branch creation requires a clean worktree.");
      }
      const result = await runGit(["branch", branchName], defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to create branch.");
      }
      return {
        action: "branch_create",
        name: branchName,
      };
    }

    case "checkout": {
      const branch = input.branch;
      if (!branch) {
        throw new Error("branch is required for checkout");
      }
      assertSafeName(branch, "Branch name");
      const status = await getStatusEntries(defaultDirectory);
      if (!status.isClean) {
        throw new Error("Checkout requires a clean worktree.");
      }
      const result = await runGit(["checkout", branch], defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to checkout branch.");
      }
      return {
        action: "checkout",
        branch,
      };
    }

    case "add": {
      const inputPaths = input.paths;
      if (!inputPaths?.length) {
        throw new Error("paths is required for add");
      }
      const paths = inputPaths.map((requestedPath) =>
        resolveGitPath(requestedPath, defaultDirectory, permissionMode),
      );
      const result = await runGit(["add", "--", ...paths], defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to stage paths.");
      }
      return {
        action: "add",
        paths,
      };
    }

    case "commit": {
      const message = input.message;
      if (!message) {
        throw new Error("message is required for commit");
      }
      const staged = await runGit(
        ["diff", "--cached", "--name-only"],
        defaultDirectory,
      );
      if (staged.code !== 0) {
        throw new Error(staged.stderr || "Failed to inspect staged changes.");
      }
      if (!staged.stdout.trim()) {
        throw new Error("Commit requires staged changes.");
      }
      const result = await runGit(["commit", "-m", message], defaultDirectory);
      if (result.code !== 0) {
        throw new Error(result.stderr || "Failed to create commit.");
      }
      const commit = await runGit(["rev-parse", "HEAD"], defaultDirectory);
      return {
        action: "commit",
        commit: commit.stdout.trim(),
        summary: result.stdout.split("\n")[0] ?? "",
      };
    }
  }
}
