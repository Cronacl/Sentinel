import { describe, expect, it } from "bun:test";

import { shouldInspectWorkspaceThreadSwitch } from "./workspace-sidebar.helpers";

describe("shouldInspectWorkspaceThreadSwitch", () => {
  it("skips handoff for quick chat threads", () => {
    expect(
      shouldInspectWorkspaceThreadSwitch({
        selectedThreadId: "thread-1",
        selectedThreadState: {
          workspaceId: "quick-chat",
          workspaceKind: "quick_chat",
        },
        targetWorkspaceId: "workspace-1",
      }),
    ).toBeFalse();
  });

  it("skips handoff when the current thread is from another workspace", () => {
    expect(
      shouldInspectWorkspaceThreadSwitch({
        selectedThreadId: "thread-1",
        selectedThreadState: {
          workspaceId: "workspace-2",
          workspaceKind: "project",
        },
        targetWorkspaceId: "workspace-1",
      }),
    ).toBeFalse();
  });

  it("allows handoff when both threads belong to the same project workspace", () => {
    expect(
      shouldInspectWorkspaceThreadSwitch({
        selectedThreadId: "thread-1",
        selectedThreadState: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
        targetWorkspaceId: "workspace-1",
      }),
    ).toBeTrue();
  });

  it("runs same-workspace project inspection after navigation", () => {
    expect(
      shouldInspectWorkspaceThreadSwitch({
        selectedThreadId: "thread-1",
        selectedThreadState: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
        targetWorkspaceId: "workspace-1",
      }),
    ).toBeTrue();
  });
});
