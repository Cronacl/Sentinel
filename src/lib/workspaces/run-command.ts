"use client";

const WORKSPACE_RUN_COMMAND_PREFIX = "sentinel.workspace.run-command.";

function getWorkspaceRunCommandStorageKey(workspaceId: string) {
  return `${WORKSPACE_RUN_COMMAND_PREFIX}${workspaceId}`;
}

export function getWorkspaceRunCommand(workspaceId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(
    getWorkspaceRunCommandStorageKey(workspaceId),
  );
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function setWorkspaceRunCommand(workspaceId: string, command: string) {
  if (typeof window === "undefined") {
    return;
  }

  const trimmed = command.trim();
  const storageKey = getWorkspaceRunCommandStorageKey(workspaceId);

  if (!trimmed) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, trimmed);
}

export function clearWorkspaceRunCommand(workspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getWorkspaceRunCommandStorageKey(workspaceId));
}
