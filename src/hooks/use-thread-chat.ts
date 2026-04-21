"use client";

import type { FileUIPart } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type {
  ThreadChatBootstrapResponse,
  QueuedFollowUpSummary,
  ThreadSessionSnapshot,
  ThreadStreamEvent,
} from "@/lib/ai/chat/session-types";
import type { RepoThreadState } from "@/lib/ai/chat/engines/types";
import type { ThreadToolApprovalResponse } from "@/lib/ai/chat/types";
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import type { ComposerContext } from "@/lib/composer-context/types";
import {
  getThreadMessageSyncToken,
  getThreadMessageRevision,
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  type ThreadMessageMetadata,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";
import { getErrorMessage } from "@/lib/errors";
import type { ChatEngine, ThreadStatus } from "@/server/db/enums";

type UseThreadChatOptions = {
  initialActiveRunId?: string | null;
  initialChatEngine?: ChatEngine;
  initialMessages?: ThreadUIMessage[];
  initialQueuedFollowUps?: QueuedFollowUpSummary[];
  initialThreadStatus?: ThreadStatus;
  initialThreadTitle?: string;
  onError?: (error: Error) => void;
  onSnapshot?: (snapshot: ThreadSessionSnapshot) => void;
  threadId: string;
  workspaceId: string;
};

type SendThreadMessageInput = {
  composerContext?: ComposerContext;
  draftRepoState?: Partial<RepoThreadState>;
  engine: ChatEngine;
  files?: FileUIPart[];
  modelId: string;
  openCode?: {
    agent?: string | null;
    variant?: string | null;
  };
  reasoningEffort?: ReasoningEffort | null;
  text: string;
  threadMode?: ThreadMode;
};

type EditThreadMessageInput = SendThreadMessageInput & {
  targetMessageId: string;
};

type AnswerPlanQuestionsInput = {
  answers: ThreadPlanAnswer[];
  assistantMessageId: string;
  questionSetId: string;
};

type ToolApprovalResponseInput = ThreadToolApprovalResponse;

type ThreadConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
  | "idle";

type ClientTimingPhase =
  | "first_stream_event"
  | "post_complete"
  | "send_start"
  | "snapshot_hydrated"
  | "sse_connect_started";

export class ThreadActionError extends Error {
  committed: boolean;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      committed?: boolean;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ThreadActionError";
    this.committed = options?.committed ?? false;
  }
}

export function isCommittedThreadActionError(
  error: unknown,
): error is ThreadActionError {
  return error instanceof ThreadActionError && error.committed;
}

type ThreadSessionState = {
  activeRunId: string | null;
  chatEngine: ChatEngine;
  composerState: {
    pendingActionCount: number;
  };
  connectionState: ThreadConnectionState;
  errorMessage: string | null;
  lastAppliedRevision: number;
  lastSyncedAt: number | null;
  messages: ThreadUIMessage[];
  optimisticQueuedFollowUpIds?: string[];
  queuedFollowUps: QueuedFollowUpSummary[];
  threadId: string;
  threadTitle: string;
  threadStatus: ThreadStatus;
};

type SessionStore = {
  addSnapshotListener(
    listener: (snapshot: ThreadSessionSnapshot) => void,
  ): () => void;
  applyLocalMessages(messages: ThreadUIMessage[]): void;
  replaceLocalQueuedFollowUps(queuedFollowUps: QueuedFollowUpSummary[]): void;
  applyLocalQueuedFollowUp(
    followUp: QueuedFollowUpSummary,
    position: "front" | "tail",
  ): void;
  beginAction(): void;
  disconnect(): void;
  endAction(): void;
  ensureActive(): void;
  getState(): ThreadSessionState;
  hydrate(snapshot: ThreadSessionSnapshot): void;
  markClientTiming(phase: ClientTimingPhase): void;
  removeLocalMessage(messageId: string): void;
  removeLocalQueuedFollowUp(followUpId: string): void;
  refreshSnapshot(options?: { allowMissing?: boolean }): Promise<void>;
  setRequestError(errorMessage: string): void;
  setConnectionState(
    connectionState: ThreadConnectionState,
    errorMessage?: string | null,
  ): void;
  subscribe(listener: () => void): () => void;
};

const sessionStores = new Map<string, SessionStore>();

export function peekThreadSessionSnapshot(
  threadId: string,
): ThreadSessionSnapshot | null {
  const store = sessionStores.get(threadId);
  if (!store) {
    return null;
  }

  const state = store.getState();
  return {
    activeRunId: state.activeRunId,
    chatEngine: state.chatEngine,
    messages: state.messages,
    queuedFollowUps: state.queuedFollowUps,
    threadId: state.threadId,
    threadTitle: state.threadTitle,
    threadStatus: state.threadStatus,
  };
}

export function hasActiveThreadRun(
  activeRunId: string | null | undefined,
  threadStatus: ThreadStatus,
) {
  return Boolean(
    activeRunId &&
    (threadStatus === "streaming" || threadStatus === "awaiting_approval"),
  );
}

function getClientTimingNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function formatClientTimingLog(
  phase: ClientTimingPhase,
  elapsedMs: number,
  threadId: string,
) {
  return `[ThreadChatClient] ${JSON.stringify({
    elapsedMs: Math.round(elapsedMs),
    phase,
    threadId,
  })}`;
}

function logClientTiming(
  threadId: string,
  phase: ClientTimingPhase,
  startedAt: number,
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug(
    formatClientTimingLog(phase, getClientTimingNow() - startedAt, threadId),
  );
}

function areMessagesEqual(left: ThreadUIMessage[], right: ThreadUIMessage[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const other = right[index];
    return other
      ? message.id === other.id &&
          getThreadMessageSyncToken(message) ===
            getThreadMessageSyncToken(other)
      : false;
  });
}

function areQueuedFollowUpsEqual(
  left: QueuedFollowUpSummary[],
  right: QueuedFollowUpSummary[],
) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((followUp, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      followUp.id === other.id &&
      followUp.modelId === other.modelId &&
      followUp.reasoningEffort === other.reasoningEffort &&
      followUp.threadMode === other.threadMode &&
      followUp.text === other.text &&
      followUp.attachmentCount === other.attachmentCount &&
      followUp.hasFiles === other.hasFiles &&
      new Date(followUp.createdAt).getTime() ===
        new Date(other.createdAt).getTime()
    );
  });
}

function areThreadSessionStatesEqual(
  current: ThreadSessionState,
  next: ThreadSessionState,
) {
  return (
    current === next ||
    (current.activeRunId === next.activeRunId &&
      current.chatEngine === next.chatEngine &&
      current.composerState.pendingActionCount ===
        next.composerState.pendingActionCount &&
      current.connectionState === next.connectionState &&
      current.errorMessage === next.errorMessage &&
      current.lastAppliedRevision === next.lastAppliedRevision &&
      current.lastSyncedAt === next.lastSyncedAt &&
      areMessagesEqual(current.messages, next.messages) &&
      (current.optimisticQueuedFollowUpIds?.length ?? 0) ===
        (next.optimisticQueuedFollowUpIds?.length ?? 0) &&
      (current.optimisticQueuedFollowUpIds ?? []).every(
        (id, index) => id === (next.optimisticQueuedFollowUpIds ?? [])[index],
      ) &&
      areQueuedFollowUpsEqual(current.queuedFollowUps, next.queuedFollowUps) &&
      current.threadId === next.threadId &&
      current.threadTitle === next.threadTitle &&
      current.threadStatus === next.threadStatus)
  );
}

function getMaxMessageRevision(messages: ThreadUIMessage[]) {
  return messages.reduce(
    (maxRevision, message) =>
      Math.max(maxRevision, getThreadMessageRevision(message)),
    0,
  );
}

function normalizeQueuedFollowUps(
  queuedFollowUps: QueuedFollowUpSummary[],
): QueuedFollowUpSummary[] {
  return queuedFollowUps.map((followUp) => ({
    ...followUp,
    createdAt:
      followUp.createdAt instanceof Date
        ? followUp.createdAt
        : new Date(followUp.createdAt),
  }));
}

export function didSnapshotCommitMessage(
  snapshot: ThreadSessionSnapshot | null,
  messageId: string,
) {
  return (
    snapshot?.messages.some((message) => message.id === messageId) ?? false
  );
}

