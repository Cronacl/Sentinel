import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveToolPath } from "./paths";

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 400;
const MAX_READ_BYTES = 64 * 1024;
const MAX_LINE_LENGTH = 400;
const DIRECTORY_ENTRY_LIMIT = 200;
const BINARY_SAMPLE_BYTES = 8 * 1024;

const readLineSchema = z.object({
  number: z.number().int().min(1),
  text: z.string(),
});

export const readInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_READ_LIMIT).optional(),
  offset: z.number().int().min(1).optional(),
  path: z
    .string()
    .min(1)
    .describe(
      "File or directory path to read. In default permissions mode this must be relative to the selected workspace root.",
    ),
});

export const readOutputSchema = z.object({
  content: z.string().nullable(),
  entries: z.array(z.string()),
  kind: z.enum(["directory", "file"]),
  lines: z.array(readLineSchema),
  nextOffset: z.number().int().min(1).nullable(),
  path: z.string(),
  totalEntries: z.number().int().min(0).nullable(),
  totalLines: z.number().int().min(0).nullable(),
  truncated: z.boolean(),
});

export type ReadInput = z.infer<typeof readInputSchema>;
export type ReadOutput = z.infer<typeof readOutputSchema>;

function truncateLine(text: string) {
  if (text.length <= MAX_LINE_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_LINE_LENGTH)}...`;
}

async function isBinaryFile(resolvedPath: string) {
  const stream = createReadStream(resolvedPath, {
    end: BINARY_SAMPLE_BYTES - 1,
  });

  const chunks: Buffer[] = [];

  try {
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } finally {
    stream.destroy();
  }

  const sample = Buffer.concat(chunks);

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

export async function executeRead({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: ReadInput;
  permissionMode: PermissionMode;
}): Promise<ReadOutput> {
  const { label, resolvedPath } = resolveToolPath({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "read",
  });
  const targetStats = await stat(resolvedPath).catch(() => null);

  if (!targetStats) {
    throw new Error(`Path not found: ${label}`);
  }

  if (targetStats.isDirectory()) {
    const offset = input.offset ?? 1;
    const limit = Math.min(input.limit ?? DEFAULT_READ_LIMIT, DIRECTORY_ENTRY_LIMIT);
    const directoryEntries = await readdir(resolvedPath, { withFileTypes: true });
    const entries = directoryEntries
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
      );
    const start = offset - 1;

    if (start > entries.length) {
      throw new Error(
        `Offset ${offset} is out of range for this directory (${entries.length} entries).`,
      );
    }

    const slicedEntries = entries.slice(start, start + limit);
    const truncated = start + slicedEntries.length < entries.length;

    return {
      content: slicedEntries.join("\n"),
      entries: slicedEntries,
      kind: "directory",
      lines: [],
      nextOffset: truncated ? offset + slicedEntries.length : null,
      path: label,
      totalEntries: entries.length,
      totalLines: null,
      truncated,
    };
  }

  if (!targetStats.isFile()) {
    throw new Error(`Path is not a regular file: ${label}`);
  }

  if (await isBinaryFile(resolvedPath)) {
    throw new Error(`Cannot read binary file: ${label}`);
  }

  const offset = input.offset ?? 1;
  const limit = input.limit ?? DEFAULT_READ_LIMIT;
  const start = offset - 1;
  const lines: ReadOutput["lines"] = [];
  let totalLines = 0;
  let consumedBytes = 0;
  let truncated = false;

  const stream = createReadStream(resolvedPath, { encoding: "utf8" });
  const rl = readline.createInterface({
    crlfDelay: Infinity,
    input: stream,
  });

  try {
    for await (const rawLine of rl) {
      totalLines += 1;

      if (totalLines <= start) {
        continue;
      }

      if (lines.length >= limit) {
        truncated = true;
        continue;
      }

      const text = truncateLine(rawLine);
      const serialized = `${totalLines}: ${text}`;
      const nextBytes = Buffer.byteLength(serialized, "utf8") + (lines.length > 0 ? 1 : 0);

      if (consumedBytes + nextBytes > MAX_READ_BYTES) {
        truncated = true;
        break;
      }

      lines.push({
        number: totalLines,
        text,
      });
      consumedBytes += nextBytes;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (lines.length === 0 && totalLines > 0 && offset > totalLines) {
    throw new Error(`Offset ${offset} is out of range for this file (${totalLines} lines).`);
  }

  return {
    content: lines.map((line) => `${line.number}: ${line.text}`).join("\n"),
    entries: [],
    kind: "file",
    lines,
    nextOffset: truncated && lines.length > 0 ? lines.at(-1)!.number + 1 : null,
    path: label,
    totalEntries: null,
    totalLines,
    truncated,
  };
}

export const __internal = {
  DEFAULT_READ_LIMIT,
  MAX_LINE_LENGTH,
  truncateLine,
};
