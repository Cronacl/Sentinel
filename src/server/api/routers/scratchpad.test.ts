// @ts-nocheck

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const listScratchpad = mock(async () => ({
  hubThreadId: "hub-thread-1",
  id: "scratchpad-1",
  tasks: [],
  workspaceId: "workspace-1",
}));
const createScratchpadTask = mock(async () => ({
  id: "task-1",
  progressText: "Thinking",
  status: "running",
  title: "Check release notes",
  virtualThreadId: "virtual-thread-1",
  visibleThreadId: null,
}));
const toggleScratchpadTaskComplete = mock(async () => ({
  id: "task-1",
  progressText: "Completed",
  status: "completed",
}));
const deleteScratchpadTask = mock(async () => ({ id: "task-1" }));
const resolveScratchpadTaskThread = mock(async () => ({
  threadId: "virtual-thread-1",
  visibility: "virtual",
}));
const getOwnedWorkspaceOrThrow = mock(async () => ({
  id: "workspace-1",
  isArchived: false,
}));

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/lib/scratchpad/service", () => ({
  createScratchpadTask,
  deleteScratchpadTask,
  listScratchpad,
  resolveScratchpadTaskThread,
  toggleScratchpadTaskComplete,
}));

mock.module("./workspace-thread-helpers", () => ({
  getOwnedWorkspaceOrThrow,
}));

const { scratchpadRouter } = await import("./scratchpad");

beforeEach(() => {
  listScratchpad.mockReset();
  createScratchpadTask.mockReset();
  toggleScratchpadTaskComplete.mockReset();
  deleteScratchpadTask.mockReset();
  resolveScratchpadTaskThread.mockReset();
  getOwnedWorkspaceOrThrow.mockReset();

  listScratchpad.mockImplementation(async () => ({
    hubThreadId: "hub-thread-1",
    id: "scratchpad-1",
    tasks: [],
    workspaceId: "workspace-1",
  }));
  createScratchpadTask.mockImplementation(async () => ({
    id: "task-1",
    progressText: "Thinking",
    status: "running",
    title: "Check release notes",
    virtualThreadId: "virtual-thread-1",
    visibleThreadId: null,
  }));
  toggleScratchpadTaskComplete.mockImplementation(async () => ({
    id: "task-1",
    progressText: "Completed",
    status: "completed",
  }));
  deleteScratchpadTask.mockImplementation(async () => ({ id: "task-1" }));
  resolveScratchpadTaskThread.mockImplementation(async () => ({
    threadId: "virtual-thread-1",
    visibility: "virtual",
  }));
  getOwnedWorkspaceOrThrow.mockImplementation(async () => ({
    id: "workspace-1",
    isArchived: false,
  }));
});

afterEach(() => {
  mock.restore();
});

describe("scratchpadRouter", () => {
  it("loads scratchpad state for the selected workspace", async () => {
    const result = await scratchpadRouter.getCurrent({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
        user: { id: "user-1", selectedWorkspaceId: "workspace-1" },
        workspace: { id: "workspace-1" },
      },
    });

    expect(getOwnedWorkspaceOrThrow).toHaveBeenCalled();
    expect(listScratchpad).toHaveBeenCalledWith({
      database: {},
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(result.workspaceId).toBe("workspace-1");
  });

  it("creates tasks in the resolved workspace", async () => {
    const result = await scratchpadRouter.createTask({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
        user: { id: "user-1", selectedWorkspaceId: "workspace-1" },
        workspace: { id: "workspace-1" },
      },
      input: {
        title: "Check release notes",
      },
    });

    expect(createScratchpadTask).toHaveBeenCalledWith({
      database: {},
      title: "Check release notes",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(result.status).toBe("running");
  });

  it("resolves a task thread without needing workspace input", async () => {
    const result = await scratchpadRouter.resolveTaskThread({
      ctx: {
        db: {},
        session: { user: { id: "user-1" } },
        user: { id: "user-1", selectedWorkspaceId: "workspace-1" },
        workspace: { id: "workspace-1" },
      },
      input: {
        taskId: "task-1",
      },
    });

    expect(resolveScratchpadTaskThread).toHaveBeenCalledWith({
      database: {},
      taskId: "task-1",
      userId: "user-1",
    });
    expect(result.threadId).toBe("virtual-thread-1");
  });
});
