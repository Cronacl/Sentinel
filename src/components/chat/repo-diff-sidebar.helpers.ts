import { parsePatchFiles, processFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

import type { RepoDiffSidebarMode } from "./repo-diff-sidebar-store";

export const INITIAL_RENDERABLE_DIFF_BATCH = 6;
export const RENDERABLE_DIFF_BATCH_INCREMENT = 4;

export type RepoDiffSourceFile = {
  additions: number;
  deletions: number;
  firstChangedLine: number | null;
  isUntracked: boolean;
  newContents?: string;
  oldContents?: string;
  patch: string;
  path: string;
};

export type RenderableDiffFile = RepoDiffSourceFile & {
  fileDiff: FileDiffMetadata | null;
  parseError: string | null;
};

export function buildRenderableDiffCacheKey(
  mode: RepoDiffSidebarMode,
  file: RepoDiffSourceFile,
) {
  return `${mode}:${file.path}:${file.patch}`;
}

export function parseRenderableDiffFile(
  mode: RepoDiffSidebarMode,
  file: RepoDiffSourceFile,
): RenderableDiffFile {
  try {
    const fileDiff =
      file.oldContents !== undefined && file.newContents !== undefined
        ? (processFile(file.patch, {
            newFile: {
              contents: file.newContents,
              name: file.path,
            },
            oldFile: {
              contents: file.oldContents,
              name: file.path,
            },
            throwOnError: true,
          }) ?? null)
        : (parsePatchFiles(
            file.patch,
            `repo-diff:${mode}:${file.path}`,
          ).flatMap((entry) => entry.files)[0] ?? null);

    return {
      ...file,
      fileDiff,
      parseError: fileDiff
        ? null
        : "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      ...file,
      fileDiff: null,
      parseError: "Failed to parse patch. Showing raw patch.",
    };
  }
}

export function getInitialRenderableFileCount(totalFiles: number) {
  return Math.min(totalFiles, INITIAL_RENDERABLE_DIFF_BATCH);
}

export function getNextRenderableFileCount(
  currentVisibleCount: number,
  totalFiles: number,
) {
  if (totalFiles <= currentVisibleCount) {
    return totalFiles;
  }

  return Math.min(
    totalFiles,
    currentVisibleCount + RENDERABLE_DIFF_BATCH_INCREMENT,
  );
}
