import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { ThreadPromptProjectCandidate } from "../prompt-context";

const ROOT_MARKER_SCORES = [
  { name: ".git", score: 5 },
  { name: "package.json", score: 6 },
  { name: "bun.lock", score: 3 },
  { name: "bun.lockb", score: 3 },
  { name: "pnpm-lock.yaml", score: 3 },
  { name: "package-lock.json", score: 3 },
  { name: "yarn.lock", score: 3 },
  { name: "tsconfig.json", score: 2 },
  { name: "vite.config.ts", score: 3 },
  { name: "vite.config.js", score: 3 },
  { name: "next.config.js", score: 3 },
  { name: "next.config.mjs", score: 3 },
  { name: "next.config.ts", score: 3 },
  { name: "astro.config.mjs", score: 3 },
  { name: "astro.config.ts", score: 3 },
  { name: "pyproject.toml", score: 4 },
  { name: "Cargo.toml", score: 4 },
  { name: "go.mod", score: 4 },
];

const APP_DIRECTORY_MARKERS = ["src", "app", "pages", "components", "lib"];

type ScoredCandidate = ThreadPromptProjectCandidate & {
  score: number;
};

function normalizeCandidatePath(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath ? relativePath.replaceAll(path.sep, "/") : ".";
}

async function collectCandidateSignals(candidatePath: string) {
  const directoryEntries = await readdir(candidatePath, {
    withFileTypes: true,
  }).catch(() => null);
  if (!directoryEntries) {
    return null;
  }

  const entryNames = new Set(directoryEntries.map((entry) => entry.name));
  const signals: string[] = [];
  let score = 0;

  for (const marker of ROOT_MARKER_SCORES) {
    if (!entryNames.has(marker.name)) {
      continue;
    }

    score += marker.score;
    signals.push(marker.name);
  }

  for (const marker of APP_DIRECTORY_MARKERS) {
    if (!entryNames.has(marker)) {
      continue;
    }

    score += 1;
    signals.push(`${marker}/`);
  }

  if (signals.length === 0) {
    return null;
  }

  const kind: ThreadPromptProjectCandidate["kind"] = entryNames.has("package.json")
    ? "package"
    : entryNames.has(".git")
      ? "repo"
      : "app";

  const maxScore = 20;

  return {
    confidence: Number(Math.min(1, score / maxScore).toFixed(2)),
    kind,
    score,
    signals: signals.sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    ),
  };
}

async function listImmediateDirectories(rootPath: string) {
  const rootEntries = await readdir(rootPath, { withFileTypes: true }).catch(
    () => [],
  );

  return rootEntries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules",
    )
    .map((entry) => path.join(rootPath, entry.name));
}

export async function discoverProjectAwareness(rootPath: string | null) {
  if (!rootPath) {
    return {
      preferredProjectRoot: null,
      projectCandidates: [] as ThreadPromptProjectCandidate[],
      shellStartDirectory: null,
    };
  }

  const rootStats = await stat(rootPath).catch(() => null);
  if (!rootStats?.isDirectory()) {
    return {
      preferredProjectRoot: null,
      projectCandidates: [] as ThreadPromptProjectCandidate[],
      shellStartDirectory: null,
    };
  }

  const candidatePaths = [rootPath, ...(await listImmediateDirectories(rootPath))];
  const candidates: ScoredCandidate[] = [];

  for (const candidatePath of candidatePaths) {
    const signals = await collectCandidateSignals(candidatePath);
    if (!signals) {
      continue;
    }

    candidates.push({
      ...signals,
      path: normalizeCandidatePath(rootPath, candidatePath),
    });
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.path.localeCompare(right.path, undefined, { sensitivity: "base" }),
  );

  const preferredCandidate = candidates[0] ?? null;
  const preferredProjectRoot = preferredCandidate
    ? preferredCandidate.path === "."
      ? rootPath
      : path.join(rootPath, preferredCandidate.path)
    : rootPath;

  return {
    preferredProjectRoot,
    projectCandidates: candidates.map(({ score: _score, ...candidate }) => candidate),
    shellStartDirectory: preferredProjectRoot,
  };
}
