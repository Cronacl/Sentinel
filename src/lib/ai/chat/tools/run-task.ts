import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import {
  type ShellCommandCompletedOutput,
  type ShellCommandRunningOutput,
  streamShellCommand,
} from "./shell";
import { isPathWithinRoot, resolveToolDirectory } from "./paths";

const runTaskNameSchema = z.enum([
  "build",
  "format",
  "lint",
  "test",
  "typecheck",
]);

const packageManagerSchema = z.enum(["bun", "npm", "pnpm", "yarn"]);

const runTaskBaseOutputSchema = z.object({
  command: z.string(),
  cwd: z.string(),
  durationMs: z.number(),
  packageManager: packageManagerSchema,
  phase: z.enum(["completed", "running"]),
  script: z.string(),
  task: runTaskNameSchema,
  truncated: z.boolean(),
});

export const runTaskInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory path to run the task from. In default permissions mode this must be relative to the selected workspace root.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe("Why this project task should run."),
  task: runTaskNameSchema.describe(
    "Project task to run using the nearest package.json script.",
  ),
});

export const runTaskRunningOutputSchema = runTaskBaseOutputSchema.extend({
  phase: z.literal("running"),
  tail: z.string(),
});

export const runTaskCompletedOutputSchema = runTaskBaseOutputSchema.extend({
  exitCode: z.number(),
  phase: z.literal("completed"),
  stderr: z.string(),
  stdout: z.string(),
});

export const runTaskOutputSchema = z.discriminatedUnion("phase", [
  runTaskRunningOutputSchema,
  runTaskCompletedOutputSchema,
]);

export type RunTaskInput = z.infer<typeof runTaskInputSchema>;
export type RunTaskOutput = z.infer<typeof runTaskOutputSchema>;
export type RunTaskName = z.infer<typeof runTaskNameSchema>;

type PackageManager = z.infer<typeof packageManagerSchema>;
export type RunTaskStreamEvent =
  | { output: RunTaskOutput; type: "running" }
  | { output: RunTaskOutput; type: "completed" }
  | { error: Error; type: "error" };

const TASK_SCRIPT_CANDIDATES: Record<RunTaskName, string[]> = {
  build: ["build"],
  format: ["format", "fmt", "prettier"],
  lint: ["lint"],
  test: ["test"],
  typecheck: ["typecheck", "check-types"],
};

