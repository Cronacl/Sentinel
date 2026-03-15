import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { createUnifiedDiff } from "@/lib/diff/unified";
import type { PermissionMode } from "@/lib/security";

import { parsePatch, deriveNewContentsFromChunks } from "./patch";
import { resolveToolPath } from "./paths";

type ApplyPatchFile = {
  additions: number;
  deletions: number;
  diff: string;
  operation: "add" | "delete" | "move" | "update";
  path: string;
};

export const applyPatchInputSchema = z.object({
  patchText: z.string().min(1),
  rationale: z.string().min(1).max(500),
});

export const applyPatchOutputSchema = z.object({
  files: z.array(
    z.object({
      additions: z.number().int().min(0),
      deletions: z.number().int().min(0),
      diff: z.string(),
      operation: z.enum(["add", "delete", "move", "update"]),
      path: z.string(),
    }),
  ),
});

export type ApplyPatchInput = z.infer<typeof applyPatchInputSchema>;
export type ApplyPatchOutput = z.infer<typeof applyPatchOutputSchema>;

function toFileResult(file: ApplyPatchFile): ApplyPatchFile {
  return file;
}

export async function executeApplyPatch({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: ApplyPatchInput;
  permissionMode: PermissionMode;
}): Promise<ApplyPatchOutput> {
  const { hunks } = parsePatch(input.patchText);

  if (hunks.length === 0) {
    throw new Error("Patch rejected: empty patch.");
  }

  const files: ApplyPatchFile[] = [];

  for (const hunk of hunks) {
    if (hunk.type === "add") {
      const next = resolveToolPath({
        defaultDirectory,
        permissionMode,
        requestedPath: hunk.path,
        toolName: "apply_patch",
      });
      const existing = await stat(next.resolvedPath).catch(() => null);
      if (existing) {
        throw new Error(`Path already exists: ${next.label}`);
      }
      await mkdir(path.dirname(next.resolvedPath), { recursive: true });
      await writeFile(next.resolvedPath, hunk.contents, "utf8");
      const diff = createUnifiedDiff({
        after: hunk.contents,
        before: "",
        leftPath: next.label,
        rightPath: next.label,
      });
      files.push(
        toFileResult({
          ...diff,
          operation: "add",
          path: next.label,
        }),
      );
      continue;
    }

    if (hunk.type === "delete") {
      const current = resolveToolPath({
        defaultDirectory,
        permissionMode,
        requestedPath: hunk.path,
        toolName: "apply_patch",
      });
      const previous = await readFile(current.resolvedPath, "utf8").catch(() => null);
      if (previous == null) {
        throw new Error(`Path not found: ${current.label}`);
      }
      await unlink(current.resolvedPath);
      const diff = createUnifiedDiff({
        after: "",
        before: previous,
        leftPath: current.label,
        rightPath: current.label,
      });
      files.push(
        toFileResult({
          ...diff,
          operation: "delete",
          path: current.label,
        }),
      );
      continue;
    }

    const current = resolveToolPath({
      defaultDirectory,
      permissionMode,
      requestedPath: hunk.path,
      toolName: "apply_patch",
    });
    const previous = await readFile(current.resolvedPath, "utf8").catch(() => null);
    if (previous == null) {
      throw new Error(`Path not found: ${current.label}`);
    }

    const nextContent = deriveNewContentsFromChunks(previous, hunk.chunks);
    const moveTarget = hunk.movePath
      ? resolveToolPath({
          defaultDirectory,
          permissionMode,
          requestedPath: hunk.movePath,
          toolName: "apply_patch",
        })
      : null;
    const nextPath = moveTarget?.label ?? current.label;
    const diff = createUnifiedDiff({
      after: nextContent,
      before: previous,
      leftPath: current.label,
      rightPath: nextPath,
    });

    if (moveTarget) {
      const existing = await stat(moveTarget.resolvedPath).catch(() => null);
      if (existing) {
        throw new Error(`Path already exists: ${moveTarget.label}`);
      }
      await mkdir(path.dirname(moveTarget.resolvedPath), { recursive: true });
      await writeFile(moveTarget.resolvedPath, nextContent, "utf8");
      await unlink(current.resolvedPath);
    } else {
      await writeFile(current.resolvedPath, nextContent, "utf8");
    }

    files.push(
      toFileResult({
        ...diff,
        operation: moveTarget ? "move" : "update",
        path: nextPath,
      }),
    );
  }

  return { files };
}
