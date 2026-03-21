import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";
import {
  isPathWithinRoot,
  normalizeRelativePath,
  resolveToolDirectory,
  toPosixPath,
} from "./paths";

export const DEFAULT_LIST_IGNORES = [
  ".git",
  ".next",
  ".turbo",
  ".yarn",
  ".idea",
  ".vscode",
  ".cache",
  "__pycache__",
  "bin",
  "build",
  "coverage",
  "dist",
  "env",
  "logs",
  "node_modules",
  "obj",
  "target",
  "temp",
  "tmp",
  "vendor",
  "venv",
  ".venv",
];

export const LIST_LIMIT = 160;
const DEFAULT_MAX_DEPTH = 12;
const MAX_ALLOWED_DEPTH = 64;

const listEntrySchema = z.object({
  depth: z.number().int().min(0),
  kind: z.enum(["directory", "file"]),
  name: z.string(),
  path: z.string(),
});

export const listInputSchema = z.object({
  ignore: z
    .array(z.string().min(1))
    .max(32)
    .optional()
    .describe(
      "Optional path prefixes, names, or simple glob patterns to exclude from the listing.",
    ),
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
      "Directory path to inspect. In default permissions mode this must be relative to the selected workspace root.",
    ),
});

export const listOutputSchema = z.object({
  directoryCount: z.number().int().min(0),
  entries: z.array(listEntrySchema),
  fileCount: z.number().int().min(0),
  requestedPath: z.string(),
  resolvedBase: z.string(),
  resolvedPath: z.string(),
  root: z.string(),
  totalEntries: z.number().int().min(0),
  tree: z.string(),
  truncated: z.boolean(),
});

export type ListInput = z.infer<typeof listInputSchema>;
export type ListOutput = z.infer<typeof listOutputSchema>;

type ListEntry = ListOutput["entries"][number];

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function simpleGlobToRegExp(pattern: string) {
  const normalized = normalizeRelativePath(pattern);
  const regexSource = escapeRegExp(normalized)
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");

  return new RegExp(`^${regexSource}(?:/.*)?$`);
}

function buildIgnoreMatcher(ignore: string[] | undefined) {
  const defaultIgnoredNames = new Set(DEFAULT_LIST_IGNORES);
  const normalizedPatterns = (ignore ?? [])
    .map((pattern) => normalizeRelativePath(pattern))
    .filter((pattern) => pattern !== ".");
  const deepLiteralPatterns = normalizedPatterns
    .filter((pattern) => pattern.endsWith("/**"))
    .map((pattern) => pattern.slice(0, -3));
  const globPatterns = normalizedPatterns
    .filter((pattern) => pattern.includes("*") && !pattern.endsWith("/**"))
    .map((pattern) => simpleGlobToRegExp(pattern));
  const literalPatterns = normalizedPatterns.filter(
    (pattern) => !pattern.includes("*") && !pattern.endsWith("/**"),
  );

  return (relativePath: string, name: string) => {
    if (defaultIgnoredNames.has(name)) {
      return true;
    }

    if (literalPatterns.some((pattern) => pattern === name)) {
      return true;
    }

    if (
      literalPatterns.some(
        (pattern) =>
          relativePath === pattern || relativePath.startsWith(`${pattern}/`),
      )
    ) {
      return true;
    }

    if (
      deepLiteralPatterns.some(
        (pattern) =>
          relativePath === pattern || relativePath.startsWith(`${pattern}/`),
      )
    ) {
      return true;
    }

    return globPatterns.some(
      (pattern) => pattern.test(relativePath) || pattern.test(name),
    );
  };
}

function sortEntriesByName(
  left: Pick<ListEntry, "name">,
  right: Pick<ListEntry, "name">,
) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatTree(root: string, entries: ListEntry[]) {
  const lines = [`${root === "." ? "." : root}/`];

  for (const entry of entries) {
    const indent = "  ".repeat(entry.depth + 1);
    const suffix = entry.kind === "directory" ? "/" : "";
    lines.push(`${indent}${entry.name}${suffix}`);
  }

  return lines.join("\n");
}

export async function executeList({
  defaultDirectory,
  extraAllowedRoots,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  input: ListInput;
  permissionMode: PermissionMode;
}): Promise<ListOutput> {
  const { requestedPath, resolvedBase, resolvedDirectory, rootLabel } =
    resolveToolDirectory({
      defaultDirectory,
      ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
      permissionMode,
      requestedPath: input.path,
      toolName: "list",
    });
  const directoryStats = await stat(resolvedDirectory).catch(() => null);

  if (!directoryStats) {
    throw new Error(`Directory not found: ${rootLabel}`);
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(`Path is not a directory: ${rootLabel}`);
  }

  const shouldIgnore = buildIgnoreMatcher(input.ignore);
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const entries: ListEntry[] = [];
  let directoryCount = 0;
  let fileCount = 0;
  let truncated = false;

  const walk = async (
    currentAbsolutePath: string,
    currentRelativePath: string,
    depth: number,
  ) => {
    const dirents = await readdir(currentAbsolutePath, {
      withFileTypes: true,
    });
    const directories: Array<{
      absolutePath: string;
      name: string;
      relativePath: string;
    }> = [];
    const files: Array<{ name: string; relativePath: string }> = [];

    for (const dirent of dirents) {
      const relativePath =
        currentRelativePath === "."
          ? dirent.name
          : `${currentRelativePath}/${dirent.name}`;

      if (shouldIgnore(relativePath, dirent.name)) {
        continue;
      }

      if (dirent.isDirectory()) {
        directories.push({
          absolutePath: path.join(currentAbsolutePath, dirent.name),
          name: dirent.name,
          relativePath,
        });
        continue;
      }

      files.push({
        name: dirent.name,
        relativePath,
      });
    }

    directories.sort(sortEntriesByName);
    files.sort(sortEntriesByName);

    for (const directory of directories) {
      if (entries.length >= LIST_LIMIT) {
        truncated = true;
        return;
      }

      entries.push({
        depth,
        kind: "directory",
        name: directory.name,
        path: directory.relativePath,
      });
      directoryCount += 1;

      if (depth >= maxDepth) {
        truncated = true;
        continue;
      }

      await walk(directory.absolutePath, directory.relativePath, depth + 1);

      if (truncated) {
        return;
      }
    }

    for (const file of files) {
      if (entries.length >= LIST_LIMIT) {
        truncated = true;
        return;
      }

      entries.push({
        depth,
        kind: "file",
        name: file.name,
        path: file.relativePath,
      });
      fileCount += 1;
    }
  };

  await walk(resolvedDirectory, ".", 0);

  return {
    directoryCount,
    entries,
    fileCount,
    requestedPath,
    resolvedBase,
    resolvedPath: resolvedDirectory,
    root: rootLabel,
    totalEntries: entries.length,
    tree: formatTree(rootLabel, entries),
    truncated,
  };
}

export const __internal = {
  DEFAULT_MAX_DEPTH,
  MAX_ALLOWED_DEPTH,
};
