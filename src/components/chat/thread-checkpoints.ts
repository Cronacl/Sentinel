import { getErrorMessage } from "@/lib/errors";

export type UserMessageCheckpointAction = "reapply" | "reset";

type CheckpointRepoContextState = {
  checkpointAnchorMessageId?: string | null;
  checkpointCursorId?: string | null;
  checkpointLatestId?: string | null;
};

export function resolveUserMessageCheckpointAction(input: {
  checkpointAnchorMessageId?: string | null;
  checkpointCursorId?: string | null;
  checkpointId?: string | null;
  checkpointLatestId?: string | null;
  messageId: string;
}): UserMessageCheckpointAction | null {
  if (!input.checkpointId) {
    return null;
  }

  if (
    input.checkpointAnchorMessageId === input.messageId &&
    input.checkpointLatestId &&
    input.checkpointLatestId !== input.checkpointCursorId
  ) {
    return "reapply";
  }

  return "reset";
}

export function buildRepoDiffPanelInvalidationInputs(input: {
  threadId: string;
  workspaceId: string;
}) {
  return (["unstaged", "staged", "branch"] as const).map((mode) => ({
    mode,
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  }));
}

export async function reapplyUserMessageCheckpoint(input: {
  clearEditingMessage: () => void;
  invalidateRepoContext: () => Promise<unknown>;
  invalidateRepoDiffPanels: () => Promise<unknown>;
  notifySuccess: () => void;
  previousRepoContext: CheckpointRepoContextState | null;
  setError: (message: string | null) => void;
  setRepoContext: (context: CheckpointRepoContextState) => void;
  threadId: string;
  toggleCheckpoint: (input: {
    checkpointId: string;
    threadId: string;
    workspaceId: string;
  }) => Promise<{ repoContext: CheckpointRepoContextState }>;
  workspaceId: string;
}) {
  const latestCheckpointId = input.previousRepoContext?.checkpointLatestId;

  if (!latestCheckpointId) {
    input.setError("No later checkpoint is available to reapply.");
    return false;
  }

  input.setError(null);

  if (input.previousRepoContext) {
    input.setRepoContext({
      ...input.previousRepoContext,
      checkpointAnchorMessageId: null,
      checkpointCursorId: latestCheckpointId,
    });
  }

  try {
    const result = await input.toggleCheckpoint({
      checkpointId: latestCheckpointId,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
    });

    input.setRepoContext(result.repoContext);
    await input.invalidateRepoDiffPanels();
    input.clearEditingMessage();
    input.notifySuccess();
    return true;
  } catch (error) {
    if (input.previousRepoContext) {
      input.setRepoContext(input.previousRepoContext);
    }
    input.setError(
      getErrorMessage(error, "Unable to reapply the latest checkpoint."),
    );
    return false;
  } finally {
    await input.invalidateRepoContext();
  }
}
