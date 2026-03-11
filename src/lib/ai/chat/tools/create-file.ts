import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./tool-path";

export const createFileInputSchema = z.object({
  content: z.string().describe("Full file contents to create."),
  path: z
    .string()
    .min(1)
    .describe(
      "File path to create. In default permissions mode this must be relative to the selected workspace root.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe("Why this file should be created."),
});

export const createFileOutputSchema = z.object({
  bytesWritten: z.number().int().min(0),
  lineCount: z.number().int().min(0),
  path: z.string(),
});

export type CreateFileInput = z.infer<typeof createFileInputSchema>;
export type CreateFileOutput = z.infer<typeof createFileOutputSchema>;

export async function executeCreateFile({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: CreateFileInput;
  permissionMode: PermissionMode;
}): Promise<CreateFileOutput> {
  const { label, resolvedPath } = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "create_file",
  });
  const targetStats = await stat(resolvedPath).catch(() => null);

  if (targetStats) {
    throw new Error(`Path already exists: ${label}`);
  }

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, input.content, "utf8");

  return {
    bytesWritten: Buffer.byteLength(input.content, "utf8"),
    lineCount: input.content.length === 0 ? 0 : input.content.split(/\r?\n/).length,
    path: label,
  };
}