function extractQueuedFollowUpText(message: ThreadUIMessage) {
  return (
    message.parts.find(
      (
        part,
      ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
        part.type === "text" && typeof part.text === "string",
    )?.text ?? ""
  ).trim();
}

function summarizeLocalQueuedFollowUp(input: {
  message: ThreadUIMessage;
  modelId: string;
  reasoningEffort?: ReasoningEffort | null;
  threadMode?: ThreadMode;
}): QueuedFollowUpSummary {
  const attachmentCount = input.message.parts.filter(
    (part) => part.type === "file",
  ).length;

  return {
    attachmentCount,
    createdAt: new Date(),
    hasFiles: attachmentCount > 0,
    id: input.message.id,
    modelId: input.modelId,
    reasoningEffort: input.reasoningEffort ?? null,
    text: extractQueuedFollowUpText(input.message),
    threadMode: input.threadMode ?? "chat",
  };
}

function insertQueuedFollowUp(
  queuedFollowUps: QueuedFollowUpSummary[],
  followUp: QueuedFollowUpSummary,
  position: "front" | "tail",
) {
  const deduped = queuedFollowUps.filter(
    (queuedFollowUp) => queuedFollowUp.id !== followUp.id,
  );

  return position === "front" ? [followUp, ...deduped] : [...deduped, followUp];
}

function mergeQueuedFollowUpsFromSnapshot(
  current: ThreadSessionState,
  snapshotQueuedFollowUps: QueuedFollowUpSummary[],
) {
  const optimisticQueuedFollowUpIds = current.optimisticQueuedFollowUpIds ?? [];

  if (
    optimisticQueuedFollowUpIds.length === 0 ||
    current.queuedFollowUps.length === 0
  ) {
    return {
      optimisticQueuedFollowUpIds: [],
      queuedFollowUps: snapshotQueuedFollowUps,
    };
  }

  const snapshotById = new Map(
    snapshotQueuedFollowUps.map((followUp) => [followUp.id, followUp] as const),
  );
  const currentById = new Map(
    current.queuedFollowUps.map((followUp) => [followUp.id, followUp] as const),
  );
  const optimisticQueuedFollowUps = optimisticQueuedFollowUpIds
    .filter((followUpId) => !snapshotById.has(followUpId))
    .map((followUpId) => currentById.get(followUpId))
    .filter((followUp): followUp is QueuedFollowUpSummary => followUp != null);

  return {
    optimisticQueuedFollowUpIds: optimisticQueuedFollowUps.map(
      (followUp) => followUp.id,
    ),
    queuedFollowUps: [...snapshotQueuedFollowUps, ...optimisticQueuedFollowUps],
  };
}

function insertOptimisticQueuedFollowUpId(
  currentIds: string[],
  followUpId: string,
) {
  if (currentIds.includes(followUpId)) {
    return currentIds;
  }

  return [...currentIds, followUpId];
}

function removeOptimisticQueuedFollowUpId(
  currentIds: string[],
  followUpId: string,
) {
  return currentIds.filter((id) => id !== followUpId);
}

function replaceOptimisticQueuedFollowUpIds(
  currentIds: string[],
  queuedFollowUps: QueuedFollowUpSummary[],
) {
  const queuedIds = new Set(queuedFollowUps.map((followUp) => followUp.id));
  return currentIds.filter((id) => queuedIds.has(id));
}

export function moveQueuedFollowUpToFront(
  queuedFollowUps: QueuedFollowUpSummary[],
  followUpId: string,
) {
  const target = queuedFollowUps.find((followUp) => followUp.id === followUpId);
  if (!target) {
    return queuedFollowUps;
  }

  return insertQueuedFollowUp(queuedFollowUps, target, "front");
}

function normalizeSnapshot(
  snapshot: ThreadSessionSnapshot,
): ThreadSessionSnapshot {
  return {
    ...snapshot,
    chatEngine: snapshot.chatEngine ?? "sentinel",
    messages: normalizeThreadUIMessages(snapshot.messages),
    queuedFollowUps: normalizeQueuedFollowUps(snapshot.queuedFollowUps),
  };
}

function createInitialState(
  threadId: string,
  snapshot?: ThreadSessionSnapshot,
): ThreadSessionState {
  const normalizedSnapshot = snapshot ? normalizeSnapshot(snapshot) : null;

  return {
    activeRunId: normalizedSnapshot?.activeRunId ?? null,
    chatEngine: normalizedSnapshot?.chatEngine ?? "sentinel",
    composerState: {
      pendingActionCount: 0,
    },
    connectionState: hasActiveThreadRun(
      normalizedSnapshot?.activeRunId,
      normalizedSnapshot?.threadStatus ?? "idle",
    )
      ? "connecting"
      : "idle",
    errorMessage: null,
    lastAppliedRevision: normalizedSnapshot
      ? getMaxMessageRevision(normalizedSnapshot.messages)
      : 0,
    lastSyncedAt: normalizedSnapshot ? Date.now() : null,
    messages: normalizedSnapshot?.messages ?? [],
    optimisticQueuedFollowUpIds: [],
    queuedFollowUps: normalizedSnapshot?.queuedFollowUps ?? [],
    threadId,
    threadTitle: normalizedSnapshot?.threadTitle ?? "New thread",
    threadStatus: normalizedSnapshot?.threadStatus ?? "idle",
  };
}

export async function fetchThreadSessionSnapshot(
  threadId: string,
  options?: { allowMissing?: boolean },
): Promise<ThreadSessionSnapshot | null> {
  const response = await fetch(`/api/chat/${threadId}/session`, {
    cache: "no-store",
    method: "GET",
  });

  if (response.status === 404 && options?.allowMissing) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      await readThreadChatErrorMessage(
        response,
        "Unable to refresh the chat session.",
      ),
    );
  }

  return normalizeSnapshot((await response.json()) as ThreadSessionSnapshot);
}

