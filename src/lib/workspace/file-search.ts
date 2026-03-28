import { readdir } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".vercel",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  ".venv",
  "venv",
]);

const MAX_SCAN_ENTRIES = 10_000;

export type WorkspaceFileResult = {
  absolutePath: string;
  kind: "file" | "directory";
  label: string;
  relativePath: string;
};

function scoreSubsequenceMatch(
  candidate: string,
  query: string,
): number | null {
  if (!query) return 0;

  let score = 0;
  let lastMatch = -1;
  let searchIndex = 0;

  for (const char of query) {
    const foundIndex = candidate.indexOf(char, searchIndex);
    if (foundIndex === -1) {
      return null;
    }

    score += 8;

    if (foundIndex === searchIndex) {
      score += 6;
    }

    if (lastMatch >= 0) {
      const gap = foundIndex - lastMatch - 1;
      score -= Math.min(gap, 12);
    } else {
      score -= Math.min(foundIndex, 12);
    }

    lastMatch = foundIndex;
    searchIndex = foundIndex + 1;
  }

  return score;
}

function scoreWorkspacePath(
  relativePath: string,
  label: string,
  query: string,
) {
  if (!query) {
    return 0;
  }

  const normalizedPath = relativePath.toLowerCase();
  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const queryTokens = normalizedQuery.split(/[/\s_-]+/).filter(Boolean);

  let score = 0;

  if (normalizedLabel === normalizedQuery) score += 320;
  if (normalizedPath === normalizedQuery) score += 280;
  if (normalizedLabel.startsWith(normalizedQuery)) score += 220;
  if (normalizedPath.startsWith(normalizedQuery)) score += 180;
  if (normalizedLabel.includes(normalizedQuery)) score += 140;
  if (normalizedPath.includes(normalizedQuery)) score += 100;

  const labelSubsequence = scoreSubsequenceMatch(
    normalizedLabel,
    normalizedQuery,
  );
  if (labelSubsequence != null) {
    score += 120 + labelSubsequence;
  }

  const pathSubsequence = scoreSubsequenceMatch(
    normalizedPath,
    normalizedQuery,
  );
  if (pathSubsequence != null) {
    score += 60 + pathSubsequence;
  }

  if (
    queryTokens.length > 1 &&
    queryTokens.every(
      (token) =>
        normalizedLabel.includes(token) || normalizedPath.includes(token),
    )
  ) {
    score += 80;
  }

  const depthPenalty = Math.max(relativePath.split("/").length - 1, 0) * 4;
  return score - depthPenalty - Math.max(normalizedPath.length - 48, 0) * 0.2;
}

export async function searchWorkspaceFiles({
  rootPath,
  query,
  limit,
}: {
  rootPath: string;
  query: string;
  limit: number;
}): Promise<WorkspaceFileResult[]> {
  const resolvedRoot = path.resolve(rootPath);
  const normalizedQuery = query.toLowerCase().trim();
  const results: WorkspaceFileResult[] = [];
  let scannedCount = 0;

  const walk = async (currentDir: string, relativePrefix: string) => {
    if (scannedCount >= MAX_SCAN_ENTRIES || results.length >= limit * 3) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true }).catch(
      () => [],
    );

    entries.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    for (const entry of entries) {
      if (scannedCount >= MAX_SCAN_ENTRIES || results.length >= limit * 3) {
        return;
      }

      scannedCount += 1;

      if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const relativePath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(currentDir, entry.name);

      if (!absolutePath.startsWith(resolvedRoot)) {
        continue;
      }

      const isDir = entry.isDirectory();

      if (isDir && SKIP_DIRS.has(entry.name)) {
        continue;
      }

      if (
        !normalizedQuery ||
        scoreWorkspacePath(relativePath, entry.name, normalizedQuery) > 0
      ) {
        results.push({
          absolutePath,
          kind: isDir ? "directory" : "file",
          label: entry.name,
          relativePath,
        });
      }

      if (isDir) {
        await walk(absolutePath, relativePath);
      }
    }
  };

  await walk(resolvedRoot, "");

  results.sort((a, b) => {
    const scoreDiff =
      scoreWorkspacePath(b.relativePath, b.label, normalizedQuery) -
      scoreWorkspacePath(a.relativePath, a.label, normalizedQuery);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.relativePath.localeCompare(b.relativePath, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return results.slice(0, limit);
}
