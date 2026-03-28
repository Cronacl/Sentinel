import { beforeEach, describe, expect, it } from "bun:test";

import {
  closeRepoDiffSidebarState,
  getRepoDiffSidebarState,
  setRepoDiffSidebarState,
  updateRepoDiffSidebarPrefs,
} from "./repo-diff-sidebar-store";

describe("repo diff sidebar store", () => {
  beforeEach(() => {
    closeRepoDiffSidebarState();
  });

  it("opens for a thread workspace pair with default prefs", () => {
    setRepoDiffSidebarState({
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });

    expect(getRepoDiffSidebarState()).toEqual({
      kind: "thread",
      prefs: {
        expandAll: false,
        layout: "unified",
        mode: "unstaged",
        wordDiffs: false,
        wordWrap: false,
      },
      sourceKey: "thread-1:workspace-1",
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
  });

  it("preserves prefs when the same thread workspace pair is reopened", () => {
    setRepoDiffSidebarState({
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
    updateRepoDiffSidebarPrefs({
      layout: "split",
      mode: "staged",
      wordWrap: true,
    });
    closeRepoDiffSidebarState();

    setRepoDiffSidebarState({
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });

    expect(getRepoDiffSidebarState()).toMatchObject({
      kind: "thread",
      prefs: {
        layout: "split",
        mode: "staged",
        wordWrap: true,
      },
    });
  });

  it("returns a stable snapshot reference when the store has not changed", () => {
    setRepoDiffSidebarState({
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });

    const firstSnapshot = getRepoDiffSidebarState();
    const secondSnapshot = getRepoDiffSidebarState();

    expect(secondSnapshot).toBe(firstSnapshot);
  });
});