export async function readThreadChatErrorMessage(
  response: Response,
  fallback: string,
) {
  const raw = await response.text();
  const trimmed = raw.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const payload = JSON.parse(trimmed) as {
      error?: string | { message?: string };
      message?: string;
    };

    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message ?? payload.message ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function mergeThreadSessionStateFromSnapshot(
  current: ThreadSessionState,
  snapshot: ThreadSessionSnapshot,
  streamingConnectionState: ThreadConnectionState,
): ThreadSessionState {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const queuedMerge = mergeQueuedFollowUpsFromSnapshot(
    current,
    normalizedSnapshot.queuedFollowUps,
  );
  const nextQueuedFollowUps = queuedMerge.queuedFollowUps;
  const nextRevision = getMaxMessageRevision(normalizedSnapshot.messages);
  const preserveCurrentMessages =
    current.activeRunId != null &&
    current.lastAppliedRevision > nextRevision &&
    current.activeRunId === normalizedSnapshot.activeRunId;
  const nextConnectionState = hasActiveThreadRun(
    normalizedSnapshot.activeRunId,
    normalizedSnapshot.threadStatus,
  )
    ? streamingConnectionState
    : "idle";
  const nextLastAppliedRevision = preserveCurrentMessages
    ? current.lastAppliedRevision
    : Math.max(current.lastAppliedRevision, nextRevision);
  const nextMessages = preserveCurrentMessages
    ? current.messages
    : normalizedSnapshot.messages;

  if (
    current.activeRunId === normalizedSnapshot.activeRunId &&
    current.chatEngine === normalizedSnapshot.chatEngine &&
    current.connectionState === nextConnectionState &&
    current.errorMessage == null &&
    current.lastAppliedRevision === nextLastAppliedRevision &&
    areMessagesEqual(current.messages, nextMessages) &&
    areQueuedFollowUpsEqual(current.queuedFollowUps, nextQueuedFollowUps) &&
    current.threadTitle === normalizedSnapshot.threadTitle &&
    current.threadStatus === normalizedSnapshot.threadStatus
  ) {
    return current;
  }

  return {
    ...current,
    activeRunId: normalizedSnapshot.activeRunId,
    chatEngine: normalizedSnapshot.chatEngine,
    connectionState: nextConnectionState,
    errorMessage: null,
    lastAppliedRevision: nextLastAppliedRevision,
    lastSyncedAt: Date.now(),
    messages: nextMessages,
    optimisticQueuedFollowUpIds: queuedMerge.optimisticQueuedFollowUpIds,
    queuedFollowUps: nextQueuedFollowUps,
    threadTitle: normalizedSnapshot.threadTitle,
    threadStatus: normalizedSnapshot.threadStatus,
  };
}

export function mergeThreadSessionStateWithError(
  current: ThreadSessionState,
  errorMessage: string,
): ThreadSessionState {
  const nextConnectionState = hasActiveThreadRun(
    current.activeRunId,
    current.threadStatus,
  )
    ? current.connectionState
    : "error";

  if (
    current.connectionState === nextConnectionState &&
    current.errorMessage === errorMessage
  ) {
    return current;
  }

  return {
    ...current,
    connectionState: nextConnectionState,
    errorMessage,
  };
}

function upsertMessage(
  messages: ThreadUIMessage[],
  nextMessage: ThreadUIMessage,
): ThreadUIMessage[] {
  const normalizedMessage = normalizeThreadUIMessages([nextMessage])[0];
  if (!normalizedMessage) {
    return messages;
  }

  const existingIndex = messages.findIndex(
    (message) => message.id === normalizedMessage.id,
  );

  if (existingIndex === -1) {
    return [...messages, normalizedMessage];
  }

  return messages.map((message, index) =>
    index === existingIndex ? normalizedMessage : message,
  );
}

function applyToolApprovalResponse(
  messages: ThreadUIMessage[],
  input: ToolApprovalResponseInput,
) {
  return normalizeThreadUIMessages(
    messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        const approval =
          "approval" in part &&
          part.approval &&
          typeof part.approval === "object"
            ? part.approval
            : undefined;

        if (
          !approval ||
          approval.id !== input.id ||
          !("state" in part) ||
          part.state !== "approval-requested"
        ) {
          return part;
        }

        return {
          ...part,
          approval: {
            id: input.id,
            approved: input.approved,
            ...(input.decision ? { decision: input.decision } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
            ...(input.response ? { response: input.response } : {}),
          },
          state: "approval-responded" as const,
        };
      }),
    })),
  );
}

function applyPlanAnswers(
  messages: ThreadUIMessage[],
  { answers, assistantMessageId, questionSetId }: AnswerPlanQuestionsInput,
) {
  return messages.map((message) => {
    if (message.id !== assistantMessageId) {
      return message;
    }

    return {
      ...message,
      parts: message.parts.map((part) => {
        const isAskQuestionPart =
          part.type === "tool-ask_question" ||
          (part.type === "dynamic-tool" && part.toolName === "ask_question");

        if (
          !isAskQuestionPart ||
          part.state !== "output-available" ||
          !("output" in part) ||
          !part.output ||
          typeof part.output !== "object" ||
          !("questionSetId" in part.output) ||
          part.output.questionSetId !== questionSetId
        ) {
          return part;
        }

        return {
          ...part,
          output: {
            ...part.output,
            answers,
            status: "answered",
          },
        };
      }),
    };
  });
}

function parseSseEventBlock(block: string): ThreadStreamEvent | null {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const eventName = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!eventName || !data || data === "[DONE]") {
    return null;
  }

  const parsed = JSON.parse(data) as ThreadStreamEvent;
  return parsed.type === eventName ? parsed : null;
}

