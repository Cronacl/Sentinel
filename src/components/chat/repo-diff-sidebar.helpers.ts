import { parsePatchFiles, processFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

import type { RepoDiffSidebarMode } from "./repo-diff-sidebar-store";

export const INITIAL_RENDERABLE_DIFF_BATCH = 6;
export const RENDERABLE_DIFF_BATCH_INCREMENT = 4;

export type FileChangeType = "added" | "deleted" | "modified" | "renamed";

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

export type FileTreeNode = {
  additions: number;
  children: FileTreeNode[];
  deletions: number;
  isDirectory: boolean;
  name: string;
  path: string;
};

export function detectFileChangeType(file: RepoDiffSourceFile): FileChangeType {
  if (file.isUntracked) return "added";
  if (file.deletions > 0 && file.additions === 0) return "deleted";
  if (file.additions > 0 && file.deletions === 0 && file.oldContents === "")
    return "added";
  if (file.newContents === "" && file.deletions > 0) return "deleted";
  return "modified";
}

export function buildFileTree(files: RepoDiffSourceFile[]): FileTreeNode[] {
  const root: Map<string, FileTreeNode> = new Map();

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      if (!currentLevel.has(part)) {
        currentLevel.set(part, {
          additions: isFile ? file.additions : 0,
          children: [],
          deletions: isFile ? file.deletions : 0,
          isDirectory: !isFile,
          name: part,
          path: fullPath,
        });
      }

      const node = currentLevel.get(part)!;
      if (!isFile) {
        node.additions += file.additions;
        node.deletions += file.deletions;
        const childMap = new Map<string, FileTreeNode>();
        for (const child of node.children) {
          childMap.set(child.name, child);
        }
        currentLevel = childMap;
        node.children = Array.from(childMap.values());
      }
    }
  }

  return Array.from(root.values());
}

export function flattenFileTree(
  nodes: FileTreeNode[],
  depth = 0,
): Array<FileTreeNode & { depth: number }> {
  const result: Array<FileTreeNode & { depth: number }> = [];
  for (const node of nodes) {
    if (
      node.isDirectory &&
      node.children.length === 1 &&
      node.children[0]!.isDirectory
    ) {
      const merged: FileTreeNode = {
        ...node.children[0]!,
        name: `${node.name}/${node.children[0]!.name}`,
      };
      result.push(...flattenFileTree([merged], depth));
    } else {
      result.push({ ...node, depth });
      if (node.isDirectory) {
        result.push(...flattenFileTree(node.children, depth + 1));
      }
    }
  }
  return result;
}

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
