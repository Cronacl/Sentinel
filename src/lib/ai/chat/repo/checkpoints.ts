import { and, eq } from "drizzle-orm";

import { createLogger } from "@/lib/logger";
import {
  applyRepoCheckpointPatch,
  buildRepoCheckpointDiff,
  createRepoCheckpointSnapshot,
  disposeRepoCheckpointSnapshot,
  getRepoHeadCommit,
  restoreRepoCheckpointTree,
  type RepoCheckpointSnapshot,
} from "@/lib/git/checkpoints";
import { resolveRepoContext } from "@/lib/git/repo";
import { db } from "@/server/db";
import {
  threadMessages,
  threadRepoCheckpoints,
  threads,
} from "@/server/db/schema";
import { getRepoThreadState } from "../engines/types";
import {
  setActiveMessage,
  updateMessageMetadata,
  updateThreadRepoState,
} from "../persistence";
import { normalizeThreadMessageMetadata } from "../../messages/types";

type PersistedRepoCheckpoint = typeof threadRepoCheckpoints.$inferSelect;

type ActiveRepoCheckpointRun = {
  parentCheckpointId: string | null;
  projectPath: string;
  snapshot: RepoCheckpointSnapshot;
};

const activeRepoCheckpointRuns = new Map<string, ActiveRepoCheckpointRun>();
const pendingRepoCheckpointRuns = new Map<string, Promise<boolean>>();
const log = createLogger("RepoCheckpoints");

function getThreadCheckpointCursorId(
  thread: { chatEngineState?: unknown } | null,
) {
  const repoState = getRepoThreadState(thread?.chatEngineState);
  return repoState?.checkpointCursorId ?? repoState?.checkpointLatestId ?? null;
}

export function getThreadCheckpointAnchorMessageId(
  thread: { chatEngineState?: unknown } | null,
) {
  return (
    getRepoThreadState(thread?.chatEngineState)?.checkpointAnchorMessageId ??
    null
  );
}

export async function beginThreadRepoCheckpointRun(input: {
  projectPath: string | null;
  runId: string;
  thread: { chatEngineState?: unknown } | null;
}) {
  if (!input.projectPath?.trim()) {
    return false;
  }

  const pending = (async () => {
    try {
      const repoContext = await resolveRepoContext(input.projectPath!);
      if (!repoContext.isGitRepo || !repoContext.repoRoot) {
        return false;
      }

      const snapshot = await createRepoCheckpointSnapshot(input.projectPath!);
      activeRepoCheckpointRuns.set(input.runId, {
        parentCheckpointId: getThreadCheckpointCursorId(input.thread),
        projectPath: input.projectPath!,
        snapshot,
      });
      return true;
    } catch (error) {
      log.warn("repo_checkpoint_snapshot_start_failed", {
        error,
        projectPath: input.projectPath,
        runId: input.runId,
      });
      return false;
    } finally {
      pendingRepoCheckpointRuns.delete(input.runId);
    }
  })();

  pendingRepoCheckpointRuns.set(input.runId, pending);
  return await pending;
}

async function awaitPendingRepoCheckpointRun(runId: string) {
  const pending = pendingRepoCheckpointRuns.get(runId);
  if (!pending) {
    return;
  }

  await pending.catch(() => false);
}

export async function clearThreadRepoCheckpointRun(runId: string) {
  await awaitPendingRepoCheckpointRun(runId);
  const activeRun = activeRepoCheckpointRuns.get(runId);
  activeRepoCheckpointRuns.delete(runId);
  await disposeRepoCheckpointSnapshot(activeRun?.snapshot);
}