async function consumeThreadStream(
  threadId: string,
  signal: AbortSignal,
  onEvent: (event: ThreadStreamEvent) => void,
) {
  const response = await fetch(`/api/chat/${threadId}/stream`, {
    headers: { Accept: "text/event-stream" },
    method: "GET",
    signal,
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok || !response.body) {
    throw new Error("Unable to connect to the live chat stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf("\n\n");
        if (boundaryIndex === -1) {
          break;
        }

        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const event = parseSseEventBlock(block);
        if (event) {
          onEvent(event);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function createSessionStore(
  threadId: string,
  initialSnapshot?: ThreadSessionSnapshot,
): SessionStore {
  let state = createInitialState(threadId, initialSnapshot);
  let clientTimingStartAt: number | null = null;
  let firstStreamEventLogged = false;
  let subscriberCount = 0;
  let streamAbortController: AbortController | null = null;
  const listeners = new Set<() => void>();
  const snapshotListeners = new Set<
    (snapshot: ThreadSessionSnapshot) => void
  >();

  const emitSnapshot = (snapshot: ThreadSessionSnapshot) => {
    for (const listener of snapshotListeners) {
      listener(snapshot);
    }
  };

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setState = (
    updater:
      | ThreadSessionState
      | ((current: ThreadSessionState) => ThreadSessionState),
  ) => {
    const nextState = typeof updater === "function" ? updater(state) : updater;
    if (areThreadSessionStatesEqual(state, nextState)) {
      return;
    }
    state = nextState;
    emit();
  };

  const disconnect = () => {
    streamAbortController?.abort();
    streamAbortController = null;
    setState((current) => ({
      ...current,
      connectionState: hasActiveThreadRun(
        current.activeRunId,
        current.threadStatus,
      )
        ? "disconnected"
        : "idle",
    }));
  };

  const markClientTiming = (phase: ClientTimingPhase) => {
    if (phase === "send_start") {
      clientTimingStartAt = getClientTimingNow();
      firstStreamEventLogged = false;
    }

    if (clientTimingStartAt == null) {
      return;
    }

    logClientTiming(threadId, phase, clientTimingStartAt);
  };

  const applyEvent = (event: ThreadStreamEvent) => {
    if (
      "runId" in event &&
      state.activeRunId &&
      event.runId !== state.activeRunId
    ) {
      return;
    }

    if (!firstStreamEventLogged) {
      firstStreamEventLogged = true;
      markClientTiming("first_stream_event");
    }

    switch (event.type) {
      case "thread.snapshot":
        emitSnapshot(event.snapshot);
        setState((current) => {
          return mergeThreadSessionStateFromSnapshot(
            current,
            event.snapshot,
            current.connectionState,
          );
        });
        return;
      case "message.status":
        setState((current) => ({
          ...current,
          lastSyncedAt: Date.now(),
          messages: current.messages.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  metadata: mergeThreadMessageMetadata(message.metadata, {
                    runId: event.runId,
                    status: event.status,
                  }),
                }
              : message,
          ),
        }));
        return;
      case "message.upsert":
        setState((current) => {
          const nextRevision = getThreadMessageRevision(event.message);
          if (nextRevision > 0 && nextRevision < current.lastAppliedRevision) {
            const existing = current.messages.find(
              (message) => message.id === event.message.id,
            );
            if (
              existing &&
              getThreadMessageRevision(existing) >= nextRevision
            ) {
              return current;
            }
          }

          const nextMessages = upsertMessage(current.messages, event.message);
          return {
            ...current,
            lastAppliedRevision: Math.max(
              current.lastAppliedRevision,
              getMaxMessageRevision(nextMessages),
            ),
            lastSyncedAt: Date.now(),
            messages: nextMessages,
          };
        });
        return;
      case "queue.snapshot":
        setState((current) => {
          const queuedMerge = mergeQueuedFollowUpsFromSnapshot(
            current,
            normalizeQueuedFollowUps(event.queuedFollowUps),
          );

          return {
            ...current,
            lastSyncedAt: Date.now(),
            optimisticQueuedFollowUpIds:
              queuedMerge.optimisticQueuedFollowUpIds,
            queuedFollowUps: queuedMerge.queuedFollowUps,
          };
        });
        return;
      case "run.cancelled":
      case "run.failed":
      case "run.finished":
        setState((current) => ({
          ...current,
          activeRunId: null,
          connectionState: "idle",
          errorMessage: null,
          lastSyncedAt: Date.now(),
          threadStatus: event.threadStatus,
        }));
        return;
      case "run.started":
        setState((current) => ({
          ...current,
          activeRunId: event.runId,
          connectionState: "connected",
          errorMessage: null,
          lastSyncedAt: Date.now(),
          threadStatus: "streaming",
        }));
        return;
    }
  };

  const ensureConnected = () => {
    if (subscriberCount === 0) {
      return;
    }

    const isActiveRun = hasActiveThreadRun(
      state.activeRunId,
      state.threadStatus,
    );
    if (!isActiveRun) {
      if (streamAbortController) {
        disconnect();
      }
      return;
    }

    if (streamAbortController) {
      return;
    }

    const abortController = new AbortController();
    streamAbortController = abortController;
    setState((current) => ({
      ...current,
      connectionState: "connecting",
      errorMessage: null,
    }));
    markClientTiming("sse_connect_started");

    void consumeThreadStream(threadId, abortController.signal, applyEvent)
      .then(async () => {
        if (
          abortController.signal.aborted ||
          streamAbortController !== abortController
        ) {
          return;
        }

        streamAbortController = null;
        try {
          const snapshot = await fetchThreadSessionSnapshot(threadId);
          if (!snapshot) {
            return;
          }
          setState((current) => ({
            ...mergeThreadSessionStateFromSnapshot(
              current,
              snapshot,
              "disconnected",
            ),
          }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to refresh the chat session.";
          setState((current) => ({
            ...current,
            connectionState: "error",
            errorMessage: message,
          }));
        } finally {
          ensureConnected();
        }
      })
      .catch(async (error) => {
        if (
          abortController.signal.aborted ||
          streamAbortController !== abortController
        ) {
          return;
        }

        streamAbortController = null;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to connect to the live chat stream.";
        setState((current) => ({
          ...current,
          connectionState: "error",
          errorMessage: message,
        }));

        try {
          const snapshot = await fetchThreadSessionSnapshot(threadId);
          if (!snapshot) {
            return;
          }
          setState((current) => ({
            ...mergeThreadSessionStateFromSnapshot(
              current,
              snapshot,
              "disconnected",
            ),
          }));
        } catch {
          // keep the connection error state until the next successful refresh
        }
      });
  };

  return {
    addSnapshotListener(listener) {
      snapshotListeners.add(listener);

      return () => {
        snapshotListeners.delete(listener);
      };
    },
    applyLocalMessages(messages) {
      setState((current) => ({
        ...current,
        lastSyncedAt: Date.now(),
        messages: normalizeThreadUIMessages(messages),
      }));
    },
    replaceLocalQueuedFollowUps(queuedFollowUps) {
      const normalizedQueuedFollowUps =
        normalizeQueuedFollowUps(queuedFollowUps);
      setState((current) => ({
        ...current,
        lastSyncedAt: Date.now(),
        optimisticQueuedFollowUpIds: replaceOptimisticQueuedFollowUpIds(
          current.optimisticQueuedFollowUpIds ?? [],
          normalizedQueuedFollowUps,
        ),
        queuedFollowUps: normalizedQueuedFollowUps,
      }));
    },
    applyLocalQueuedFollowUp(followUp, position) {
      const normalizedFollowUp = normalizeQueuedFollowUps([followUp])[0]!;
      setState((current) => ({
        ...current,
        lastSyncedAt: Date.now(),
        optimisticQueuedFollowUpIds: insertOptimisticQueuedFollowUpId(
          current.optimisticQueuedFollowUpIds ?? [],
          normalizedFollowUp.id,
        ),
        queuedFollowUps: insertQueuedFollowUp(
          current.queuedFollowUps,
          normalizedFollowUp,
          position,
        ),
      }));
    },
    beginAction() {
      setState((current) => ({
        ...current,
        composerState: {
          pendingActionCount: current.composerState.pendingActionCount + 1,
        },
        errorMessage: null,
      }));
    },
    disconnect,
    endAction() {
      setState((current) => ({
        ...current,
        composerState: {
          pendingActionCount: Math.max(
            0,
            current.composerState.pendingActionCount - 1,
          ),
        },
      }));
    },
    ensureActive() {
      ensureConnected();
    },
    getState() {
      return state;
    },
    hydrate(snapshot) {
      emitSnapshot(snapshot);
      setState((current) => {
        return mergeThreadSessionStateFromSnapshot(
          current,
          snapshot,
          current.connectionState === "connected" ? "connected" : "connecting",
        );
      });
      ensureConnected();
    },
    markClientTiming,
    removeLocalMessage(messageId) {
      setState((current) => ({
        ...current,
        lastSyncedAt: Date.now(),
        messages: current.messages.filter(
          (message) => message.id !== messageId,
        ),
      }));
    },
    removeLocalQueuedFollowUp(followUpId) {
      setState((current) => ({
        ...current,
        lastSyncedAt: Date.now(),
        optimisticQueuedFollowUpIds: removeOptimisticQueuedFollowUpId(
          current.optimisticQueuedFollowUpIds ?? [],
          followUpId,
        ),
        queuedFollowUps: current.queuedFollowUps.filter(
          (followUp) => followUp.id !== followUpId,
        ),
      }));
    },
    async refreshSnapshot(options) {
      const snapshot = await fetchThreadSessionSnapshot(threadId, options);
      if (!snapshot) {
        return;
      }
      this.hydrate(snapshot);
    },
    setRequestError(errorMessage) {
      setState((current) =>
        mergeThreadSessionStateWithError(current, errorMessage),
      );
    },
    setConnectionState(connectionState, errorMessage = null) {
      setState((current) => ({
        ...current,
        connectionState,
        errorMessage,
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      subscriberCount += 1;
      ensureConnected();

      return () => {
        listeners.delete(listener);
        subscriberCount = Math.max(0, subscriberCount - 1);
        if (subscriberCount === 0) {
          disconnect();
        }
      };
    },
  };
}

function getOrCreateSessionStore(
  threadId: string,
  initialSnapshot?: ThreadSessionSnapshot,
) {
  const existing = sessionStores.get(threadId);
  if (existing) {
    return existing;
  }

  const store = createSessionStore(threadId, initialSnapshot);
  sessionStores.set(threadId, store);
  return store;
}

function createUserThreadMessage({
  composerContext,
  files,
  id,
  metadata,
  text,
}: Pick<SendThreadMessageInput, "composerContext" | "files" | "text"> & {
  id?: string;
  metadata?: ThreadMessageMetadata;
}): ThreadUIMessage {
  const fileParts = files ?? [];
  const hasContext =
    composerContext &&
    (composerContext.paths.length > 0 || composerContext.skills.length > 0);

  return {
    id: id ?? crypto.randomUUID(),
    metadata: {
      ...(hasContext ? { composerContext } : {}),
      ...(metadata ?? {}),
    },
    parts: [...fileParts, ...(text ? [{ text, type: "text" as const }] : [])],
    role: "user",
  };
}

function getLastAssistantMessage(messages: ThreadUIMessage[]) {
  return [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
}

export function useThreadChat({
  initialActiveRunId = null,
  initialChatEngine = "sentinel",
  initialMessages = [],
  initialQueuedFollowUps = [],
  initialThreadStatus = "idle",
  initialThreadTitle = "New thread",
  onError,
  onSnapshot,
  threadId,
  workspaceId,
}: UseThreadChatOptions) {
  const store = useMemo(
    () =>
      getOrCreateSessionStore(threadId, {
        activeRunId: initialActiveRunId,
        chatEngine: initialChatEngine,
        messages: initialMessages,
        queuedFollowUps: initialQueuedFollowUps,
        threadId,
        threadTitle: initialThreadTitle,
        threadStatus: initialThreadStatus,
      }),
    [threadId],
  );

  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  useEffect(() => {
    store.hydrate({
      activeRunId: initialActiveRunId,
      chatEngine: initialChatEngine,
      messages: initialMessages,
      queuedFollowUps: initialQueuedFollowUps,
      threadId,
      threadTitle: initialThreadTitle,
      threadStatus: initialThreadStatus,
    });
  }, [
    initialActiveRunId,
    initialChatEngine,
    initialMessages,
    initialQueuedFollowUps,
    initialThreadStatus,
    initialThreadTitle,
    store,
    threadId,
  ]);

  useEffect(() => {
    if (!onSnapshot) {
      return;
    }

    return store.addSnapshotListener(onSnapshot);
  }, [onSnapshot, store]);

  const postThreadAction = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/chat", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await readThreadChatErrorMessage(
            response,
            "Unable to process the chat request.",
          ),
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? ((await response.json()) as ThreadChatBootstrapResponse)
        : null;

      return { data, response };
    },
    [],
  );

  const runAction = useCallback(
    async (
      body: Record<string, unknown>,
      localMessages?: ThreadUIMessage[],
      options?: {
        committedMessageId?: string;
      },
    ): Promise<ThreadChatBootstrapResponse | null> => {
      store.markClientTiming("send_start");
      store.beginAction();

      if (localMessages) {
        store.applyLocalMessages(localMessages);
      }

      try {
        const { data } = await postThreadAction(body);
        store.markClientTiming("post_complete");
        if (data?.snapshot) {
          store.hydrate(data.snapshot);
        } else {
          await store.refreshSnapshot();
        }
        store.markClientTiming("snapshot_hydrated");
        return data;
      } catch (error) {
        const baseErrorMessage = getErrorMessage(
          error,
          "Unable to process the chat request.",
        );
        const baseError =
          error instanceof Error ? error : new Error(baseErrorMessage);
        let committed = false;

        if (options?.committedMessageId) {
          try {
            const snapshot = await fetchThreadSessionSnapshot(threadId, {
              allowMissing: true,
            });
            if (snapshot) {
              store.hydrate(snapshot);
            }
            committed = didSnapshotCommitMessage(
              snapshot,
              options.committedMessageId,
            );
          } catch {
            store.setRequestError(baseErrorMessage);
            const nextError = new ThreadActionError(baseErrorMessage, {
              cause: error,
              committed: false,
            });
            onError?.(nextError);
            throw nextError;
          }
        } else {
          store.setRequestError(baseErrorMessage);
          void store.refreshSnapshot({ allowMissing: true }).catch(() => {});
          const nextError = new ThreadActionError(baseErrorMessage, {
            cause: error,
            committed: false,
          });
          onError?.(nextError);
          throw nextError;
        }

        const nextError = new ThreadActionError(baseErrorMessage, {
          cause: error,
          committed,
        });

        store.setRequestError(baseErrorMessage);
        onError?.(nextError);

        throw nextError;
      } finally {
        store.endAction();
      }
    },
    [onError, postThreadAction, store, threadId],
  );

  const sendMessage = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      openCode,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      const message = createUserThreadMessage({
        composerContext,
        files,
        id: crypto.randomUUID(),
        metadata: {
          status: "pending",
          statusLabel: "Sending...",
        },
        text,
      });
      const nextMessages = upsertMessage(store.getState().messages, message);

      try {
        return await runAction(
          {
            ...(draftRepoState ? { draftRepoState } : {}),
            engine,
            id: threadId,
            message,
            modelId,
            ...(openCode ? { openCode } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(threadMode ? { threadMode } : {}),
            trigger: "submit-user-message",
            workspaceId: workspaceIdRef.current,
          },
          nextMessages,
          { committedMessageId: message.id },
        );
      } catch (error) {
        if (!isCommittedThreadActionError(error)) {
          store.removeLocalMessage(message.id);
        }
        throw error;
      }
    },
    [runAction, store, threadId],
  );

  const editMessage = useCallback(
    async ({
      composerContext,
      engine,
      files,
      modelId,
      openCode,
      reasoningEffort,
      targetMessageId,
      text,
    }: EditThreadMessageInput) => {
      const message = createUserThreadMessage({
        composerContext,
        files,
        id: crypto.randomUUID(),
        metadata: {
          editedFromMessageId: targetMessageId,
          status: "pending",
          statusLabel: "Sending...",
        },
        text,
      });
      const nextMessages = upsertMessage(store.getState().messages, message);

      try {
        await runAction(
          {
            engine,
            id: threadId,
            message,
            messageId: targetMessageId,
            modelId,
            ...(openCode ? { openCode } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            trigger: "edit-user-message",
            workspaceId: workspaceIdRef.current,
          },
          nextMessages,
          { committedMessageId: message.id },
        );
      } catch (error) {
        if (!isCommittedThreadActionError(error)) {
          store.removeLocalMessage(message.id);
        }
        throw error;
      }
    },
    [runAction, store, threadId],
  );

  const queueFollowUp = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      openCode,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      const message = createUserThreadMessage({ composerContext, files, text });
      store.applyLocalQueuedFollowUp(
        summarizeLocalQueuedFollowUp({
          message,
          modelId,
          reasoningEffort,
          threadMode,
        }),
        "tail",
      );

      try {
        await runAction({
          ...(draftRepoState ? { draftRepoState } : {}),
          engine,
          id: threadId,
          message,
          modelId,
          ...(openCode ? { openCode } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          ...(threadMode ? { threadMode } : {}),
          trigger: "queue-follow-up",
          workspaceId: workspaceIdRef.current,
        });
      } catch (error) {
        store.removeLocalQueuedFollowUp(message.id);
        throw error;
      }
    },
    [runAction, store, threadId],
  );

  const steerFollowUp = useCallback(
    async ({
      composerContext,
      draftRepoState,
      engine,
      files,
      modelId,
      openCode,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      const message = createUserThreadMessage({ composerContext, files, text });
      store.applyLocalQueuedFollowUp(
        summarizeLocalQueuedFollowUp({
          message,
          modelId,
          reasoningEffort,
          threadMode,
        }),
        "front",
      );

      try {
        await runAction({
          ...(draftRepoState ? { draftRepoState } : {}),
          engine,
          id: threadId,
          message,
          modelId,
          ...(openCode ? { openCode } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          ...(threadMode ? { threadMode } : {}),
          trigger: "steer-follow-up",
          workspaceId: workspaceIdRef.current,
        });
      } catch (error) {
        store.removeLocalQueuedFollowUp(message.id);
        throw error;
      }
    },
    [runAction, store, threadId],
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      await runAction({
        id: threadId,
        messageId,
        trigger: "regenerate-assistant-message",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      await runAction({
        id: threadId,
        messageId,
        trigger: "retry-assistant-message",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
  );

  const stopStream = useCallback(async () => {
    const lastAssistant = getLastAssistantMessage(store.getState().messages);

    await runAction({
      id: threadId,
      ...(lastAssistant ? { messageId: lastAssistant.id } : {}),
      trigger: "stop-stream",
      workspaceId: workspaceIdRef.current,
    });
  }, [runAction, store, threadId]);

  const answerPlanQuestions = useCallback(
    async (input: AnswerPlanQuestionsInput) => {
      const nextMessages = applyPlanAnswers(store.getState().messages, input);

      await runAction(
        {
          id: threadId,
          messageId: input.assistantMessageId,
          messages: nextMessages,
          planAnswers: input.answers,
          planQuestionSetId: input.questionSetId,
          threadMode: "plan",
          trigger: "submit-plan-answer",
          workspaceId: workspaceIdRef.current,
        },
        nextMessages,
      );
    },
    [runAction, store, threadId],
  );

  const addToolApprovalResponse = useCallback(
    async (input: ToolApprovalResponseInput) => {
      const nextMessages = applyToolApprovalResponse(
        store.getState().messages,
        input,
      );

      await runAction(
        {
          id: threadId,
          messages: nextMessages,
          toolApprovalResponse: input,
          trigger: "submit-tool-approval",
          workspaceId: workspaceIdRef.current,
        },
        nextMessages,
      );
    },
    [runAction, store, threadId],
  );

  const status =
    state.threadStatus === "streaming"
      ? ("streaming" as const)
      : state.composerState.pendingActionCount > 0
        ? ("submitted" as const)
        : state.connectionState === "error"
          ? ("error" as const)
          : ("ready" as const);

  return {
    activeRunId: state.activeRunId,
    addToolApprovalResponse,
    answerPlanQuestions,
    chatEngine: state.chatEngine,
    connectionState: state.connectionState,
    editMessage,
    errorMessage: state.errorMessage,
    messages: state.messages,
    replaceQueuedFollowUpsLocally: store.replaceLocalQueuedFollowUps,
    queueFollowUp,
    queuedFollowUps: state.queuedFollowUps,
    regenerateMessage,
    retryMessage,
    sendMessage,
    status,
    steerFollowUp,
    stopStream,
    threadTitle: state.threadTitle,
    threadStatus: state.threadStatus,
  };
}
