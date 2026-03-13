import { beforeEach, describe, expect, it } from "bun:test";

import {
  closePlanSidebarState,
  getPlanSidebarState,
  setPlanSidebarState,
  subscribePlanSidebarState,
  syncPlanSidebarDraft,
} from "./plan-sidebar-store";

const baseSnapshot = {
  audience: "technical" as const,
  document: "# Plan",
  goal: "Ship the fix",
  isStreaming: true,
  statusLabel: "Drafting",
  summary: "Summary",
  taskCount: 1,
  tasks: [{ title: "Inspect loop" }],
  title: "Plan draft",
};

describe("plan sidebar store", () => {
  beforeEach(() => {
    closePlanSidebarState();
  });

  it("does not emit when setPlanSidebarState receives an equivalent value", () => {
    let emissions = 0;
    const unsubscribe = subscribePlanSidebarState(() => {
      emissions += 1;
    });

    const nextState = {
      kind: "draft" as const,
      snapshot: baseSnapshot,
      sourceKey: "tool-1",
    };

    setPlanSidebarState(nextState);
    setPlanSidebarState({
      kind: "draft",
      snapshot: { ...baseSnapshot, tasks: [...(baseSnapshot.tasks ?? [])] },
      sourceKey: "tool-1",
    });

    unsubscribe();

    expect(emissions).toBe(1);
    expect(getPlanSidebarState()).toEqual(nextState);
  });

  it("propagates updated snapshots when the sourceKey matches the open draft", () => {
    setPlanSidebarState({
      kind: "draft",
      snapshot: baseSnapshot,
      sourceKey: "tool-2",
    });

    const changed = syncPlanSidebarDraft({
      snapshot: {
        ...baseSnapshot,
        document: "# Updated plan",
        isStreaming: false,
        statusLabel: "Updated",
      },
      sourceKey: "tool-2",
    });

    expect(changed).toBe(true);
    expect(getPlanSidebarState()).toEqual({
      kind: "draft",
      snapshot: {
        ...baseSnapshot,
        document: "# Updated plan",
        isStreaming: false,
        statusLabel: "Updated",
      },
      sourceKey: "tool-2",
    });
  });

  it("ignores draft sync attempts for a different sourceKey", () => {
    setPlanSidebarState({
      kind: "draft",
      snapshot: baseSnapshot,
      sourceKey: "tool-3",
    });

    const changed = syncPlanSidebarDraft({
      snapshot: {
        ...baseSnapshot,
        document: "# Hijacked plan",
      },
      sourceKey: "tool-4",
    });

    expect(changed).toBe(false);
    expect(getPlanSidebarState()).toEqual({
      kind: "draft",
      snapshot: baseSnapshot,
      sourceKey: "tool-3",
    });
  });
});
