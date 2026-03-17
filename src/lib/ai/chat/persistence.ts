import { and, asc, eq, lt } from "drizzle-orm";

import { db } from "@/server/db";
import { threadFollowUps, threadMessages, threads } from "@/server/db/schema";
import type { ThreadMode } from "@/lib/plan";
import type { ReasoningEffort } from "@/lib/ai/providers/models";

import {
  buildActiveThreadMessages,
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

export async function ensureThread(
  threadId: string,
  userId: string,
  workspaceId: string,
  title: string,
  mode: ThreadMode = "chat",
) {
  const existing = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: { id: true, mode: true },
  });

  if (!existing) {
    db.insert(threads)
      .values({ id: threadId, mode, title, userId, workspaceId })
      .onConflictDoNothing({ target: threads.id })
      .run();
  }

  return { created: !existing };
}

export async function loadThread(threadId: string) {
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: {
      activeStreamId: true,
      archivedAt: true,
      id: true,
      mode: true,
      status: true,
      userId: true,
      workspaceId: true,
    },
  });

  if (!thread) {
    return null;
  }

  return {
    ...thread,
    activeRunId: thread.activeStreamId,
  };
}

export function updateThreadChatSettings(
  threadId: string,
  settings: {
    mode?: ThreadMode | null;
    modelId?: string | null;
    reasoningEffort?: string | null;
  },
) {
  db.update(threads)
    .set({
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

export async function loadThreadMessages(threadId: string) {
  const rows = await db.query.threadMessages.findMany({
    where: eq(threadMessages.threadId, threadId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return rows as unknown as PersistedThreadMessageRecord[];
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

export function moveThreadFollowUpToFront(threadId: string, followUpId: string) {
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
  const transcript = buildActiveThreadMessages(await loadThreadMessages(threadId));
  return [...transcript].reverse().find((message) => message.role === "assistant")
    ?.id ?? null;
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
        .values({ ...serialized, ...(createdAt ? { createdAt } : {}), threadId })
        .run();
    }

    tx.update(threads)
      .set({ updatedAt: new Date() })
      .where(eq(threads.id, threadId))
      .run();
  });

  return storedMessage;
}

export async function setActiveMessage(threadId: string, messageId: string) {
  const messages = await db.query.threadMessages.findMany({
    where: eq(threadMessages.threadId, threadId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const target = messages.find((m) => m.messageId === messageId);
  if (!target) return;

  const targetMeta = normalizeThreadMessageMetadata(
    target.metadata as ThreadMessageMetadata | null | undefined,
  );
  const parentId = targetMeta.parentMessageId ?? null;

  const siblings = messages.filter((m) => {
    const meta = normalizeThreadMessageMetadata(
      m.metadata as ThreadMessageMetadata | null | undefined,
    );
    return (meta.parentMessageId ?? null) === parentId;
  });

  db.transaction((tx) => {
    for (const msg of siblings) {
      const meta = normalizeThreadMessageMetadata(
        msg.metadata as ThreadMessageMetadata | null | undefined,
      );
      tx.update(threadMessages)
        .set({
          metadata: mergeThreadMessageMetadata(meta, {
            isActive: msg.messageId === messageId,
            revision: (meta.revision ?? 0) + 1,
          }),
        })
        .where(eq(threadMessages.id, msg.id))
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
  db.update(threads)
    .set({ status })
    .where(eq(threads.id, threadId))
    .run();
}
