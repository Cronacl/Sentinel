"use client";

import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopDirectorySelection } from "@/lib/desktop/contracts";

export function normalizeWorkspaceDirectoryPath(pathValue: string) {
  return pathValue.trim().replace(/[\\/]+$/, "");
}

export function deriveWorkspaceNameFromPath(pathValue: string) {
  const normalized = normalizeWorkspaceDirectoryPath(pathValue);

  if (!normalized) {
    return "Workspace";
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

export async function pickWorkspaceDirectory() {
  const desktop = getDesktopApi();

  if (!desktop) {
    throw new Error("Folder picking is only available in Sentinel desktop.");
  }

  return desktop.pickDirectory();
}

export function deriveWorkspaceName(directory: DesktopDirectorySelection) {
  return (
    deriveWorkspaceNameFromPath(directory.path) ||
    directory.name.trim() ||
    "Workspace"
  );
}
