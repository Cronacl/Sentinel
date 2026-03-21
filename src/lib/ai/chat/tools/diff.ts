import { readFile, stat } from "node:fs/promises";
import { z } from "zod";

import { createUnifiedDiff } from "@/lib/diff/unified";
import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

const MAX_DIFF_CHARS = 120_000;

export const diffInputSchema = z
  .object({
    comparePath: z.string().min(1).optional(),
    contextLines: z.number().int().min(0).max(20).optional(),
    path: z.string().min(1),
    proposedContent: z.string().optional(),
  })
  .refine(
    (value) =>
      (typeof value.comparePath === "string") !==
      (typeof value.proposedContent === "string"),
    "Provide exactly one of comparePath or proposedContent.",
  );

export const diffOutputSchema = z.object({
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  diff: z.string(),
  leftPath: z.string(),
  rightPath: z.string(),
  truncated: z.boolean(),
});

export type DiffInput = z.infer<typeof diffInputSchema>;
export type DiffOutput = z.infer<typeof diffOutputSchema>;

async function readTextFile(resolvedPath: string, label: string) {
  const targetStats = await stat(resolvedPath).catch(() => null);

  if (!targetStats) {
    throw new Error(`Path not found: ${label}`);
  }

  if (!targetStats.isFile()) {
    throw new Error(`Path is not a regular file: ${label}`);
  }

  return await readFile(resolvedPath, "utf8");
}

export async function executeDiff({
  defaultDirectory,
  extraAllowedRoots,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  extraAllowedRoots?: readonly string[];
  input: DiffInput;
  permissionMode: PermissionMode;
}): Promise<DiffOutput> {
  const left = resolveToolPath({
    defaultDirectory,
    ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
    permissionMode,
    requestedPath: input.path,
    toolName: "diff",
  });
  const before = await readTextFile(left.resolvedPath, left.label);

  const right =
    typeof input.comparePath === "string"
      ? resolveToolPath({
          defaultDirectory,
          ...(extraAllowedRoots ? { extraAllowedRoots } : {}),
          permissionMode,
          requestedPath: input.comparePath,
          toolName: "diff",
        })
      : null;

  const after =
    right == null
      ? (input.proposedContent ?? "")
      : await readTextFile(right.resolvedPath, right.label);

  const result = createUnifiedDiff({
    after,
    before,
    contextLines: input.contextLines,
    leftPath: left.label,
    rightPath: right?.label ?? left.label,
  });

  return {
    ...result,
    diff:
      result.diff.length > MAX_DIFF_CHARS
        ? `${result.diff.slice(0, MAX_DIFF_CHARS)}\n... [truncated]`
        : result.diff,
    leftPath: left.label,
    rightPath: right?.label ?? left.label,
    truncated: result.diff.length > MAX_DIFF_CHARS,
  };
}
