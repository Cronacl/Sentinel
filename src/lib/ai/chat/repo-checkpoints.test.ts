import { beforeEach, describe, expect, it, mock } from "bun:test";

const findThreadRepoCheckpoints = mock(async () => []);
const restoreRepoCheckpointTree = mock(async () => ({
  appliedPaths: ["file.ts"],
  failedPaths: [],
}));
const applyRepoCheckpointPatch = mock(async () => ({
  appliedPaths: ["file.ts"],
  failedPaths: [],
}));
const setActiveMessage = mock(async () => undefined);
const updateMessageMetadata = mock(async () => undefined);
const updateThreadRepoState = mock(() => undefined);

mock.module("@/lib/git/checkpoints", () => ({
  applyRepoCheckpointPatch,
  buildRepoCheckpointDiff: mock(async () => ({
    afterTreeHash: "after-tree",
    changedPaths: ["file.ts"],
    forwardPatch: "forward patch",
    reversePatch: "reverse patch",
  })),
  createRepoCheckpointSnapshot: mock(async () => ({
    treeHash: "before-tree",
  })),
  disposeRepoCheckpointSnapshot: mock(async () => undefined),
  getRepoHeadCommit: mock(async () => "HEAD"),
  restoreRepoCheckpointTree,
}));

mock.module("@/server/db", () => ({
  db: {
    query: {
      threadMessages: {
        findFirst: mock(async () => null),
      },
      threadRepoCheckpoints: {
        findMany: findThreadRepoCheckpoints,
      },
    },
  },
}));

mock.module("./persistence", () => ({
  setActiveMessage,
  updateMessageMetadata,
  updateThreadRepoState,
}));

const { resetThreadRepoCheckpoint } = await import("./repo-checkpoints");

describe("resetThreadRepoCheckpoint", () => {
  beforeEach(() => {
    applyRepoCheckpointPatch.mockClear();
    findThreadRepoCheckpoints.mockClear();
    restoreRepoCheckpointTree.mockClear();
    setActiveMessage.mockClear();
    updateMessageMetadata.mockClear();
    updateThreadRepoState.mockClear();
  });

  it("preserves the previous latest checkpoint when resetting from a non-tip message", async () => {
    findThreadRepoCheckpoints.mockResolvedValueOnce([
      {
        afterTreeHash: "tree-1-after",
        beforeTreeHash: "tree-1-before",
        effectiveProjectPath: "/tmp/workspace",
        id: "checkpoint-1",
        parentCheckpointId: null,
        repoRoot: "/tmp/workspace",
      },
      {
        afterTreeHash: "tree-2-after",
        beforeTreeHash: "tree-2-before",
        effectiveProjectPath: "/tmp/workspace",
        id: "checkpoint-2",
        parentCheckpointId: "checkpoint-1",
        repoRoot: "/tmp/workspace",
      },
      {
        afterTreeHash: "tree-3-after",
        beforeTreeHash: "tree-3-before",
        effectiveProjectPath: "/tmp/workspace",
        id: "checkpoint-3",
        parentCheckpointId: "checkpoint-2",
        repoRoot: "/tmp/workspace",
      },
    ]);

    const result = await resetThreadRepoCheckpoint({
      checkpointId: "checkpoint-2",
      projectPath: "/tmp/workspace",
      thread: {
        chatEngineState: {
          repo: {
            checkpointCursorId: "checkpoint-3",
            checkpointLatestId: "checkpoint-3",
            checkpointProjectPath: "/tmp/workspace",
          },
        },
      },
      threadId: "thread-1",
      userMessageId: "user-2",
    });

    expect(restoreRepoCheckpointTree).toHaveBeenCalledWith({
      projectPath: "/tmp/workspace",
      repoRoot: "/tmp/workspace",
      targetTreeHash: "tree-2-before",
    });
    expect(setActiveMessage).toHaveBeenCalledWith("thread-1", "user-2");
    expect(updateThreadRepoState).toHaveBeenCalledWith("thread-1", {
      checkpointAnchorMessageId: "user-2",
      checkpointCursorId: "checkpoint-1",
      checkpointLatestId: "checkpoint-3",
      checkpointProjectPath: "/tmp/workspace",
    });
    expect(result).toMatchObject({
      changed: true,
      checkpointAnchorMessageId: "user-2",
      checkpointCursorId: "checkpoint-1",
      checkpointLatestId: "checkpoint-3",
    });
  });
});
