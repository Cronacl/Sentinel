import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
  reapplyUserMessageCheckpoint,
  resolveUserMessageCheckpointAction,
} from "./thread-checkpoints";

describe("resolveUserMessageCheckpointAction", () => {
  it("defaults checkpointed user messages to reset", () => {
    expect(
      resolveUserMessageCheckpointAction({
        checkpointId: "checkpoint-2",
        messageId: "user-2",
      }),
    ).toBe("reset");
  });

  it("switches the restored anchor to reapply when a later tip exists", () => {
    expect(
      resolveUserMessageCheckpointAction({
        checkpointAnchorMessageId: "user-2",
        checkpointCursorId: "checkpoint-1",
        checkpointId: "checkpoint-2",
        checkpointLatestId: "checkpoint-3",
        messageId: "user-2",
      }),
    ).toBe("reapply");
  });

  it("keeps restored anchors on reset when no later tip exists", () => {
    expect(
      resolveUserMessageCheckpointAction({
        checkpointAnchorMessageId: "user-2",
        checkpointCursorId: "checkpoint-2",
        checkpointId: "checkpoint-2",
        checkpointLatestId: "checkpoint-2",
        messageId: "user-2",
      }),
    ).toBe("reset");
  });
});

describe("reapplyUserMessageCheckpoint", () => {
  const clearEditingMessage = mock(() => undefined);
  const invalidateRepoContext = mock(async () => undefined);
  const invalidateRepoDiffPanels = mock(async () => undefined);
  const notifySuccess = mock(() => undefined);
  const setError = mock(() => undefined);
  const setRepoContext = mock(() => undefined);
  const toggleCheckpoint = mock(async () => ({
    repoContext: {
      checkpointAnchorMessageId: null,
      checkpointCursorId: "checkpoint-3",
      checkpointLatestId: "checkpoint-3",
    },
  }));

  beforeEach(() => {
    clearEditingMessage.mockClear();
    invalidateRepoContext.mockClear();
    invalidateRepoDiffPanels.mockClear();
    notifySuccess.mockClear();
    setError.mockClear();
    setRepoContext.mockClear();
    toggleCheckpoint.mockClear();
    toggleCheckpoint.mockResolvedValue({
      repoContext: {
        checkpointAnchorMessageId: null,
        checkpointCursorId: "checkpoint-3",
        checkpointLatestId: "checkpoint-3",
      },
    });
  });

  it("reapplies the saved latest checkpoint and clears edit mode", async () => {
    const result = await reapplyUserMessageCheckpoint({
      clearEditingMessage,
      invalidateRepoContext,
      invalidateRepoDiffPanels,
      notifySuccess,
      previousRepoContext: {
        checkpointAnchorMessageId: "user-2",
        checkpointCursorId: "checkpoint-1",
        checkpointLatestId: "checkpoint-3",
      },
      setError,
      setRepoContext,
      threadId: "thread-1",
      toggleCheckpoint,
      workspaceId: "workspace-1",
    });

    expect(result).toBe(true);
    expect(toggleCheckpoint).toHaveBeenCalledWith({
      checkpointId: "checkpoint-3",
      threadId: "thread-1",
      workspaceId: "workspace-1",
    });
    expect(setRepoContext).toHaveBeenNthCalledWith(1, {
      checkpointAnchorMessageId: null,
      checkpointCursorId: "checkpoint-3",
      checkpointLatestId: "checkpoint-3",
    });
    expect(setRepoContext).toHaveBeenNthCalledWith(2, {
      checkpointAnchorMessageId: null,
      checkpointCursorId: "checkpoint-3",
      checkpointLatestId: "checkpoint-3",
    });
    expect(clearEditingMessage).toHaveBeenCalledTimes(1);
    expect(invalidateRepoDiffPanels).toHaveBeenCalledTimes(1);
    expect(invalidateRepoContext).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
  });

  it("restores the previous cache state and surfaces the error on failure", async () => {
    toggleCheckpoint.mockRejectedValueOnce(
      new Error("Checkpoint apply failed."),
    );

    const previousRepoContext = {
      checkpointAnchorMessageId: "user-2",
      checkpointCursorId: "checkpoint-1",
      checkpointLatestId: "checkpoint-3",
    };
    const result = await reapplyUserMessageCheckpoint({
      clearEditingMessage,
      invalidateRepoContext,
      invalidateRepoDiffPanels,
      notifySuccess,
      previousRepoContext,
      setError,
      setRepoContext,
      threadId: "thread-1",
      toggleCheckpoint,
      workspaceId: "workspace-1",
    });

    expect(result).toBe(false);
    expect(setRepoContext).toHaveBeenNthCalledWith(1, {
      checkpointAnchorMessageId: null,
      checkpointCursorId: "checkpoint-3",
      checkpointLatestId: "checkpoint-3",
    });
    expect(setRepoContext).toHaveBeenNthCalledWith(2, previousRepoContext);
    expect(clearEditingMessage).not.toHaveBeenCalled();
    expect(invalidateRepoDiffPanels).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(invalidateRepoContext).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenLastCalledWith("Checkpoint apply failed.");
  });
});
