import "server-only";

import { eq } from "drizzle-orm";

import {
  mapThreadMessagesToUIMessages,
  mapThreadMessagesToUIMessagesBestEffort,
} from "@/lib/ai/messages/ui";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { createLogger } from "@/lib/logger";
import { db } from "@/server/db";
import { threadMessages, threads } from "@/server/db/schema";

import { listThreadFollowUps } from "./persistence";
import type {
  QueuedFollowUpSummary,
  ThreadSessionSnapshot,
  ThreadStreamEvent,
} from "./session-types";
import { buildCodexBootstrapTitle } from "./runtime/codex-helpers";
import {
  buildFirstUserMessageTitle,
  getFirstUserText,
} from "./runtime/transcript";

const log = createLogger("ThreadSession");

function summarizeQueuedFollowUp(
  followUp: Awaited<ReturnType<typeof listThreadFollowUps>>[number],
): QueuedFollowUpSummary {
  const text =
    followUp.parts.find(
      (
        part,
      ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
        part.type === "text" && typeof part.text === "string",
    )?.text ?? "";
  const attachmentCount = followUp.parts.filter(
    (part) => part.type === "file",
  ).length;

  return {
    attachmentCount,
    createdAt: followUp.createdAt,
    hasFiles: attachmentCount > 0,
    id: followUp.id,
    modelId: followUp.modelId,
    reasoningEffort: followUp.reasoningEffort,
    text: text.trim(),
    threadMode: followUp.threadMode,
  };
}

export async function loadThreadSessionSnapshot(
  threadId: string,
): Promise<ThreadSessionSnapshot | null> {
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    columns: {
      activeStreamId: true,
      chatEngine: true,
      id: true,
      mode: true,
      title: true,
      status: true,
    },
  });

  if (!thread) {
    return null;
  }

  const messages = await db.query.threadMessages.findMany({
    where: eq(threadMessages.threadId, thread.id),
    orderBy: (records, { asc }) => [asc(records.createdAt)],
  });
  const queuedFollowUps = await listThreadFollowUps(thread.id);
  const uiMessages = await mapThreadMessagesToUIMessages(
    messages as any[],
  ).catch((error) => {
    log.error("thread_snapshot_validation_failed", {
      error,
      messageCount: messages.length,
      threadId: thread.id,
    });
    return mapThreadMessagesToUIMessagesBestEffort(messages as any[]);
  });
  const firstUserText = getFirstUserText(uiMessages);
  const rawFirstUserTitle = buildFirstUserMessageTitle(firstUserText);
  const bootstrapTitle =
    thread.chatEngine === "codex"
      ? buildCodexBootstrapTitle(firstUserText)
      : rawFirstUserTitle;
  const shouldBootstrapTitle =
    thread.title === "New thread" && bootstrapTitle !== "New thread";
  const shouldNormalizeCodexTitle =
    thread.chatEngine === "codex" &&
    thread.title === rawFirstUserTitle &&
    bootstrapTitle !== thread.title;
  const nextThreadTitle =
    shouldBootstrapTitle || shouldNormalizeCodexTitle
      ? bootstrapTitle
      : thread.title;

  if (shouldBootstrapTitle || shouldNormalizeCodexTitle) {
    db.update(threads)
      .set({ title: nextThreadTitle, updatedAt: new Date() })
      .where(eq(threads.id, thread.id))
      .run();
  }

  return {
    activeRunId: thread.activeStreamId,
    chatEngine: thread.chatEngine,
    messages: uiMessages,
    mode: thread.mode,
    queuedFollowUps: queuedFollowUps
      .filter((followUp) => followUp.status === "queued")
      .map(summarizeQueuedFollowUp),
    threadId: thread.id,
    threadTitle: nextThreadTitle,
    threadStatus: thread.status,
  };
}

export function serializeThreadStreamEvent(event: ThreadStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export { summarizeQueuedFollowUp };
