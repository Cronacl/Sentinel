import { readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import {
  convertToLineEnding,
  countOccurrences,
  detectLineEnding,
  normalizeLineEndings,
} from "./edit";
import { resolveToolPath } from "./paths";

const multieditOperationSchema = z.object({
  newString: z.string().describe("Replacement text."),
  oldString: z.string().min(1).describe("Exact text to replace."),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace every occurrence for this edit instead of exactly one."),
});

export const multieditInputSchema = z.object({
  edits: z
    .array(multieditOperationSchema)
    .min(1)
    .max(20)
    .describe("Ordered exact-text edits to apply to the same file."),
  path: z
    .string()
    .min(1)
    .describe(
      "File path to modify. In default permissions mode this must be relative to the selected workspace root.",
    ),
  rationale: z
    .string()
    .min(1)
    .describe("Why these coordinated edits are needed."),
});

export const multieditOutputSchema = z.object({
  bytesWritten: z.number().int().min(0),
  edits: z.array(
    z.object({
      index: z.number().int().min(1),
      replacements: z.number().int().min(1),
      replaceAll: z.boolean(),
    }),
  ),
  editsApplied: z.number().int().min(1),
  path: z.string(),
  replacements: z.number().int().min(1),
});

export type MultiEditInput = z.infer<typeof multieditInputSchema>;
export type MultiEditOutput = z.infer<typeof multieditOutputSchema>;

export async function executeMultiEdit({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: MultiEditInput;
  permissionMode: PermissionMode;
}): Promise<MultiEditOutput> {
  const { label, resolvedPath } = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "multiedit",
  });
  const targetStats = await stat(resolvedPath).catch(() => null);

  if (!targetStats) {
    throw new Error(`File not found: ${label}`);
  }

  if (!targetStats.isFile()) {
    throw new Error(`Path is not a file: ${label}`);
  }

  const originalContent = await readFile(resolvedPath, "utf8");
  const lineEnding = detectLineEnding(originalContent);
  let nextContent = originalContent;
  let totalReplacements = 0;
  const appliedEdits: MultiEditOutput["edits"] = [];

  for (const [index, edit] of input.edits.entries()) {
    if (edit.oldString === edit.newString) {
      throw new Error(
        `Edit ${index + 1} has no effect because oldString and newString are identical.`,
      );
    }

    const search = convertToLineEnding(
      normalizeLineEndings(edit.oldString),
      lineEnding,
    );
    const replacement = convertToLineEnding(
      normalizeLineEndings(edit.newString),
      lineEnding,
    );
    const occurrenceCount = countOccurrences(nextContent, search);

    if (occurrenceCount === 0) {
      throw new Error(
        `Could not find the requested text for edit ${index + 1} in ${label}.`,
      );
    }

    if (!edit.replaceAll && occurrenceCount > 1) {
      throw new Error(
        `Found ${occurrenceCount} matching regions for edit ${index + 1} in ${label}. Use replaceAll=true or provide more specific text.`,
      );
    }

    nextContent = edit.replaceAll
      ? nextContent.split(search).join(replacement)
      : nextContent.replace(search, replacement);
    const replacements = edit.replaceAll ? occurrenceCount : 1;
    totalReplacements += replacements;
    appliedEdits.push({
      index: index + 1,
      replacements,
      replaceAll: Boolean(edit.replaceAll),
    });
  }

  await writeFile(resolvedPath, nextContent, "utf8");

  return {
    bytesWritten: Buffer.byteLength(nextContent, "utf8"),
    edits: appliedEdits,
    editsApplied: input.edits.length,
    path: label,
    replacements: totalReplacements,
  };
}
