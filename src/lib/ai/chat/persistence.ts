import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";

import { db } from "@/server/db";
import { threadFollowUps, threadMessages, threads } from "@/server/db/schema";
import type { ThreadMode } from "@/lib/plan";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ChatEngine, ThreadVisibility } from "@/server/db/enums";
import type {
  ClaudeThreadState,
  CopilotThreadState,
  CodexThreadState,
  RepoThreadState,
  ThreadChatEngineState,
} from "@/lib/ai/chat/engines/types";
import {
  buildThreadChatEngineState,
  mergeThreadChatEngineState,
  parseThreadChatEngineState,
} from "@/lib/ai/chat/engines/types";

import {
  buildActiveThreadMessages,
  getBranchSelectionPayload,
  type PersistedThreadMessageRecord,
} from "../messages/branches";
import {
  mergeThreadMessageMetadata,
  normalizeThreadMessageMetadata,
  normalizeThreadUIMessage,
  type ThreadMessageMetadata,
  type ThreadUIMessage,
} from "../messages/types";
import { serializeThreadUIMessage } from "../messages/ui";

export type PersistedThreadFollowUpRecord = {
  createdAt: Date;
  id: string;
  modelId: string;
  parts: ThreadUIMessage["parts"];
  reasoningEffort: ReasoningEffort | null;
  status: "queued" | "processing";
  threadId: string;
  threadMode: ThreadMode;
  updatedAt: Date;
};

export type ThreadContextCompactionCheckpoint = {
  coveredThroughMessageId: string | null;
  summary: string | null;
  updatedAt: Date | null;
};

export type PersistedThreadRecord = NonNullable<
  Awaited<ReturnType<typeof loadThread>>
>;

export async function ensureThread(
  threadId: string,
  userId: string,
  workspaceId: string,
  title: string,
  mode: ThreadMode = "chat",
  engine: ChatEngine = "sentinel",
  chatEngineState?: ThreadChatEngineState | null,
) {
  const existing = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: { chatEngine: true, id: true, mode: true },
  });

  if (!existing) {
    db.insert(threads)
      .values({
        chatEngine: engine,
        ...(chatEngineState ? { chatEngineState } : {}),
        id: threadId,
        mode,
        title,
        userId,
        workspaceId,
      })
      .onConflictDoNothing({ target: threads.id })
      .run();
  }

  return { created: !existing };
}

export async function ensureVirtualThread(input: {
  chatEngineState?: ThreadChatEngineState | null;
  delegationId?: string | null;
  engine?: ChatEngine;
  mode?: ThreadMode;
  parentThreadId: string;
  title: string;
  userId: string;
  virtualKey?: string | null;
  workspaceId: string;
}) {
  const existing =
    input.virtualKey == null
      ? null
      : await db.query.threads.findFirst({
          where: and(
            eq(threads.parentThreadId, input.parentThreadId),
            eq(threads.visibility, "virtual"),
            eq(threads.userId, input.userId),
            eq(threads.workspaceId, input.workspaceId),
            eq(threads.virtualKey, input.virtualKey),
          ),
          orderBy: (thread, { desc }) => [desc(thread.updatedAt)],
          columns: { id: true },
        });

  const threadId = existing?.id ?? crypto.randomUUID();

  if (!existing) {
    db.insert(threads)
      .values({
        chatEngine: input.engine ?? "sentinel",
        ...(input.chatEngineState
          ? { chatEngineState: input.chatEngineState }
          : {}),
        id: threadId,
        mode: input.mode ?? "chat",
        parentThreadId: input.parentThreadId,
        delegationId: input.delegationId ?? null,
        title: input.title,
        userId: input.userId,
        virtualKey: input.virtualKey ?? null,
        visibility: "virtual",
        workspaceId: input.workspaceId,
      })
      .run();
  }

  return threadId;
}

export async function loadThread(threadId: string) {
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: {
      activeStreamId: true,
      archivedAt: true,
      chatEngine: true,
      chatEngineState: true,
      delegationId: true,
      id: true,
      mode: true,
      parentThreadId: true,
      sourceVirtualThreadId: true,
      status: true,
      title: true,
      userId: true,
      visibility: true,
      virtualKey: true,
      workspaceId: true,
    },
  });

  if (!thread) {
    return null;
  }

  return {
    ...thread,
    activeRunId: thread.activeStreamId,
    chatEngineState: parseThreadChatEngineState(thread.chatEngineState),
  };
}

