"use client";

import { useSyncExternalStore } from "react";

export type RepoDiffSidebarMode = "branch" | "staged" | "unstaged";
export type RepoDiffSidebarLayout = "split" | "unified";

type RepoDiffSidebarPrefs = {
  collapsedFiles: Set<string>;
  expandAll: boolean;
  fileListOpen: boolean;
  layout: RepoDiffSidebarLayout;
  mode: RepoDiffSidebarMode;
  searchFilter: string;
  wordDiffs: boolean;
  wordWrap: boolean;
};

type RepoDiffSidebarState =
  | {
      kind: "thread";
      prefs: RepoDiffSidebarPrefs;
      sourceKey: string;
      threadId: string;
      workspaceId: string;
    }
  | {
      kind: null;
      prefs?: never;
      sourceKey: null;
      threadId: null;
      workspaceId: null;
    };

type RepoDiffSidebarRecord =
  | {
      kind: "thread";
      sourceKey: string;
      threadId: string;
      workspaceId: string;
    }
  | {
      kind: null;
      sourceKey: null;
      threadId: null;
      workspaceId: null;
    };

const DEFAULT_PREFS: RepoDiffSidebarPrefs = {
  collapsedFiles: new Set<string>(),
  expandAll: false,
  fileListOpen: false,
  layout: "unified",
  mode: "unstaged",
  searchFilter: "",
  wordDiffs: false,
  wordWrap: false,
};

const DEFAULT_STATE: RepoDiffSidebarState = {
  kind: null,
  sourceKey: null,
  threadId: null,
  workspaceId: null,
};

let state: RepoDiffSidebarRecord = DEFAULT_STATE;
let snapshot: RepoDiffSidebarState = DEFAULT_STATE;
const prefsBySourceKey = new Map<string, RepoDiffSidebarPrefs>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function getPrefs(sourceKey: string) {
  return prefsBySourceKey.get(sourceKey) ?? DEFAULT_PREFS;
}

function syncSnapshot() {
  if (state.kind !== "thread") {
    snapshot = DEFAULT_STATE;
    return;
  }

  snapshot = {
    ...state,
    prefs: getPrefs(state.sourceKey),
  };
}

export function getRepoDiffSidebarState() {
  return snapshot;
}

export function setRepoDiffSidebarState(input: {
  threadId: string;
  workspaceId: string;
}) {
  const sourceKey = `${input.threadId}:${input.workspaceId}`;
  const nextState: RepoDiffSidebarRecord = {
    kind: "thread",
    sourceKey,
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  };

  if (
    state.kind === "thread" &&
    state.sourceKey === nextState.sourceKey &&
    state.threadId === nextState.threadId &&
    state.workspaceId === nextState.workspaceId
  ) {
    return;
  }

  state = nextState;
  syncSnapshot();
  emit();
}

export function closeRepoDiffSidebarState() {
  if (state.kind === null) {
    return;
  }

  state = DEFAULT_STATE;
  syncSnapshot();
  emit();
}

export function closeRepoDiffSidebarForThreadChange(threadId: string) {
  if (state.kind !== "thread" || state.threadId !== threadId) {
    return;
  }

  state = DEFAULT_STATE;
  syncSnapshot();
  emit();
}

export function updateRepoDiffSidebarPrefs(
  patch: Partial<RepoDiffSidebarPrefs>,
) {
  if (state.kind !== "thread") {
    return;
  }

  const nextPrefs = {
    ...getPrefs(state.sourceKey),
    ...patch,
  };

  const currentPrefs = getPrefs(state.sourceKey);
  if (
    currentPrefs.collapsedFiles === nextPrefs.collapsedFiles &&
    currentPrefs.expandAll === nextPrefs.expandAll &&
    currentPrefs.fileListOpen === nextPrefs.fileListOpen &&
    currentPrefs.layout === nextPrefs.layout &&
    currentPrefs.mode === nextPrefs.mode &&
    currentPrefs.searchFilter === nextPrefs.searchFilter &&
    currentPrefs.wordDiffs === nextPrefs.wordDiffs &&
    currentPrefs.wordWrap === nextPrefs.wordWrap
  ) {
    return;
  }

  prefsBySourceKey.set(state.sourceKey, nextPrefs);
  syncSnapshot();
  emit();
}

export function toggleRepoDiffFileCollapsed(filePath: string) {
  if (state.kind !== "thread") {
    return;
  }

  const currentPrefs = getPrefs(state.sourceKey);
  const nextCollapsed = new Set(currentPrefs.collapsedFiles);
  if (nextCollapsed.has(filePath)) {
    nextCollapsed.delete(filePath);
  } else {
    nextCollapsed.add(filePath);
  }

  prefsBySourceKey.set(state.sourceKey, {
    ...currentPrefs,
    collapsedFiles: nextCollapsed,
  });
  syncSnapshot();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRepoDiffSidebarState() {
  return useSyncExternalStore(
    subscribe,
    getRepoDiffSidebarState,
    getRepoDiffSidebarState,
  );
}

// ── Git action dispatch ──
// Allows the diff sidebar to trigger git actions (commit, push, etc.)
// that are handled by ThreadRepoActions which owns the modals/mutations.

export type DiffSidebarGitAction =
  | "commit"
  | "push"
  | "pull-request"
  | "branch";

type GitActionCallback = (action: DiffSidebarGitAction) => void;

let gitActionCallback: GitActionCallback | null = null;

export function setDiffSidebarGitActionHandler(cb: GitActionCallback | null) {
  gitActionCallback = cb;
}

export function dispatchDiffSidebarGitAction(action: DiffSidebarGitAction) {
  gitActionCallback?.(action);
}
