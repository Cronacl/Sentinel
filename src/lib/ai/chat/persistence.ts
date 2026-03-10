import { and, eq } from "drizzle-orm";

import { db as defaultDb, type Database } from "@/server/db";
import { threadMessages, threads } from "@/server/db/schema";

import type { PersistedThreadMessageRecord } from "../thread-branches";
import {
  mergeThreadMessageMetadata,
  normalizeThreadMessageMetadata,
  type ThreadMessageMetadata,
} from "../thread-message-types";
import { serializeThreadUIMessage } from "../ui-messages";

import type {
  ChatPersistenceAdapter,
  EnsureThreadInput,
  SetActiveMessageInput,
  UpdateThreadMessageMetadataInput,
  UpsertThreadMessageInput,
} from "./types";

function matchesParent(
  metadata: ThreadMessageMetadata | null | undefined,
  parentMessageId: string | null,
) {
  return (metadata?.parentMessageId ?? null) === parentMessageId;
}

export function createDrizzleThreadChatPersistence(
  client: Database = defaultDb,
): ChatPersistenceAdapter {
  return {
    async ensureThread({
      threadId,
      title,
      userId,
      workspaceId,
    }: EnsureThreadInput) {
      const existingThread = await client.query.threads.findFirst({
        where: eq(threads.id, threadId),
        columns: { id: true },
      });

      if (!existingThread) {
        client
          .insert(threads)
          .values({ id: threadId, title, userId, workspaceId })
          .onConflictDoNothing({ target: threads.id })
          .run();
      }

      return {
        created: existingThread == null,
      };
    },

    async getThreadMessages(threadId) {
      const rows = await client.query.threadMessages.findMany({
        where: eq(threadMessages.threadId, threadId),
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });
      return rows as unknown as PersistedThreadMessageRecord[];
    },

    async setActiveMessage({ messageId, threadId }: SetActiveMessageInput) {
      const messages = await client.query.threadMessages.findMany({
        where: eq(threadMessages.threadId, threadId),
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      const target = messages.find((msg) => msg.messageId === messageId);
      if (!target) {
        return;
      }

      const targetMetadata = normalizeThreadMessageMetadata(
        target.metadata as ThreadMessageMetadata | null | undefined,
      );
      const parentMessageId = targetMetadata.parentMessageId ?? null;

      const toUpdate = messages.filter((msg) =>
        matchesParent(
          normalizeThreadMessageMetadata(
            msg.metadata as ThreadMessageMetadata | null | undefined,
          ),
          parentMessageId,
        ),
      );

      client.transaction((tx) => {
        for (const msg of toUpdate) {
          const metadata = normalizeThreadMessageMetadata(
            msg.metadata as ThreadMessageMetadata | null | undefined,
          );
          tx.update(threadMessages)
            .set({
              metadata: mergeThreadMessageMetadata(metadata, {
                isActive: msg.messageId === messageId,
              }),
            })
            .where(eq(threadMessages.id, msg.id))
            .run();
        }
      });
    },

    async updateThreadMessageMetadata({
      messageId,
      metadata,
      threadId,
    }: UpdateThreadMessageMetadataInput) {
      const existing = await client.query.threadMessages.findFirst({
        where: and(
          eq(threadMessages.threadId, threadId),
          eq(threadMessages.messageId, messageId),
        ),
      });

      if (!existing) {
        return;
      }

      const currentMetadata = normalizeThreadMessageMetadata(
        existing.metadata as ThreadMessageMetadata | null | undefined,
      );

      client
        .update(threadMessages)
        .set({
          metadata: mergeThreadMessageMetadata(currentMetadata, metadata),
        })
        .where(eq(threadMessages.id, existing.id))
        .run();
    },

    async upsertThreadMessage({
      createdAt,
      message,
      threadId,
    }: UpsertThreadMessageInput) {
      const serializedMessage = serializeThreadUIMessage(message);

      client.transaction((tx) => {
        const existing = tx
          .select({ id: threadMessages.id })
          .from(threadMessages)
          .where(
            and(
              eq(threadMessages.threadId, threadId),
              eq(threadMessages.messageId, serializedMessage.messageId),
            ),
          )
          .get();

        if (existing) {
          tx.update(threadMessages)
            .set(serializedMessage)
            .where(eq(threadMessages.id, existing.id))
            .run();
        } else {
          tx.insert(threadMessages)
            .values({
              ...serializedMessage,
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
    },

    async updateThreadTitle({ threadId, title }) {
      client
        .update(threads)
        .set({
          title,
          updatedAt: new Date(),
        })
        .where(eq(threads.id, threadId))
        .run();
    },
  };
}