export async function getThreadContextCompactionCheckpoint(
  threadId: string,
): Promise<ThreadContextCompactionCheckpoint> {
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: {
      contextCompactionCoveredThroughMessageId: true,
      contextCompactionSummary: true,
      contextCompactionUpdatedAt: true,
    },
  });

  return {
    coveredThroughMessageId:
      thread?.contextCompactionCoveredThroughMessageId ?? null,
    summary: thread?.contextCompactionSummary ?? null,
    updatedAt: thread?.contextCompactionUpdatedAt ?? null,
  };
}

export function updateThreadChatSettings(
  threadId: string,
  settings: {
    engine?: ChatEngine | null;
    mode?: ThreadMode | null;
    modelId?: string | null;
    reasoningEffort?: string | null;
  },
) {
  db.update(threads)
    .set({
      ...(settings.engine === undefined
        ? {}
        : { chatEngine: settings.engine ?? "sentinel" }),
      ...(settings.modelId === undefined
        ? {}
        : { chatModelId: settings.modelId ?? null }),
      ...(settings.reasoningEffort === undefined
        ? {}
        : { chatReasoningEffort: settings.reasoningEffort ?? null }),
      ...(settings.mode === undefined ? {} : { mode: settings.mode ?? "chat" }),
      updatedAt: new Date(),
    })
    .where(eq(threads.id, threadId))
    .run();
}

export function updateThreadChatEngineState(
  threadId: string,
  engineState: ThreadChatEngineState | null,
) {
  const existing = db
    .select({
      chatEngineState: threads.chatEngineState,
    })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get();
  const nextState = mergeThreadChatEngineState(
    parseThreadChatEngineState(existing?.chatEngineState),
    engineState,
  );

  db.update(threads)
    .set({
      chatEngineState: nextState,
      updatedAt: new Date(),
    })
    .where(eq(threads.id, threadId))
    .run();
}

export function updateThreadRepoState(
  threadId: string,
  state: Partial<RepoThreadState> | null,
) {
  if (state === null) {
    updateThreadChatEngineState(threadId, {
      repo: null,
    });
    return;
  }

  const existing = db
    .select({
      chatEngineState: threads.chatEngineState,
    })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get();
  const existingRepoState =
    parseThreadChatEngineState(existing?.chatEngineState)?.repo ?? null;

  updateThreadChatEngineState(threadId, {
    repo: {
      ...(existingRepoState ?? {}),
      ...state,
    } satisfies RepoThreadState,
  });
}

export function updateCodexThreadState(
  threadId: string,
  state: CodexThreadState | null,
) {
  updateThreadChatEngineState(
    threadId,
    buildThreadChatEngineState("codex", state),
  );
}

export function updateClaudeThreadState(
  threadId: string,
  state: ClaudeThreadState | null,
) {
  updateThreadChatEngineState(
    threadId,
    buildThreadChatEngineState("claude", state),
  );
}

export function updateCopilotThreadState(
  threadId: string,
  state: CopilotThreadState | null,
) {
  updateThreadChatEngineState(
    threadId,
    buildThreadChatEngineState("copilot", state),
  );
}

