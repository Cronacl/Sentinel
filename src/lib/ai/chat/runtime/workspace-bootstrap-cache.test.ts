import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let currentChatEngineState: unknown = null;
let threadLookupCount = 0;

const findUser = mock(
  async () =>
    ({
      aboutUser: null,
      contextCompactionEnabled: null,
      contextCompactionFixedWindowSize: null,
      contextCompactionUseFixedWindow: null,
      contextCompactionWindowPercent: null,
      customInstructions: null,
      nickname: null,
      occupation: null,
      personalityPreset: null,
      permissionMode: null,
      skillsBasePath: null,
      webFetchBatchEnabled: null,
      webFetchBatchLimit: null,
    }) as const,
);
const findWorkspace = mock(
  async () =>
    ({
      kind: "project" as const,
      permissionModeOverride: null,
      rootPath: "/workspace/local",
    }) as const,
);
const findThread = mock(async () => {
  threadLookupCount += 1;
  return {
    chatEngineState: currentChatEngineState,
  } as const;
});
const resolveAvailableWorkspaceRootPath = mock(
  async (value: string | null | undefined) => value?.trim() ?? null,
);

mock.module("server-only", () => ({}));

mock.module("@/server/db", () => ({
  db: {
    query: {
      threads: {
        findFirst: findThread,
      },
      users: {
        findFirst: findUser,
      },
      workspaces: {
        findFirst: findWorkspace,
      },
    },
  },
}));

mock.module("./workspace-path", () => ({
  resolveAvailableWorkspaceRootPath,
}));

mock.module("./workspace-path.ts", () => ({
  resolveAvailableWorkspaceRootPath,
}));

// @ts-expect-error test-only isolated module import
const workspaceModule = await import("./workspace?bootstrap-cache-test");
const {
  clearThreadRuntimeBootstrapCache,
  getThreadRuntimeBootstrap,
  invalidateThreadRuntimeBootstrap,
} = workspaceModule;

describe("thread runtime bootstrap cache", () => {
  beforeEach(() => {
    currentChatEngineState = {
      repo: {
        projectMode: "local",
        worktreePath: null,
      },
    };
    threadLookupCount = 0;
    clearThreadRuntimeBootstrapCache();
    findThread.mockClear();
    findUser.mockClear();
    findWorkspace.mockClear();
    resolveAvailableWorkspaceRootPath.mockClear();
  });

  afterEach(() => {
    clearThreadRuntimeBootstrapCache();
  });

  it("keeps a cached local workspace root until the cache is invalidated", async () => {
    const initialBootstrap = await getThreadRuntimeBootstrap(
      "user-1",
      "workspace-1",
      "thread-1",
    );

    expect(initialBootstrap.workspaceRoot).toBe("/workspace/local");
    expect(threadLookupCount).toBe(1);

    currentChatEngineState = {
      repo: {
        projectMode: "worktree",
        worktreePath: "/workspace/worktrees/thread-1",
      },
    };

    const cachedBootstrap = await getThreadRuntimeBootstrap(
      "user-1",
      "workspace-1",
      "thread-1",
    );

    expect(cachedBootstrap.workspaceRoot).toBe("/workspace/local");
    expect(threadLookupCount).toBe(1);

    invalidateThreadRuntimeBootstrap("user-1", "workspace-1", "thread-1");

    const refreshedBootstrap = await getThreadRuntimeBootstrap(
      "user-1",
      "workspace-1",
      "thread-1",
    );

    expect(refreshedBootstrap.workspaceRoot).toBe(
      "/workspace/worktrees/thread-1",
    );
    expect(threadLookupCount).toBe(2);
  });
});
