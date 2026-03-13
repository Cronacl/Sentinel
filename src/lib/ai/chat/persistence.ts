import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { threadMessages, threads } from "@/server/db/schema";
import type { ThreadMode } from "@/lib/plan";

import type { PersistedThreadMessageRecord } from "../messages/branches";
import {
  mergeThreadMessageMetadata,
  normalizeThreadMessageMetadata,
  type ThreadMessageMetadata,
  type ThreadUIMessage,
} from "../messages/types";
import { serializeThreadUIMessage } from "../messages/ui";

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
  return db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: {
      archivedAt: true,
      id: true,
      mode: true,
    },
  });
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

export function upsertMessage(
  threadId: string,
  message: ThreadUIMessage,
  createdAt?: Date,
) {
  const serialized = serializeThreadUIMessage(message);

  db.transaction((tx) => {
    const existing = tx
      .select({ id: threadMessages.id })
      .from(threadMessages)
      .where(
        and(
          eq(threadMessages.threadId, threadId),
          eq(threadMessages.messageId, serialized.messageId),
        ),
      )
      .get();

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

  db.update(threadMessages)
    .set({ metadata: mergeThreadMessageMetadata(current, metadata) })
    .where(eq(threadMessages.id, existing.id))
    .run();
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