export async function loadThreadMessages(threadId: string) {
  const rows = await db.query.threadMessages.findMany({
    where: eq(threadMessages.threadId, threadId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return rows as unknown as PersistedThreadMessageRecord[];
}

export async function getLatestVisibleChildThreadForVirtualThread(
  virtualThreadId: string,
) {
  const child = await db.query.threads.findFirst({
    where: and(
      eq(threads.sourceVirtualThreadId, virtualThreadId),
      eq(threads.visibility, "visible"),
    ),
    orderBy: (thread, { desc }) => [desc(thread.updatedAt)],
    columns: {
      activeStreamId: true,
      archivedAt: true,
      chatEngine: true,
      chatEngineState: true,
      id: true,
      mode: true,
      parentThreadId: true,
      sourceVirtualThreadId: true,
      status: true,
      title: true,
      userId: true,
      visibility: true,
      virtualKey: true,
      workspaceId: true,
    },
  });

  if (!child) {
    return null;
  }

  return {
    ...child,
    activeRunId: child.activeStreamId,
    chatEngineState: parseThreadChatEngineState(child.chatEngineState),
  };
}

export async function listThreadFollowUps(
  threadId: string,
): Promise<PersistedThreadFollowUpRecord[]> {
  const rows = await db.query.threadFollowUps.findMany({
    where: eq(threadFollowUps.threadId, threadId),
    orderBy: (followUps, { asc }) => [asc(followUps.createdAt)],
  });

  return rows as unknown as PersistedThreadFollowUpRecord[];
}

function getJsonParts(parts: ThreadUIMessage["parts"]) {
  const serialized = serializeThreadUIMessage({
    id: "queued-message",
    metadata: {},
    parts,
    role: "user",
  });

  return serialized.parts;
}

export function enqueueThreadFollowUp(input: {
  id: string;
  modelId: string;
  parts: ThreadUIMessage["parts"];
  reasoningEffort?: ReasoningEffort | null;
  threadId: string;
  threadMode: ThreadMode;
}) {
  db.insert(threadFollowUps)
    .values({
      id: input.id,
      modelId: input.modelId,
      parts: getJsonParts(input.parts),
      reasoningEffort: input.reasoningEffort ?? null,
      threadId: input.threadId,
      threadMode: input.threadMode,
    })
    .run();

  db.update(threads)
    .set({ updatedAt: new Date() })
    .where(eq(threads.id, input.threadId))
    .run();
}

export function enqueueThreadFollowUpAtFront(input: {
  id: string;
  modelId: string;
  parts: ThreadUIMessage["parts"];
  reasoningEffort?: ReasoningEffort | null;
  threadId: string;
  threadMode: ThreadMode;
}) {
  const earliest = db
    .select({ createdAt: threadFollowUps.createdAt })
    .from(threadFollowUps)
    .where(eq(threadFollowUps.threadId, input.threadId))
    .orderBy(asc(threadFollowUps.createdAt))
    .get();

  const createdAt = earliest?.createdAt
    ? new Date(earliest.createdAt.getTime() - 1)
    : new Date();

  db.insert(threadFollowUps)
    .values({
      createdAt,
      id: input.id,
      modelId: input.modelId,
      parts: getJsonParts(input.parts),
      reasoningEffort: input.reasoningEffort ?? null,
      threadId: input.threadId,
      threadMode: input.threadMode,
    })
    .run();

  db.update(threads)
    .set({ updatedAt: new Date() })
    .where(eq(threads.id, input.threadId))
    .run();
}

export function removeThreadFollowUp(threadId: string, followUpId: string) {
  db.delete(threadFollowUps)
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.id, followUpId),
      ),
    )
    .run();
}

export function moveThreadFollowUpToFront(
  threadId: string,
  followUpId: string,
) {
  const existing = db
    .select()
    .from(threadFollowUps)
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.id, followUpId),
      ),
    )
    .get();

  if (!existing || existing.status !== "queued") {
    return;
  }

  const earliest = db
    .select({ createdAt: threadFollowUps.createdAt })
    .from(threadFollowUps)
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.status, "queued"),
        lt(threadFollowUps.createdAt, existing.createdAt),
      ),
    )
    .orderBy(asc(threadFollowUps.createdAt))
    .get();

  if (!earliest) {
    return;
  }

  db.update(threadFollowUps)
    .set({
      createdAt: new Date(earliest.createdAt.getTime() - 1),
      updatedAt: new Date(),
    })
    .where(eq(threadFollowUps.id, followUpId))
    .run();
}

export function resetProcessingThreadFollowUps(threadId: string) {
  db.update(threadFollowUps)
    .set({
      status: "queued",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.status, "processing"),
      ),
    )
    .run();
}

export function claimNextThreadFollowUp(
  threadId: string,
): PersistedThreadFollowUpRecord | null {
  let claimed: PersistedThreadFollowUpRecord | null = null;

  db.transaction((tx) => {
    const next = tx
      .select()
      .from(threadFollowUps)
      .where(
        and(
          eq(threadFollowUps.threadId, threadId),
          eq(threadFollowUps.status, "queued"),
        ),
      )
      .orderBy(asc(threadFollowUps.createdAt))
      .get();

    if (!next) {
      return;
    }

    tx.update(threadFollowUps)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(threadFollowUps.id, next.id))
      .run();

    claimed = {
      ...(next as unknown as PersistedThreadFollowUpRecord),
      status: "processing",
    };
  });

  return claimed;
}

export function requeueThreadFollowUp(threadId: string, followUpId: string) {
  db.update(threadFollowUps)
    .set({
      status: "queued",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.id, followUpId),
      ),
    )
    .run();
}