function detectPackageManager(
  packageJson: { packageManager?: unknown },
  packageRoot: string,
): PackageManager {
  const packageManagerValue =
    typeof packageJson.packageManager === "string"
      ? packageJson.packageManager
      : undefined;

  if (packageManagerValue?.startsWith("bun@")) return "bun";
  if (packageManagerValue?.startsWith("pnpm@")) return "pnpm";
  if (packageManagerValue?.startsWith("yarn@")) return "yarn";
  if (packageManagerValue?.startsWith("npm@")) return "npm";

  const candidates: Array<{ file: string; manager: PackageManager }> = [
    { file: "bun.lock", manager: "bun" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
  ];

  for (const candidate of candidates) {
    if (requirePathExists(path.join(packageRoot, candidate.file))) {
      return candidate.manager;
    }
  }

  return "npm";
}

function requirePathExists(candidatePath: string) {
  return existsSync(candidatePath);
}

function buildPackageManagerCommand(
  packageManager: PackageManager,
  script: string,
) {
  switch (packageManager) {
    case "bun":
      return `bun run ${script}`;
    case "pnpm":
      return `pnpm run ${script}`;
    case "yarn":
      return `yarn ${script}`;
    default:
      return `npm run ${script}`;
  }
}

async function resolvePackageRoot({
  boundaryRoot,
  searchDirectory,
}: {
  boundaryRoot?: string;
  searchDirectory: string;
}) {
  let currentDirectory = searchDirectory;

  while (true) {
    const packageJsonPath = path.join(currentDirectory, "package.json");
    const packageStats = await stat(packageJsonPath).catch(() => null);

    if (packageStats?.isFile()) {
      return packageJsonPath;
    }

    if (boundaryRoot && path.resolve(currentDirectory) === path.resolve(boundaryRoot)) {
      return null;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export async function resolveRunTaskCommand({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: RunTaskInput;
  permissionMode: PermissionMode;
}) {
  const { resolvedDirectory } = resolveToolDirectory({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "run_task",
  });
  const directoryStats = await stat(resolvedDirectory).catch(() => null);

  if (!directoryStats) {
    throw new Error(`Directory not found: ${input.path ?? "."}`);
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(`Path is not a directory: ${input.path ?? "."}`);
  }

  const boundaryRoot = permissionMode === "default" ? defaultDirectory : undefined;
  const packageJsonPath = await resolvePackageRoot({
    ...(boundaryRoot ? { boundaryRoot } : {}),
    searchDirectory: resolvedDirectory,
  });

  if (!packageJsonPath) {
    throw new Error("No package.json was found for the requested task path.");
  }

  if (
    permissionMode === "default" &&
    !isPathWithinRoot(path.dirname(packageJsonPath), defaultDirectory)
  ) {
    throw new Error(
      "The resolved project root must stay inside the selected workspace root.",
    );
  }

  const packageRoot = path.dirname(packageJsonPath);
  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonText) as {
    packageManager?: unknown;
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  const script =
    TASK_SCRIPT_CANDIDATES[input.task].find((candidate) => candidate in scripts) ?? null;

  if (!script) {
    const availableScripts = Object.keys(scripts).sort();
    throw new Error(
      availableScripts.length > 0
        ? `No ${input.task} script was found. Available scripts: ${availableScripts.join(", ")}`
        : `No ${input.task} script was found in ${packageJsonPath}.`,
    );
  }

  const packageManager = detectPackageManager(packageJson, packageRoot);

  return {
    command: buildPackageManagerCommand(packageManager, script),
    cwd: packageRoot,
    packageManager,
    script,
    task: input.task,
  };
}

function toRunTaskOutput(
  resolved: Awaited<ReturnType<typeof resolveRunTaskCommand>>,
  output: ShellCommandRunningOutput | ShellCommandCompletedOutput,
): RunTaskOutput {
  if (output.phase === "running") {
    return {
      command: resolved.command,
      cwd: output.cwd,
      durationMs: output.durationMs,
      packageManager: resolved.packageManager,
      phase: "running",
      script: resolved.script,
      tail: output.tail,
      task: resolved.task,
      truncated: output.truncated,
    };
  }

  return {
    command: resolved.command,
    cwd: output.cwd,
    durationMs: output.durationMs,
    exitCode: output.exitCode,
    packageManager: resolved.packageManager,
    phase: "completed",
    script: resolved.script,
    stderr: output.stderr,
    stdout: output.stdout,
    task: resolved.task,
    truncated: output.truncated,
  };
}

export async function* streamRunTask({
  allowedRoot,
  defaultDirectory,
  input,
  permissionMode,
  threadId,
}: {
  allowedRoot?: string;
  defaultDirectory: string;
  input: RunTaskInput;
  permissionMode: PermissionMode;
  threadId: string;
}): AsyncIterable<RunTaskStreamEvent> {
  const resolved = await resolveRunTaskCommand({
    defaultDirectory,
    input,
    permissionMode,
  });

  for await (const event of streamShellCommand({
    allowedRoot: permissionMode === "default" ? allowedRoot : undefined,
    command: resolved.command,
    defaultDirectory: resolved.cwd,
    permissionMode,
    threadId,
  })) {
    if (event.type === "error") {
      yield event;
      continue;
    }

    yield {
      output: toRunTaskOutput(resolved, event.output),
      type: event.type,
    };
  }
}

export const __internal = {
  TASK_SCRIPT_CANDIDATES,
  buildPackageManagerCommand,
  detectPackageManager,
};