export async function finalizeThreadRepoCheckpointRun(input: {
  assistantMessageId: string;
  runId: string;
  threadId: string;
}) {
  await awaitPendingRepoCheckpointRun(input.runId);
  const activeRun = activeRepoCheckpointRuns.get(input.runId);
  activeRepoCheckpointRuns.delete(input.runId);

  if (!activeRun) {
    return null;
  }

  try {
    const repoContext = await resolveRepoContext(activeRun.projectPath);
    if (!repoContext.isGitRepo || !repoContext.repoRoot) {
      return null;
    }

    const existing = await db.query.threadRepoCheckpoints.findFirst({
      where: and(
        eq(threadRepoCheckpoints.threadId, input.threadId),
        eq(threadRepoCheckpoints.assistantMessageId, input.assistantMessageId),
      ),
    });
    if (existing) {
      return existing.id;
    }

    const diff = await buildRepoCheckpointDiff(activeRun.snapshot);
    if (diff.changedPaths.length === 0 || !diff.forwardPatch.trim()) {
      return null;
    }

    const headAtCapture = await getRepoHeadCommit(activeRun.projectPath);
    const [created] = db
      .insert(threadRepoCheckpoints)
      .values({
        afterTreeHash: diff.afterTreeHash,
        assistantMessageId: input.assistantMessageId,
        branchAtCapture: repoContext.branch,
        beforeTreeHash: activeRun.snapshot.treeHash,
        changedPaths: diff.changedPaths,
        effectiveProjectPath: activeRun.projectPath,
        forwardPatch: diff.forwardPatch,
        headAtCapture,
        parentCheckpointId: activeRun.parentCheckpointId,
        repoRoot: repoContext.repoRoot,
        reversePatch: diff.reversePatch,
        runId: input.runId,
        threadId: input.threadId,
      })
      .returning({
        id: threadRepoCheckpoints.id,
      })
      .all();

    if (!created?.id) {
      return null;
    }

    const assistantRecord = await db.query.threadMessages.findFirst({
      where: and(
        eq(threadMessages.threadId, input.threadId),
        eq(threadMessages.messageId, input.assistantMessageId),
      ),
      columns: {
        metadata: true,
      },
    });
    const parentMessageId =
      normalizeThreadMessageMetadata(assistantRecord?.metadata as any)
        .parentMessageId ?? null;
    if (parentMessageId) {
      await updateMessageMetadata(input.threadId, parentMessageId, {
        repoCheckpointId: created.id,
      });
    }

    updateThreadRepoState(input.threadId, {
      checkpointAnchorMessageId: null,
      checkpointCursorId: created.id,
      checkpointLatestId: created.id,
      checkpointProjectPath: activeRun.projectPath,
    });

    return created.id;
  } catch (error) {
    log.warn("repo_checkpoint_finalize_failed", {
      assistantMessageId: input.assistantMessageId,
      error,
      runId: input.runId,
      threadId: input.threadId,
    });
    return null;
  } finally {
    await disposeRepoCheckpointSnapshot(activeRun.snapshot);
  }
}

export async function listThreadRepoCheckpoints(threadId: string) {
  return await db.query.threadRepoCheckpoints.findMany({
    orderBy: (checkpoints, { asc }) => [asc(checkpoints.createdAt)],
    where: eq(threadRepoCheckpoints.threadId, threadId),
  });
}

function buildCheckpointMap(checkpoints: PersistedRepoCheckpoint[]) {
  return new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
}

function buildAncestorChain(
  checkpointId: string | null,
  checkpointMap: Map<string, PersistedRepoCheckpoint>,
) {
  const chain: PersistedRepoCheckpoint[] = [];
  let currentId = checkpointId;

  while (currentId) {
    const current = checkpointMap.get(currentId);
    if (!current) {
      break;
    }

    chain.push(current);
    currentId = current.parentCheckpointId;
  }

  return chain;
}

function findLowestCommonAncestor(
  leftId: string | null,
  rightId: string | null,
  checkpointMap: Map<string, PersistedRepoCheckpoint>,
) {
  const leftAncestors = new Set(
    buildAncestorChain(leftId, checkpointMap).map(
      (checkpoint) => checkpoint.id,
    ),
  );

  let currentId = rightId;
  while (currentId) {
    if (leftAncestors.has(currentId)) {
      return currentId;
    }

    currentId = checkpointMap.get(currentId)?.parentCheckpointId ?? null;
  }

  return null;
}

function collectReversePathToAncestor(
  fromId: string | null,
  ancestorId: string | null,
  checkpointMap: Map<string, PersistedRepoCheckpoint>,
) {
  const checkpoints: PersistedRepoCheckpoint[] = [];
  let currentId = fromId;

  while (currentId && currentId !== ancestorId) {
    const current = checkpointMap.get(currentId);
    if (!current) {
      break;
    }

    checkpoints.push(current);
    currentId = current.parentCheckpointId;
  }

  return checkpoints;
}

function collectForwardPathFromAncestor(
  targetId: string | null,
  ancestorId: string | null,
  checkpointMap: Map<string, PersistedRepoCheckpoint>,
) {
  const checkpoints: PersistedRepoCheckpoint[] = [];
  let currentId = targetId;

  while (currentId && currentId !== ancestorId) {
    const current = checkpointMap.get(currentId);
    if (!current) {
      break;
    }

    checkpoints.push(current);
    currentId = current.parentCheckpointId;
  }

  checkpoints.reverse();
  return checkpoints;
}