export function deleteThreadFollowUp(threadId: string, followUpId: string) {
  db.delete(threadFollowUps)
    .where(
      and(
        eq(threadFollowUps.threadId, threadId),
        eq(threadFollowUps.id, followUpId),
      ),
    )
    .run();
}

export async function getLatestAssistantMessageId(threadId: string) {
  const transcript = buildActiveThreadMessages(
    await loadThreadMessages(threadId),
  );
  return (
    [...transcript].reverse().find((message) => message.role === "assistant")
      ?.id ?? null
  );
}

export function upsertMessage(
  threadId: string,
  message: ThreadUIMessage,
  createdAt?: Date,
) {
  let storedMessage = normalizeThreadUIMessage(message);

  db.transaction((tx) => {
    const existing = tx
      .select({
        createdAt: threadMessages.createdAt,
        id: threadMessages.id,
        metadata: threadMessages.metadata,
      })
      .from(threadMessages)
      .where(
        and(
          eq(threadMessages.threadId, threadId),
          eq(threadMessages.messageId, storedMessage.id),
        ),
      )
      .get();

    const existingMetadata = normalizeThreadMessageMetadata(
      existing?.metadata as ThreadMessageMetadata | null | undefined,
    );
    const nextRevision =
      Math.max(
        existingMetadata.revision ?? 0,
        storedMessage.metadata?.revision ?? 0,
      ) + 1;

    storedMessage = {
      ...storedMessage,
      metadata: mergeThreadMessageMetadata(existingMetadata, {
        ...storedMessage.metadata,
        revision: nextRevision,
      }),
    };

    const serialized = serializeThreadUIMessage(storedMessage);

    if (existing) {
      tx.update(threadMessages)
        .set(serialized)
        .where(eq(threadMessages.id, existing.id))
        .run();
    } else {
      tx.insert(threadMessages)
        .values({
          ...serialized,
          ...(createdAt ? { createdAt } : {}),
          threadId,
        })
        .run();
    }

    tx.update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, threadId))
      .run();
  });

  return storedMessage;
}

export function replaceThreadMessages(
  threadId: string,
  messages: ThreadUIMessage[],
) {
  db.transaction((tx) => {
    tx.delete(threadMessages)
      .where(eq(threadMessages.threadId, threadId))
      .run();

    for (const message of messages) {
      tx.insert(threadMessages)
        .values({
          ...serializeThreadUIMessage(message),
          threadId,
        })
        .run();
    }

    tx.update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, threadId))
      .run();
  });
}

