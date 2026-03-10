import {
  convertToModelMessages,
  generateId,
  streamText,
} from "ai";

import { streamContext } from "@/lib/streams";

import {
  buildActiveThreadMessages,
  getLatestVisibleMessageId,
  getMessageRecordById,
  type PersistedThreadMessageRecord,
} from "../thread-branches";
import {
  mergeThreadMessageMetadata,
  normalizeThreadUIMessage,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
} from "../thread-message-types";
import { validateThreadUIMessage } from "../ui-messages";

import { createAttachmentDownloadHandler } from "./attachments";
import { InvalidThreadChatRequestError } from "./errors";
import { resolveThreadChatModel } from "./model";
import * as persist from "./persistence";
import { createReasoningMetadataTracker } from "./reasoning-metadata";
import { generateThreadTitle } from "./title";
import type { ThreadChatRequest, ThreadChatTrigger } from "./types";

// ── Request parsing ─────────────────────────────────────────────

const VALID_TRIGGERS = new Set<ThreadChatTrigger>([
  "submit-user-message",
  "retry-assistant-message",
  "regenerate-assistant-message",
  "edit-user-message",
  "stop-stream",
]);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function parseRequest(
  raw: unknown,
  userId: string,
): Promise<ThreadChatRequest> {
  if (!raw || typeof raw !== "object") throw new InvalidThreadChatRequestError();
  const input = raw as Record<string, unknown>;

  const threadId = str(input.id);
  const workspaceId = str(input.workspaceId);
  if (!threadId || !workspaceId) throw new InvalidThreadChatRequestError();

  const trigger: ThreadChatTrigger = VALID_TRIGGERS.has(
    input.trigger as ThreadChatTrigger,
  )
    ? (input.trigger as ThreadChatTrigger)
    : "submit-user-message";

  const messageId = str(input.messageId);
  const modelId = str(input.modelId);
  const reasoningEffort = str(input.reasoningEffort) as
    | ThreadChatRequest["reasoningEffort"]
    | undefined;

  const needsMessage =
    trigger === "submit-user-message" || trigger === "edit-user-message";
  const needsMessageId = trigger !== "submit-user-message";

  if (needsMessageId && !messageId) throw new InvalidThreadChatRequestError();

  let message: ThreadUIMessage | undefined;
  if (needsMessage && input.message && typeof input.message === "object") {
    message = await validateThreadUIMessage(
      normalizeThreadUIMessage(input.message as Parameters<typeof normalizeThreadUIMessage>[0]),
    );
  }
  if (needsMessage && !message) throw new InvalidThreadChatRequestError();

  return {
    ...(message ? { message } : {}),
    ...(messageId ? { messageId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    threadId,
    trigger,
    userId,
    workspaceId,
  };
}

// ── Transcript helpers ──────────────────────────────────────────

function getFirstUserText(messages: ThreadUIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  return (
    first?.parts.find(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
    )?.text ?? null
  );
}

function buildModelTranscript(
  request: ThreadChatRequest,
  transcript: ThreadUIMessage[],
  allRecords: PersistedThreadMessageRecord[],
): ThreadUIMessage[] {
  switch (request.trigger) {
    case "submit-user-message":
      return request.message ? [...transcript, request.message] : transcript;

    case "edit-user-message": {
      const idx = transcript.findIndex((m) => m.id === request.messageId);
      if (idx === -1 || !request.message) return transcript;
      return [
        ...transcript.slice(0, idx),
        {
          ...request.message,
          metadata: mergeThreadMessageMetadata(request.message.metadata, {
            branchId: request.message.id,
            editedFromMessageId: request.messageId,
            isActive: true,
            parentMessageId:
              transcript[idx - 1]?.id ??
              getMessageRecordById(allRecords, request.messageId ?? "")
                ?.parentMessageId ??
              null,
            status: "completed",
          }),
        },
      ];
    }

    case "retry-assistant-message":
    case "regenerate-assistant-message": {
      const idx = transcript.findIndex((m) => m.id === request.messageId);
      if (idx === -1) return transcript;
      return transcript.slice(
        0,
        transcript[idx]?.role === "assistant" ? idx : idx + 1,
      );
    }

    default:
      return transcript;
  }
}

function getParentMessageId(
  request: ThreadChatRequest,
  allRecords: PersistedThreadMessageRecord[],
): string | null {
  switch (request.trigger) {
    case "submit-user-message":
      return (
        request.message?.id ?? getLatestVisibleMessageId(allRecords)
      );
    case "edit-user-message":
      return request.message?.id ?? null;
    case "retry-assistant-message":
    case "regenerate-assistant-message":
      return (
        getMessageRecordById(allRecords, request.messageId ?? "")
          ?.parentMessageId ?? null
      );
    default:
      return null;
  }
}

// ── Main handler ────────────────────────────────────────────────

export async function runThreadChat(rawInput: unknown, userId: string) {
  const request = await parseRequest(rawInput, userId);

  // ── Stop-stream ───────────────────────────────────────────────
  if (request.trigger === "stop-stream") {
    if (request.messageId) {
      await persist.updateMessageMetadata(
        request.threadId,
        request.messageId,
        { errorMessage: "Generation stopped.", status: "cancelled" },
      );
    }
    persist.clearActiveStream(request.threadId);
    return new Response(null, { status: 204 });
  }

  // ── Load conversation state ───────────────────────────────────
  const allRecords = await persist.loadThreadMessages(request.threadId);
  const transcript = buildActiveThreadMessages(allRecords);
  const isNewThread = allRecords.length === 0;
  const targetMessage = request.messageId
    ? allRecords.find((m) => m.messageId === request.messageId)
    : undefined;

  // ── Ensure thread exists ──────────────────────────────────────
  const baseMessages =
    transcript.length > 0
      ? transcript
      : request.message
        ? [request.message]
        : [];
  const fallbackTitle =
    getFirstUserText(baseMessages)?.slice(0, 100) ?? "New thread";
  await persist.ensureThread(
    request.threadId,
    request.userId,
    request.workspaceId,
    fallbackTitle,
  );

  // ── Persist user message (submit / edit) ──────────────────────
  if (
    request.message &&
    (request.trigger === "submit-user-message" ||
      request.trigger === "edit-user-message")
  ) {
    const parentMessageId =
      request.trigger === "submit-user-message"
        ? (transcript.at(-1)?.id ?? targetMessage?.messageId ?? null)
        : (transcript.find((m) => m.id === request.messageId)?.metadata
            ?.parentMessageId ?? null);

    const userMsg: ThreadUIMessage = {
      ...request.message,
      metadata: mergeThreadMessageMetadata(request.message.metadata, {
        branchId: request.message.id,
        isActive: true,
        parentMessageId,
        status: "completed",
        ...(request.trigger === "edit-user-message" && request.messageId
          ? { editedFromMessageId: request.messageId }
          : {}),
      }),
    };

    persist.upsertMessage(request.threadId, userMsg);
    await persist.setActiveMessage(request.threadId, userMsg.id);
  }

  persist.clearActiveStream(request.threadId);

  // ── Resolve model ─────────────────────────────────────────────
  const resolvedModel = await resolveThreadChatModel(request, targetMessage);

  // ── Placeholder assistant message ─────────────────────────────
  const assistantId = crypto.randomUUID();
  const parentId = getParentMessageId(request, allRecords);
  const branchId =
    request.trigger === "edit-user-message"
      ? request.message?.id
      : (parentId ?? assistantId);

  const placeholder: ThreadUIMessage = {
    id: assistantId,
    role: "assistant",
    parts: [{ text: " ", type: "text" }],
    metadata: {
      branchId,
      isActive: true,
      model: {
        providerId: resolvedModel.providerId,
        requestedModelId: resolvedModel.requestedModelId,
      },
      parentMessageId: parentId,
      status: "pending",
    },
  };

  persist.upsertMessage(request.threadId, placeholder);
  await persist.setActiveMessage(request.threadId, assistantId);

  // ── Build model transcript ────────────────────────────────────
  const modelTranscript = buildModelTranscript(
    request,
    transcript,
    allRecords,
  );

  // ── Reasoning metadata tracker ────────────────────────────────
  const tracker = createReasoningMetadataTracker({
    clock: { now: () => Date.now() },
    providerId: resolvedModel.providerId,
    requestedModelId: resolvedModel.requestedModelId,
  });

  // ── Stream ────────────────────────────────────────────────────
  let streamErrorMessage: string | undefined;

  const result = streamText({
    model: resolvedModel.languageModel as Parameters<typeof streamText>[0]["model"],
    experimental_download: createAttachmentDownloadHandler(),
    messages: await convertToModelMessages(modelTranscript),
    onError: ({ error }) => {
      streamErrorMessage =
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown error");
    },
    ...(resolvedModel.providerOptions
      ? { providerOptions: resolvedModel.providerOptions }
      : {}),
  });

  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: modelTranscript,
    generateMessageId: () => assistantId,
    messageMetadata: ({ part }) => tracker.getMessageMetadata(part),
    sendReasoning: true,
    sendSources: true,

    onFinish: async ({ responseMessage }) => {
      const finalized = tracker.finalize(
        [...modelTranscript, responseMessage as ThreadUIMessage],
        responseMessage as ThreadUIMessage,
      );
      const [finalAssistant] = normalizeThreadUIMessages(finalized).slice(-1);
      const merged = finalAssistant ?? placeholder;

      const status = streamErrorMessage ? "error" : "completed";

      persist.upsertMessage(request.threadId, {
        ...merged,
        id: assistantId,
        metadata: mergeThreadMessageMetadata(merged.metadata, {
          ...(streamErrorMessage
            ? { errorMessage: streamErrorMessage }
            : {}),
          finishReason: merged.metadata?.finishReason,
          isActive: true,
          status,
        }),
      });

      persist.clearActiveStream(request.threadId);

      if (isNewThread) {
        const text = getFirstUserText(modelTranscript);
        if (text?.trim()) {
          const title = await generateThreadTitle({
            firstUserText: text,
            model: resolvedModel,
          }).catch(() => null);
          if (title) persist.updateThreadTitle(request.threadId, title);
        }
      }
    },

    async consumeSseStream({ stream }) {
      const streamId = generateId();
      await streamContext.createNewResumableStream(streamId, () => stream);
      persist.setActiveStream(request.threadId, streamId);
    },
  });
}
