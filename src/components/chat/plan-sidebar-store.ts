"use client";

import { useSyncExternalStore } from "react";

import type {
  ThreadPlanAudience,
  ThreadPlanTaskStatus,
} from "@/lib/plan";

type PlanSidebarTask = {
  description?: string | null;
  id?: string;
  status?: ThreadPlanTaskStatus;
  title: string;
};

type PlanSidebarSnapshot = {
  audience: ThreadPlanAudience;
  document: string;
  goal?: string | null;
  isStreaming?: boolean;
  statusLabel?: string | null;
  summary?: string | null;
  taskCount?: number;
  tasks?: PlanSidebarTask[];
  title?: string | null;
};

type PlanSidebarState =
  | {
      kind: "draft";
      snapshot: PlanSidebarSnapshot;
      sourceKey: string;
    }
  | {
      kind: "thread";
      sourceKey: string;
      threadId: string;
    }
  | {
      kind: null;
      sourceKey: null;
    };

const DEFAULT_STATE: PlanSidebarState = {
  kind: null,
  sourceKey: null,
};

let state: PlanSidebarState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function areTasksEqual(
  left: PlanSidebarSnapshot["tasks"],
  right: PlanSidebarSnapshot["tasks"],
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((task, index) => {
    const other = right[index];
    return (
      task?.id === other?.id &&
      task?.title === other?.title &&
      task?.description === other?.description &&
      task?.status === other?.status
    );
  });
}

function areSnapshotsEqual(
  left: PlanSidebarSnapshot,
  right: PlanSidebarSnapshot,
) {
  return (
    left.audience === right.audience &&
    left.document === right.document &&
    left.goal === right.goal &&
    left.isStreaming === right.isStreaming &&
    left.statusLabel === right.statusLabel &&
    left.summary === right.summary &&
    left.taskCount === right.taskCount &&
    left.title === right.title &&
    areTasksEqual(left.tasks, right.tasks)
  );
}

function isPlanSidebarStateEqual(
  left: PlanSidebarState,
  right: PlanSidebarState,
) {
  if (left.kind !== right.kind || left.sourceKey !== right.sourceKey) {
    return false;
  }

  if (left.kind === null || right.kind === null) {
    return true;
  }

  if (left.kind === "thread" && right.kind === "thread") {
    return left.threadId === right.threadId;
  }

  if (left.kind === "draft" && right.kind === "draft") {
    return areSnapshotsEqual(left.snapshot, right.snapshot);
  }

  return false;
}

export function getPlanSidebarState() {
  return state;
}

export function setPlanSidebarState(nextState: PlanSidebarState) {
  if (isPlanSidebarStateEqual(state, nextState)) {
    return;
  }

  state = nextState;
  emit();
}

export function syncPlanSidebarDraft(input: {
  snapshot: PlanSidebarSnapshot;
  sourceKey: string;
}) {
  if (state.kind !== "draft" || state.sourceKey !== input.sourceKey) {
    return false;
  }

  const nextState: PlanSidebarState = {
    kind: "draft",
    snapshot: input.snapshot,
    sourceKey: input.sourceKey,
  };

  if (isPlanSidebarStateEqual(state, nextState)) {
    return false;
  }

  state = nextState;
  emit();
  return true;
}

export function closePlanSidebarState() {
  if (isPlanSidebarStateEqual(state, DEFAULT_STATE)) {
    return;
  }

  state = DEFAULT_STATE;
  emit();
}

export function subscribePlanSidebarState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlanSidebarState<T>(
  selector: (state: PlanSidebarState) => T,
) {
  return useSyncExternalStore(
    subscribePlanSidebarState,
    () => selector(state),
    () => selector(state),
  );
}