export async function setActiveMessage(threadId: string, messageId: string) {
  const messages = await db.query.threadMessages.findMany({
    where: eq(threadMessages.threadId, threadId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const selection = getBranchSelectionPayload(messages as any[], messageId);
  if (!selection) return;

  db.transaction((tx) => {
    for (const sibling of selection.siblings) {
      const meta = normalizeThreadMessageMetadata(
        sibling.metadata as ThreadMessageMetadata | null | undefined,
      );
      tx.update(threadMessages)
        .set({
          metadata: mergeThreadMessageMetadata(meta, {
            isActive: sibling.message.id === messageId,
            revision: (meta.revision ?? 0) + 1,
          }),
        })
        .where(eq(threadMessages.id, sibling.dbId))
        .run();
    }
  });
}

export async function updateMessageMetadata(
  threadId: string,
  messageId: string,
  metadata: ThreadMessageMetadata,
) {
  const existing = await db.query.threadMessages.findFirst({
    where: and(
      eq(threadMessages.threadId, threadId),
      eq(threadMessages.messageId, messageId),
    ),
  });

  if (!existing) return;

  const current = normalizeThreadMessageMetadata(
    existing.metadata as ThreadMessageMetadata | null | undefined,
  );
  const merged = mergeThreadMessageMetadata(current, {
    ...metadata,
    revision: Math.max(current.revision ?? 0, metadata.revision ?? 0) + 1,
  });

  db.update(threadMessages)
    .set({ metadata: merged })
    .where(eq(threadMessages.id, existing.id))
    .run();

  return merged;
}

export function updateThreadTitle(threadId: string, title: string) {
  db.update(threads)
    .set({ title, updatedAt: new Date() })
    .where(eq(threads.id, threadId))
    .run();
}

export function updateThreadContextCompactionCheckpoint(
  threadId: string,
  checkpoint: {
    coveredThroughMessageId: string | null;
    summary: string | null;
  },
) {
  db.update(threads)
    .set({
      contextCompactionCoveredThroughMessageId:
        checkpoint.coveredThroughMessageId,
      contextCompactionSummary: checkpoint.summary,
      contextCompactionUpdatedAt: checkpoint.summary ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(threads.id, threadId))
    .run();
}

export function setActiveStream(threadId: string, streamId: string) {
  db.update(threads)
    .set({ activeStreamId: streamId })
    .where(eq(threads.id, threadId))
    .run();
}

export function clearActiveStream(threadId: string) {
  db.update(threads)
    .set({ activeStreamId: null })
    .where(eq(threads.id, threadId))
    .run();
}

export function setThreadStatus(
  threadId: string,
  status: "idle" | "streaming" | "awaiting_approval",
) {
  db.update(threads).set({ status }).where(eq(threads.id, threadId)).run();
}

export function updateThreadVisibility(
  threadId: string,
  visibility: ThreadVisibility,
) {
  db.update(threads)
    .set({ updatedAt: new Date(), visibility })
    .where(eq(threads.id, threadId))
    .run();
}

export async function syncThreadFromThread(input: {
  sourceThreadId: string;
  targetThreadId: string;
}) {
  const [sourceThread, sourceMessages] = await Promise.all([
    db.query.threads.findFirst({
      where: eq(threads.id, input.sourceThreadId),
      columns: {
        activeStreamId: true,
        chatEngine: true,
        chatEngineState: true,
        chatModelId: true,
        chatReasoningEffort: true,
        mode: true,
        status: true,
        summary: true,
        title: true,
      },
    }),
    db.query.threadMessages.findMany({
      where: eq(threadMessages.threadId, input.sourceThreadId),
      orderBy: (message, { asc }) => [asc(message.createdAt)],
    }),
  ]);

  if (!sourceThread) {
    return false;
  }

  db.transaction((tx) => {
    tx.update(threads)
      .set({
        activeStreamId: sourceThread.activeStreamId,
        chatEngine: sourceThread.chatEngine,
        chatEngineState: sourceThread.chatEngineState,
        chatModelId: sourceThread.chatModelId,
        chatReasoningEffort: sourceThread.chatReasoningEffort,
        mode: sourceThread.mode,
        status: sourceThread.status,
        summary: sourceThread.summary,
        title: sourceThread.title,
        updatedAt: new Date(),
      })
      .where(eq(threads.id, input.targetThreadId))
      .run();

    tx.delete(threadMessages)
      .where(eq(threadMessages.threadId, input.targetThreadId))
      .run();

    for (const message of sourceMessages) {
      tx.insert(threadMessages)
        .values({
          createdAt: message.createdAt,
          messageId: message.messageId,
          metadata: message.metadata,
          parts: message.parts,
          role: message.role,
          threadId: input.targetThreadId,
          updatedAt: message.updatedAt,
        })
        .run();
    }
  });

  return true;
}

export async function promoteVirtualThreadToVisibleChild(input: {
  parentThreadId: string;
  title: string;
  userId: string;
  virtualThreadId: string;
  workspaceId: string;
}) {
  const virtualThread = await loadThread(input.virtualThreadId);
  if (!virtualThread) {
    throw new Error("Virtual thread not found.");
  }

  const existingChild = await getLatestVisibleChildThreadForVirtualThread(
    input.virtualThreadId,
  );
  const childThreadId = existingChild?.id ?? crypto.randomUUID();

  if (!existingChild) {
    db.insert(threads)
      .values({
        chatEngine: virtualThread.chatEngine,
        chatEngineState: virtualThread.chatEngineState,
        id: childThreadId,
        mode: virtualThread.mode,
        parentThreadId: input.parentThreadId,
        sourceVirtualThreadId: input.virtualThreadId,
        title: input.title,
        userId: input.userId,
        visibility: "visible",
        workspaceId: input.workspaceId,
      })
      .run();
  } else {
    db.update(threads)
      .set({
        chatEngine: virtualThread.chatEngine,
        chatEngineState: virtualThread.chatEngineState,
        mode: virtualThread.mode,
        parentThreadId: input.parentThreadId,
        title: input.title,
        updatedAt: new Date(),
      })
      .where(eq(threads.id, childThreadId))
      .run();
  }

  await syncThreadFromThread({
    sourceThreadId: input.virtualThreadId,
    targetThreadId: childThreadId,
  });

  db.update(threads)
    .set({
      title: input.title,
      updatedAt: new Date(),
    })
    .where(eq(threads.id, childThreadId))
    .run();

  return childThreadId;
}
