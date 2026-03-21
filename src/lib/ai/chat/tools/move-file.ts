import { lstat, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

export const moveFileInputSchema = z.object({
  fromPath: z.string().min(1),
  rationale: z.string().min(1).max(500),
  toPath: z.string().min(1),
});

export const moveFileOutputSchema = z.object({
  bytesMoved: z.number().int().min(0),
  fromPath: z.string(),
  toPath: z.string(),
});

export type MoveFileInput = z.infer<typeof moveFileInputSchema>;
export type MoveFileOutput = z.infer<typeof moveFileOutputSchema>;

export async function executeMoveFile({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: MoveFileInput;
  permissionMode: PermissionMode;
}): Promise<MoveFileOutput> {
  const source = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.fromPath,
    toolName: "move_file",
  });
  const destination = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.toPath,
    toolName: "move_file",
  });

  if (source.resolvedPath === destination.resolvedPath) {
    throw new Error("Source and destination must be different paths.");
  }

  const sourceStats = await lstat(source.resolvedPath).catch(() => null);
  if (!sourceStats) {
    throw new Error(`Path not found: ${source.label}`);
  }

  if (!sourceStats.isFile() && !sourceStats.isSymbolicLink()) {
    throw new Error(`Path is not a movable file: ${source.label}`);
  }

  const destinationStats = await stat(destination.resolvedPath).catch(
    () => null,
  );
  if (destinationStats) {
    throw new Error(`Destination already exists: ${destination.label}`);
  }

  await mkdir(path.dirname(destination.resolvedPath), { recursive: true });
  await rename(source.resolvedPath, destination.resolvedPath);

  return {
    bytesMoved: sourceStats.size,
    fromPath: source.label,
    toPath: destination.label,
  };
}