function summarizePatchFailures(
  failures: Array<{ error: string; path: string }>,
  action: string,
) {
  const summary = failures
    .slice(0, 3)
    .map((failure) => `${failure.path}: ${failure.error}`)
    .join("; ");
  return `${action} failed for ${failures.length} file${failures.length === 1 ? "" : "s"}${summary ? ` (${summary})` : "."}`;
}

export async function toggleThreadRepoCheckpoint(input: {
  checkpointId: string;
  projectPath: string;
  threadId: string;
  thread: { chatEngineState?: unknown } | null;
}) {
  const checkpoints = await listThreadRepoCheckpoints(input.threadId);
  const checkpointMap = buildCheckpointMap(checkpoints);
  const target = checkpointMap.get(input.checkpointId);

  if (!target) {
    throw new Error("Checkpoint not found.");
  }

  const repoState = getRepoThreadState(input.thread?.chatEngineState);
  const expectedProjectPath =
    repoState?.checkpointProjectPath ?? target.effectiveProjectPath;
  if (expectedProjectPath !== input.projectPath) {
    throw new Error(
      "This checkpoint belongs to a different project path. Switch the thread back to that project before restoring it.",
    );
  }

  const currentCheckpointId =
    repoState?.checkpointCursorId ?? repoState?.checkpointLatestId ?? null;
  const latestCheckpointId =
    repoState?.checkpointLatestId ?? currentCheckpointId;
  let hydratedTarget = target;

  if (
    !hydratedTarget.afterTreeHash &&
    currentCheckpointId === input.checkpointId
  ) {
    const currentSnapshot = await createRepoCheckpointSnapshot(
      input.projectPath,
    );
    hydratedTarget = {
      ...hydratedTarget,
      afterTreeHash: currentSnapshot.treeHash,
    };
    db.update(threadRepoCheckpoints)
      .set({
        afterTreeHash: currentSnapshot.treeHash,
        updatedAt: new Date(),
      })
      .where(eq(threadRepoCheckpoints.id, hydratedTarget.id))
      .run();
  }

  const restoreTargetCheckpointId =
    currentCheckpointId === input.checkpointId
      ? latestCheckpointId && latestCheckpointId !== currentCheckpointId
        ? latestCheckpointId
        : input.checkpointId
      : input.checkpointId;
  const restoreTarget =
    restoreTargetCheckpointId == null
      ? null
      : restoreTargetCheckpointId === hydratedTarget.id
        ? hydratedTarget
        : checkpointMap.get(restoreTargetCheckpointId);

  if (restoreTarget?.afterTreeHash) {
    const restoreResult = await restoreRepoCheckpointTree({
      projectPath: input.projectPath,
      repoRoot: restoreTarget.repoRoot,
      targetTreeHash: restoreTarget.afterTreeHash,
    });
    if (restoreResult.failedPaths.length > 0) {
      throw new Error(
        summarizePatchFailures(
          restoreResult.failedPaths,
          currentCheckpointId === input.checkpointId ? "Reapply" : "Restore",
        ),
      );
    }

    const nextCursorId = restoreTargetCheckpointId;
    updateThreadRepoState(input.threadId, {
      checkpointAnchorMessageId:
        nextCursorId && nextCursorId !== latestCheckpointId
          ? (checkpointMap.get(nextCursorId)?.assistantMessageId ?? null)
          : null,
      checkpointCursorId: nextCursorId,
      checkpointLatestId: latestCheckpointId,
      checkpointProjectPath: input.projectPath,
    });

    return {
      changed: restoreResult.appliedPaths.length > 0,
      checkpointCursorId: nextCursorId,
      checkpointLatestId: latestCheckpointId,
    };
  }

  if (currentCheckpointId === input.checkpointId) {
    if (!latestCheckpointId || latestCheckpointId === currentCheckpointId) {
      return {
        changed: false,
        checkpointCursorId: currentCheckpointId,
        checkpointLatestId: latestCheckpointId,
      };
    }

    const forwardCheckpoints = collectForwardPathFromAncestor(
      latestCheckpointId,
      currentCheckpointId,
      checkpointMap,
    );
    for (const checkpoint of forwardCheckpoints) {
      const result = await applyRepoCheckpointPatch({
        patch: checkpoint.forwardPatch,
        projectPath: input.projectPath,
      });
      if (result.failedPaths.length > 0) {
        throw new Error(summarizePatchFailures(result.failedPaths, "Reapply"));
      }
    }

    updateThreadRepoState(input.threadId, {
      checkpointAnchorMessageId: null,
      checkpointCursorId: latestCheckpointId,
      checkpointLatestId: latestCheckpointId,
      checkpointProjectPath: input.projectPath,
    });

    return {
      changed: true,
      checkpointCursorId: latestCheckpointId,
      checkpointLatestId: latestCheckpointId,
    };
  }

  const ancestorId = findLowestCommonAncestor(
    currentCheckpointId,
    input.checkpointId,
    checkpointMap,
  );
  const reverseCheckpoints = collectReversePathToAncestor(
    currentCheckpointId,
    ancestorId,
    checkpointMap,
  );
  const forwardCheckpoints = collectForwardPathFromAncestor(
    input.checkpointId,
    ancestorId,
    checkpointMap,
  );

  for (const checkpoint of reverseCheckpoints) {
    const result = await applyRepoCheckpointPatch({
      patch: checkpoint.reversePatch,
      projectPath: input.projectPath,
    });
    if (result.failedPaths.length > 0) {
      throw new Error(summarizePatchFailures(result.failedPaths, "Restore"));
    }
  }

  for (const checkpoint of forwardCheckpoints) {
    const result = await applyRepoCheckpointPatch({
      patch: checkpoint.forwardPatch,
      projectPath: input.projectPath,
    });
    if (result.failedPaths.length > 0) {
      throw new Error(summarizePatchFailures(result.failedPaths, "Restore"));
    }
  }

  updateThreadRepoState(input.threadId, {
    checkpointAnchorMessageId:
      input.checkpointId === latestCheckpointId
        ? null
        : target.assistantMessageId,
    checkpointCursorId: input.checkpointId,
    checkpointLatestId: latestCheckpointId,
    checkpointProjectPath: input.projectPath,
  });

  return {
    changed: reverseCheckpoints.length > 0 || forwardCheckpoints.length > 0,
    checkpointCursorId: input.checkpointId,
    checkpointLatestId: latestCheckpointId,
  };
}

