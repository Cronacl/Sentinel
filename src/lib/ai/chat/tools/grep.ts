import { spawn } from "node:child_process";
import readline from "node:readline";
import { z } from "zod";

import type { PermissionMode } from "@/lib/security";

import { resolveRipgrepPath } from "./ripgrep";
import path from "node:path";
import { normalizeRelativePath, resolveToolDirectory } from "./tool-path";

const GREP_MATCH_LIMIT = 100;
const MAX_MATCH_PREVIEW_LENGTH = 280;

const grepMatchSchema = z.object({
  lineNumber: z.number().int().min(1),
  text: z.string(),
});

const grepFileSchema = z.object({
  matches: z.array(grepMatchSchema),
  path: z.string(),
});

export const grepInputSchema = z.object({
  include: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional file glob to include in the search, for example "*.ts" or "*.{ts,tsx}".',
    ),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory path to search. In default permissions mode this must be relative to the selected workspace root.",
    ),
  pattern: z
    .string()
    .min(1)
    .describe("Regular expression pattern to search for in file contents."),
});

export const grepOutputSchema = z.object({
  files: z.array(grepFileSchema),
  hasPartialErrors: z.boolean(),
  include: z.string().nullable(),
  pattern: z.string(),
  root: z.string(),
  shownMatches: z.number().int().min(0),
  totalMatches: z.number().int().min(0),
  truncated: z.boolean(),
});

export type GrepInput = z.infer<typeof grepInputSchema>;
export type GrepOutput = z.infer<typeof grepOutputSchema>;

type RipgrepJsonEvent =
  | {
      type: "match";
      data: {
        line_number: number;
        lines: { text?: string | null };
        path: { text?: string | null };
      };
    }
  | {
      type: "summary";
      data: {
        stats: {
          matched_lines: number;
        };
      };
    };

function trimMatchPreview(value: string) {
  const normalized = value.replace(/\r?\n$/, "");
  if (normalized.length <= MAX_MATCH_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_MATCH_PREVIEW_LENGTH)}...`;
}

function isRipgrepJsonEvent(value: unknown): value is RipgrepJsonEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { data?: unknown; type?: unknown };
  return candidate.type === "match" || candidate.type === "summary";
}

async function waitForExit(child: ReturnType<typeof spawn>) {
  return await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
}

export async function executeGrep({
  defaultDirectory,
  input,
  permissionMode,
}: {
  defaultDirectory: string;
  input: GrepInput;
  permissionMode: PermissionMode;
}): Promise<GrepOutput> {
  const { resolvedDirectory, rootLabel } = resolveToolDirectory({
    defaultDirectory,
    permissionMode,
    requestedPath: input.path,
    toolName: "grep",
  });
  const rgPath = await resolveRipgrepPath();
  const args = [
    "--json",
    "--line-number",
    "--hidden",
    "--no-messages",
    "--glob",
    "!.git",
    "--glob",
    "!**/.git/**",
    "--regexp",
    input.pattern,
  ];

  if (input.include) {
    args.push("--glob", input.include);
  }

  args.push(resolvedDirectory);

  const child = spawn(rgPath, args, {
    cwd: defaultDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderrChunks: string[] = [];
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderrChunks.push(chunk);
  });

  const files = new Map<string, GrepOutput["files"][number]>();
  let shownMatches = 0;
  let totalMatches = 0;

  const stdout = child.stdout;
  if (!stdout) {
    throw new Error("Ripgrep output stream is unavailable.");
  }

  stdout.setEncoding("utf8");
  const rl = readline.createInterface({
    crlfDelay: Infinity,
    input: stdout,
  });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    let parsedLine: unknown;

    try {
      parsedLine = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isRipgrepJsonEvent(parsedLine)) {
      continue;
    }

    if (parsedLine.type === "summary") {
      totalMatches = parsedLine.data.stats.matched_lines;
      continue;
    }

    const rawPath = parsedLine.data.path.text?.trim();
    const lineText = parsedLine.data.lines.text ?? "";
    const lineNumber = parsedLine.data.line_number;

    if (!rawPath || shownMatches >= GREP_MATCH_LIMIT) {
      continue;
    }

    const relativePath = normalizeRelativePath(
      path.relative(resolvedDirectory, rawPath) || path.basename(rawPath),
    );
    const existingFile = files.get(relativePath);
    const fileEntry =
      existingFile ??
      ({
        matches: [],
        path: relativePath,
      } satisfies GrepOutput["files"][number]);

    fileEntry.matches.push({
      lineNumber,
      text: trimMatchPreview(lineText),
    });
    shownMatches += 1;

    if (!existingFile) {
      files.set(relativePath, fileEntry);
    }
  }

  const exitCode = await waitForExit(child);
  const stderrText = stderrChunks.join("").trim();

  if (totalMatches === 0) {
    totalMatches = shownMatches;
  }

  if (
    exitCode !== 0 &&
    exitCode !== 1 &&
    !(exitCode === 2 && stderrText.length === 0)
  ) {
    throw new Error(stderrText || `ripgrep failed with exit code ${exitCode}.`);
  }

  return {
    files: Array.from(files.values()),
    hasPartialErrors: exitCode === 2,
    include: input.include ?? null,
    pattern: input.pattern,
    root: rootLabel,
    shownMatches,
    totalMatches,
    truncated: totalMatches > shownMatches,
  };
}

export const __internal = {
  GREP_MATCH_LIMIT,
  MAX_MATCH_PREVIEW_LENGTH,
  trimMatchPreview,
};
