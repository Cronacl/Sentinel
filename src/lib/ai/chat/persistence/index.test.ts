import { beforeEach, describe, expect, it, mock } from "bun:test";

const invalidateThreadRuntimeBootstrap = mock(() => {});
const findThreadRecord = mock(async () => null);
const runInsert = mock(() => {});
const runUpdate = mock(() => {});
const setUpdate = mock((_values: Record<string, unknown>) => ({
  where: mock(() => ({
    run: runUpdate,
  })),
}));
const getExistingThread = mock(() => ({
  chatEngineState: {
    repo: {
      activeBranch: "main",
    },
  },
  userId: "user-1",
  workspaceId: "workspace-1",
}));

mock.module("@/server/db", () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          run: runInsert,
        })),
      })),
    })),
    query: {
      threads: {
        findFirst: findThreadRecord,
      },
    },
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          get: getExistingThread,
        })),
      })),
    })),
    update: mock(() => ({
      set: setUpdate,
    })),
  },
}));

mock.module("../runtime/workspace", () => ({
  invalidateThreadRuntimeBootstrap,
}));

mock.module("../runtime/workspace.ts", () => ({
  invalidateThreadRuntimeBootstrap,
}));

// @ts-expect-error test-only isolated module import
const persistenceModule = await import("./index?persistence-cache-test");
const { ensureThread, updateDriverThreadState, updateThreadChatEngineState } =
  persistenceModule;

describe("persistence thread state", () => {
  beforeEach(() => {
    findThreadRecord.mockReset();
    findThreadRecord.mockResolvedValue(null);
    getExistingThread.mockClear();
    invalidateThreadRuntimeBootstrap.mockClear();
    runInsert.mockClear();
    runUpdate.mockClear();
    setUpdate.mockClear();
  });

  it("invalidates the cached runtime bootstrap for the updated thread", () => {
    updateThreadChatEngineState("thread-1", {
      repo: {
        projectMode: "worktree",
        worktreePath: "/workspace/worktrees/thread-1",
      },
    });

    expect(runUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateThreadRuntimeBootstrap).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "thread-1",
    );
  });

  it("applies draft repo state to an existing placeholder thread", async () => {
    findThreadRecord.mockResolvedValue({
      chatEngine: "sentinel",
      id: "thread-1",
      mode: "chat",
    });

    await ensureThread(
      "thread-1",
      "user-1",
      "workspace-1",
      "New thread",
      "chat",
      "sentinel",
      {
        repo: {
          activeBranch: "thread/atlas-a1b2c3",
          projectMode: "worktree",
          worktreePath: "/workspace/worktrees/thread-1",
        },
      },
    );

    expect(runInsert).not.toHaveBeenCalled();
    expect(runUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateThreadRuntimeBootstrap).toHaveBeenCalledWith(
      "user-1",
      "workspace-1",
      "thread-1",
    );
  });

  it("keeps permissionModeOverride and other drivers when a driver state is cleared", () => {
    getExistingThread.mockImplementationOnce(() => ({
      chatEngineState: {
        codex: { codexThreadId: "codex-thread-1" },
        gemini: { sessionId: "gemini-1" },
        permissionModeOverride: "full",
      },
      userId: "user-1",
      workspaceId: "workspace-1",
    }));

    updateDriverThreadState("thread-1", "codex", null);

    expect(setUpdate.mock.calls[0]?.[0]).toMatchObject({
      chatEngineState: {
        codex: null,
        gemini: { sessionId: "gemini-1" },
        permissionModeOverride: "full",
      },
    });
  });
});