export async function resetThreadRepoCheckpoint(input: {
  checkpointId: string;
  projectPath: string;
  threadId: string;
  thread: { chatEngineState?: unknown } | null;
  userMessageId: string;
}) {
  const checkpoints = await listThreadRepoCheckpoints(input.threadId);
  const checkpointMap = buildCheckpointMap(checkpoints);
  const target = checkpointMap.get(input.checkpointId);

  if (!target) {
    throw new Error("Checkpoint not found.");
  }

  const repoState = getRepoThreadState(input.thread?.chatEngineState);
  const expectedProjectPath =
    repoState?.checkpointProjectPath ?? target.effectiveProjectPath;
  if (expectedProjectPath !== input.projectPath) {
    throw new Error(
      "This checkpoint belongs to a different project path. Switch the thread back to that project before restoring it.",
    );
  }

  const currentCheckpointId =
    repoState?.checkpointCursorId ?? repoState?.checkpointLatestId ?? null;
  const latestCheckpointId =
    repoState?.checkpointLatestId ?? currentCheckpointId;

  const restoreResult = target.beforeTreeHash
    ? await restoreRepoCheckpointTree({
        projectPath: input.projectPath,
        repoRoot: target.repoRoot,
        targetTreeHash: target.beforeTreeHash,
      })
    : await applyRepoCheckpointPatch({
        patch: target.reversePatch,
        projectPath: input.projectPath,
      });

  if (restoreResult.failedPaths.length > 0) {
    throw new Error(summarizePatchFailures(restoreResult.failedPaths, "Reset"));
  }

  await setActiveMessage(input.threadId, input.userMessageId);
  updateThreadRepoState(input.threadId, {
    checkpointAnchorMessageId: input.userMessageId,
    checkpointCursorId: target.parentCheckpointId ?? null,
    checkpointLatestId: latestCheckpointId,
    checkpointProjectPath: input.projectPath,
  });

  return {
    changed: restoreResult.appliedPaths.length > 0,
    checkpointAnchorMessageId: input.userMessageId,
    checkpointCursorId: target.parentCheckpointId ?? null,
    checkpointLatestId: latestCheckpointId,
  };
}
