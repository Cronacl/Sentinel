import { describe, expect, it } from "bun:test";

import { shouldUseRepoThreadSwitch } from "./workspace-sidebar.helpers";

describe("shouldUseRepoThreadSwitch", () => {
  it("returns false when the source thread is a quick chat", () => {
    expect(
      shouldUseRepoThreadSwitch({
        sourceThread: {
          workspaceId: "quick-chat-workspace",
          workspaceKind: "quick_chat",
        },
        targetThread: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
      }),
    ).toBe(false);
  });

  it("returns true for project threads in the same workspace", () => {
    expect(
      shouldUseRepoThreadSwitch({
        sourceThread: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
        targetThread: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
      }),
    ).toBe(true);
  });

  it("returns false for project threads in different workspaces", () => {
    expect(
      shouldUseRepoThreadSwitch({
        sourceThread: {
          workspaceId: "workspace-1",
          workspaceKind: "project",
        },
        targetThread: {
          workspaceId: "workspace-2",
          workspaceKind: "project",
        },
      }),
    ).toBe(false);
  });
});
