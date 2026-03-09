import type { PrismaClient } from "@/../generated/prisma";
import { db } from "@/server/db";

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

export function createPrismaThreadChatPersistence(
  client: PrismaClient = db,
): ChatPersistenceAdapter {
  return {
    async ensureThread({
      threadId,
      title,
      userId,
      workspaceId,
    }: EnsureThreadInput) {
      const existingThread = await client.thread.findUnique({
        where: { id: threadId },
        select: { id: true },
      });

      await client.thread.upsert({
        where: { id: threadId },
        create: {
          id: threadId,
          title,
          userId,
          workspaceId,
        },
        update: {},
      });

      return {
        created: existingThread == null,
      };
    },

    async getThreadMessages(threadId) {
      return client.threadMessage.findMany({
        where: { threadId },
        orderBy: {
          createdAt: "asc",
        },
      }) as Promise<PersistedThreadMessageRecord[]>;
    },

    async setActiveMessage({ messageId, threadId }: SetActiveMessageInput) {
      const messages = await client.threadMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
      });
      const target = messages.find((message) => message.messageId === messageId);
      if (!target) {
        return;
      }

      const targetMetadata = normalizeThreadMessageMetadata(
        target.metadata as ThreadMessageMetadata | null | undefined,
      );
      const parentMessageId = targetMetadata.parentMessageId ?? null;

      const updates = messages
        .filter((message) =>
          matchesParent(
            normalizeThreadMessageMetadata(
              message.metadata as ThreadMessageMetadata | null | undefined,
            ),
            parentMessageId,
          ),
        )
        .map((message) => {
          const metadata = normalizeThreadMessageMetadata(
            message.metadata as ThreadMessageMetadata | null | undefined,
          );

          return client.threadMessage.update({
            where: { id: message.id },
            data: {
              metadata: mergeThreadMessageMetadata(metadata, {
                isActive: message.messageId === messageId,
              }),
            },
          });
        });

      await client.$transaction(updates);
    },

    async updateThreadMessageMetadata({
      messageId,
      metadata,
      threadId,
    }: UpdateThreadMessageMetadataInput) {
      const existing = await client.threadMessage.findUnique({
        where: {
          threadId_messageId: {
            messageId,
            threadId,
          },
        },
      });

      if (!existing) {
        return;
      }

      const currentMetadata = normalizeThreadMessageMetadata(
        existing.metadata as ThreadMessageMetadata | null | undefined,
      );

      await client.threadMessage.update({
        where: { id: existing.id },
        data: {
          metadata: mergeThreadMessageMetadata(currentMetadata, metadata),
        },
      });
    },

    async upsertThreadMessage({ createdAt, message, threadId }: UpsertThreadMessageInput) {
      const serializedMessage = serializeThreadUIMessage(message);

      await client.$transaction([
        client.threadMessage.upsert({
          where: {
            threadId_messageId: {
              messageId: serializedMessage.messageId,
              threadId,
            },
          },
          create: {
            ...serializedMessage,
            ...(createdAt ? { createdAt } : {}),
            threadId,
          },
          update: serializedMessage,
        }),
        client.thread.update({
          where: { id: threadId },
          data: { updatedAt: new Date() },
        }),
      ]);
    },

    async updateThreadTitle({ threadId, title }) {
      await client.thread.update({
        where: { id: threadId },
        data: {
          title,
          updatedAt: new Date(),
        },
      });
    },
  };
}
