import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const resolveRepoContext = mock(async () => ({
  branch: "main",
  isGitRepo: true,
  repoRoot: "/tmp/workspace",
}));
const createRepoCheckpointSnapshot = mock(async () => ({
  treeHash: "before-tree",
}));
const disposeRepoCheckpointSnapshot = mock(async () => {});
const buildRepoCheckpointDiff = mock(async () => ({
  afterTreeHash: "after-tree",
  changedPaths: ["src/app.ts"],
  forwardPatch: "diff --git a/src/app.ts b/src/app.ts",
  reversePatch: "diff --git a/src/app.ts b/src/app.ts",
}));
const getRepoHeadCommit = mock(async () => "head-sha");
const updateMessageMetadata = mock(async () => {});
const updateThreadRepoState = mock(() => {});

mock.module("@/lib/git/repo", () => ({
  resolveRepoContext,
}));

mock.module("@/lib/git/checkpoints", () => ({
  applyRepoCheckpointPatch: mock(async () => {}),
  buildRepoCheckpointDiff,
  createRepoCheckpointSnapshot,
  disposeRepoCheckpointSnapshot,
  getRepoHeadCommit,
  restoreRepoCheckpointTree: mock(async () => {}),
}));

mock.module("../persistence", () => ({
  setActiveMessage: mock(async () => {}),
  updateMessageMetadata,
  updateThreadRepoState,
}));

mock.module("@/server/db", () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => ({
          all: mock(() => [{ id: "checkpoint-1" }]),
        })),
      })),
    })),
    query: {
      threadMessages: {
        findFirst: mock(async () => null),
      },
      threadRepoCheckpoints: {
        findFirst: mock(async () => null),
        findMany: mock(async () => []),
      },
    },
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          run: mock(() => {}),
        })),
      })),
    })),
  },
}));

const {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
} = await import("./checkpoints");

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mock.clearAllMocks();
  resolveRepoContext.mockImplementation(async () => ({
    branch: "main",
    isGitRepo: true,
    repoRoot: "/tmp/workspace",
  }));
  createRepoCheckpointSnapshot.mockImplementation(async () => ({
    treeHash: "before-tree",
  }));
  buildRepoCheckpointDiff.mockImplementation(async () => ({
    afterTreeHash: "after-tree",
    changedPaths: ["src/app.ts"],
    forwardPatch: "diff --git a/src/app.ts b/src/app.ts",
    reversePatch: "diff --git a/src/app.ts b/src/app.ts",
  }));
  getRepoHeadCommit.mockImplementation(async () => "head-sha");
});

describe("repo checkpoint run coordination", () => {
  it("lets finalize wait for a pending checkpoint start", async () => {
    const snapshot = { treeHash: "before-tree" };
    const snapshotStart = createDeferred<typeof snapshot>();
    createRepoCheckpointSnapshot.mockImplementationOnce(
      () => snapshotStart.promise,
    );

    void beginThreadRepoCheckpointRun({
      projectPath: "/tmp/workspace",
      runId: "run-1",
      thread: null,
    });
    const finalized = finalizeThreadRepoCheckpointRun({
      assistantMessageId: "assistant-1",
      runId: "run-1",
      threadId: "thread-1",
    });
    await flushAsyncWork();

    expect(buildRepoCheckpointDiff).not.toHaveBeenCalled();

    snapshotStart.resolve(snapshot);

    await expect(finalized).resolves.toBe("checkpoint-1");
    expect(buildRepoCheckpointDiff).toHaveBeenCalledWith(snapshot);
  });

  it("lets clear wait for a pending checkpoint start before disposing", async () => {
    const snapshot = { treeHash: "before-tree" };
    const snapshotStart = createDeferred<typeof snapshot>();
    createRepoCheckpointSnapshot.mockImplementationOnce(
      () => snapshotStart.promise,
    );

    void beginThreadRepoCheckpointRun({
      projectPath: "/tmp/workspace",
      runId: "run-2",
      thread: null,
    });
    const cleared = clearThreadRepoCheckpointRun("run-2");
    await flushAsyncWork();

    expect(disposeRepoCheckpointSnapshot).not.toHaveBeenCalled();

    snapshotStart.resolve(snapshot);
    await cleared;

    expect(disposeRepoCheckpointSnapshot).toHaveBeenCalledWith(snapshot);
  });
});
