"use client";

import { useSyncExternalStore } from "react";

export type RepoDiffSidebarMode = "branch" | "staged" | "unstaged";
export type RepoDiffSidebarLayout = "split" | "unified";

type RepoDiffSidebarPrefs = {
  expandAll: boolean;
  layout: RepoDiffSidebarLayout;
  mode: RepoDiffSidebarMode;
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
  expandAll: false,
  layout: "unified",
  mode: "unstaged",
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
  const nextState: RepoDiffSidebarState = {
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
    currentPrefs.expandAll === nextPrefs.expandAll &&
    currentPrefs.layout === nextPrefs.layout &&
    currentPrefs.mode === nextPrefs.mode &&
    currentPrefs.wordDiffs === nextPrefs.wordDiffs &&
    currentPrefs.wordWrap === nextPrefs.wordWrap
  ) {
    return;
  }

  prefsBySourceKey.set(state.sourceKey, nextPrefs);
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
