import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

export const editInputSchema = z.object({
  newString: z.string().describe("Replacement text."),
  oldString: z.string().min(1).describe("Exact text to replace."),
  path: z
    .string()
    .min(1)
    .describe(
      "File path to modify. In default permissions mode this must be relative to the selected workspace root.",
    ),
  rationale: z.string().min(1).describe("Why this edit is needed."),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace every occurrence instead of exactly one."),
});

export const editOutputSchema = z.object({
  bytesWritten: z.number().int().min(0),
  path: z.string(),
  replacements: z.number().int().min(1),
});

export type EditInput = z.infer<typeof editInputSchema>;
export type EditOutput = z.infer<typeof editOutputSchema>;

export function detectLineEnding(text: string) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function normalizeLineEndings(text: string) {
  return text.replaceAll("\r\n", "\n");
}

export function convertToLineEnding(text: string, lineEnding: "\n" | "\r\n") {
  return lineEnding === "\n" ? text : text.replaceAll("\n", "\r\n");
}

export function countOccurrences(content: string, search: string) {
  if (!search) {
    return 0;
  }

  let count = 0;
  let offset = 0;

  while (true) {
    const index = content.indexOf(search, offset);

    if (index === -1) {
      return count;
    }

    count += 1;
    offset = index + search.length;
  }
}

export async function executeEdit({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: EditInput;
  permissionMode: PermissionMode;
}): Promise<EditOutput> {
  if (input.oldString === input.newString) {
    throw new Error(
      "No changes to apply because oldString and newString are identical.",
    );
  }

  const { label, resolvedPath } = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "edit",
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
  const search = convertToLineEnding(
    normalizeLineEndings(input.oldString),
    lineEnding,
  );
  const replacement = convertToLineEnding(
    normalizeLineEndings(input.newString),
    lineEnding,
  );
  const occurrenceCount = countOccurrences(originalContent, search);

  if (occurrenceCount === 0) {
    throw new Error(`Could not find the requested text in ${label}.`);
  }

  if (!input.replaceAll && occurrenceCount > 1) {
    throw new Error(
      `Found ${occurrenceCount} matching regions in ${label}. Use replaceAll=true or provide more specific text.`,
    );
  }

  const nextContent = input.replaceAll
    ? originalContent.split(search).join(replacement)
    : originalContent.replace(search, replacement);

  await writeFile(resolvedPath, nextContent, "utf8");

  return {
    bytesWritten: Buffer.byteLength(nextContent, "utf8"),
    path: label,
    replacements: input.replaceAll ? occurrenceCount : 1,
  };
}

export const __internal = {
  countOccurrences,
  detectLineEnding,
  normalizeLineEndings,
};
