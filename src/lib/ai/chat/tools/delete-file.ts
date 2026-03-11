import { rm, stat } from "node:fs/promises";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

export const deleteFileInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "File path to delete. In default permissions mode this must be relative to the selected workspace root.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe("Why this file should be deleted."),
});

export const deleteFileOutputSchema = z.object({
  bytesDeleted: z.number().int().min(0),
  path: z.string(),
});

export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;
export type DeleteFileOutput = z.infer<typeof deleteFileOutputSchema>;

export async function executeDeleteFile({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: DeleteFileInput;
  permissionMode: PermissionMode;
}): Promise<DeleteFileOutput> {
  const { label, resolvedPath } = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "delete_file",
  });
  const targetStats = await stat(resolvedPath).catch(() => null);

  if (!targetStats) {
    throw new Error(`File not found: ${label}`);
  }

  if (!targetStats.isFile() && !targetStats.isSymbolicLink()) {
    throw new Error(`Path is not a file: ${label}`);
  }

  await rm(resolvedPath);

  return {
    bytesDeleted: Number(targetStats.size ?? 0),
    path: label,
  };
}
