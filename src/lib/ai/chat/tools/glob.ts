import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { DEFAULT_LIST_IGNORES } from "./list";
import { normalizeRelativePath, resolveToolDirectory } from "./paths";

const GLOB_LIMIT = 100;
const DEFAULT_MAX_DEPTH = 12;
const MAX_ALLOWED_DEPTH = 64;

export const globInputSchema = z.object({
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(MAX_ALLOWED_DEPTH)
    .optional()
    .describe(
      "Maximum directory depth to recurse into. Defaults to 12 levels.",
    ),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory path to search in. In default permissions mode this must be relative to the selected workspace root.",
    ),
  pattern: z
    .string()
    .min(1)
    .describe('Glob pattern to match, for example "*.ts" or "**/*.test.ts".'),
});

export const globOutputSchema = z.object({
  files: z.array(z.string()),
  pattern: z.string(),
  requestedPath: z.string(),
  resolvedBase: z.string(),
  resolvedPath: z.string(),
  root: z.string(),
  shownFiles: z.number().int().min(0),
  totalFiles: z.number().int().min(0),
  truncated: z.boolean(),
});

export type GlobInput = z.infer<typeof globInputSchema>;
export type GlobOutput = z.infer<typeof globOutputSchema>;

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function globToRegExp(pattern: string) {
  const normalizedPattern = normalizeRelativePath(pattern);
  const regexSource = escapeRegExp(normalizedPattern)
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");

  return new RegExp(`^${regexSource}$`);
}

export async function executeGlob({
  defaultDirectory,
  extraAllowedRoots,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  input: GlobInput;
  permissionMode: PermissionMode;
}): Promise<GlobOutput> {
  const { requestedPath, resolvedBase, resolvedDirectory, rootLabel } = resolveToolDirectory({
    defaultDirectory,
    ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
    permissionMode,
    requestedPath: input.path,
    toolName: "glob",
  });
  const targetStats = await stat(resolvedDirectory).catch(() => null);

  if (!targetStats) {
    throw new Error(`Directory not found: ${rootLabel}`);
  }

  if (!targetStats.isDirectory()) {
    throw new Error(`Path is not a directory: ${rootLabel}`);
  }

  const patternMatcher = globToRegExp(input.pattern);
  const ignoredNames = new Set(DEFAULT_LIST_IGNORES);
  const files: string[] = [];
  let totalFiles = 0;
  let truncated = false;
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;

  const walk = async (
    currentDirectory: string,
    currentRelativePath: string,
    depth: number,
  ) => {
    const directoryEntries = await readdir(currentDirectory, {
      withFileTypes: true,
    });

    directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    for (const directoryEntry of directoryEntries) {
      if (ignoredNames.has(directoryEntry.name)) {
        continue;
      }

      const relativePath =
        currentRelativePath === "."
          ? directoryEntry.name
          : `${currentRelativePath}/${directoryEntry.name}`;

      if (directoryEntry.isDirectory()) {
        if (depth >= maxDepth) {
          truncated = true;
          continue;
        }

        await walk(
          path.join(currentDirectory, directoryEntry.name),
          relativePath,
          depth + 1,
        );
        continue;
      }

      const normalizedRelativePath = normalizeRelativePath(relativePath);

      if (!patternMatcher.test(normalizedRelativePath)) {
        continue;
      }

      totalFiles += 1;

      if (files.length < GLOB_LIMIT) {
        files.push(normalizedRelativePath);
      }
    }
  };

  await walk(resolvedDirectory, ".", 0);

  return {
    files,
    pattern: input.pattern,
    requestedPath,
    resolvedBase,
    resolvedPath: resolvedDirectory,
    root: rootLabel,
    shownFiles: files.length,
    totalFiles,
    truncated: truncated || totalFiles > files.length,
  };
}

export const __internal = {
  DEFAULT_MAX_DEPTH,
  GLOB_LIMIT,
  globToRegExp,
  MAX_ALLOWED_DEPTH,
};
