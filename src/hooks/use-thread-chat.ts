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
import type { ReasoningEffort } from "@/lib/ai/providers/models";
import {
  getThreadMessageSyncToken,
  getThreadMessageRevision,
  mergeThreadMessageMetadata,
  normalizeThreadUIMessages,
  type ThreadUIMessage,
} from "@/lib/ai/messages/types";
import type { ThreadMode, ThreadPlanAnswer } from "@/lib/plan";
import type { ThreadStatus } from "@/server/db/enums";

type UseThreadChatOptions = {
  hydrateFromServer?: boolean;
  initialActiveRunId?: string | null;
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
  files?: FileUIPart[];
  modelId: string;
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

type ToolApprovalResponseInput = {
  approved: boolean;
  id: string;
  reason?: string;
};

type ThreadConnectionState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
  | "idle";

type ThreadSessionState = {
  activeRunId: string | null;
  composerState: {
    pendingActionCount: number;
  };
  connectionState: ThreadConnectionState;
  errorMessage: string | null;
  lastAppliedRevision: number;
  lastSyncedAt: number | null;
  messages: ThreadUIMessage[];
  queuedFollowUps: QueuedFollowUpSummary[];
  threadId: string;
  threadTitle: string;
  threadStatus: ThreadStatus;
};

type SessionStore = {
  addSnapshotListener(listener: (snapshot: ThreadSessionSnapshot) => void): () => void;
  applyLocalMessages(messages: ThreadUIMessage[]): void;
  beginAction(): void;
  disconnect(): void;
  endAction(): void;
  ensureActive(): void;
  getState(): ThreadSessionState;
  hydrate(snapshot: ThreadSessionSnapshot): void;
  refreshSnapshot(options?: { allowMissing?: boolean }): Promise<void>;
  setConnectionState(
    connectionState: ThreadConnectionState,
    errorMessage?: string | null,
  ): void;
  subscribe(listener: () => void): () => void;
};

const sessionStores = new Map<string, SessionStore>();

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
          getThreadMessageSyncToken(message) === getThreadMessageSyncToken(other)
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
      current.composerState.pendingActionCount ===
        next.composerState.pendingActionCount &&
      current.connectionState === next.connectionState &&
      current.errorMessage === next.errorMessage &&
      current.lastAppliedRevision === next.lastAppliedRevision &&
      current.lastSyncedAt === next.lastSyncedAt &&
      areMessagesEqual(current.messages, next.messages) &&
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

function normalizeSnapshot(
  snapshot: ThreadSessionSnapshot,
): ThreadSessionSnapshot {
  return {
    ...snapshot,
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
    composerState: {
      pendingActionCount: 0,
    },
    connectionState:
      normalizedSnapshot?.activeRunId &&
      normalizedSnapshot.threadStatus === "streaming"
        ? "connecting"
        : "idle",
    errorMessage: null,
    lastAppliedRevision: normalizedSnapshot
      ? getMaxMessageRevision(normalizedSnapshot.messages)
      : 0,
    lastSyncedAt: normalizedSnapshot ? Date.now() : null,
    messages: normalizedSnapshot?.messages ?? [],
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
    throw new Error("Unable to refresh the chat session.");
  }

  return normalizeSnapshot((await response.json()) as ThreadSessionSnapshot);
}

export function mergeThreadSessionStateFromSnapshot(
  current: ThreadSessionState,
  snapshot: ThreadSessionSnapshot,
  streamingConnectionState: ThreadConnectionState,
): ThreadSessionState {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const nextRevision = getMaxMessageRevision(normalizedSnapshot.messages);
  const preserveCurrentMessages =
    current.activeRunId != null &&
    current.lastAppliedRevision > nextRevision &&
    current.activeRunId === normalizedSnapshot.activeRunId;
  const nextConnectionState =
    normalizedSnapshot.activeRunId &&
    normalizedSnapshot.threadStatus === "streaming"
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
    current.connectionState === nextConnectionState &&
    current.errorMessage == null &&
    current.lastAppliedRevision === nextLastAppliedRevision &&
    areMessagesEqual(current.messages, nextMessages) &&
    areQueuedFollowUpsEqual(
      current.queuedFollowUps,
      normalizedSnapshot.queuedFollowUps,
    ) &&
    current.threadTitle === normalizedSnapshot.threadTitle &&
    current.threadStatus === normalizedSnapshot.threadStatus
  ) {
    return current;
  }

  return {
    ...current,
    activeRunId: normalizedSnapshot.activeRunId,
    connectionState: nextConnectionState,
    errorMessage: null,
    lastAppliedRevision: nextLastAppliedRevision,
    lastSyncedAt: Date.now(),
    messages: nextMessages,
    queuedFollowUps: normalizedSnapshot.queuedFollowUps,
    threadTitle: normalizedSnapshot.threadTitle,
    threadStatus: normalizedSnapshot.threadStatus,
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
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      const approval =
        "approval" in part && part.approval && typeof part.approval === "object"
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
          ...(input.reason ? { reason: input.reason } : {}),
        },
        state: "approval-responded" as const,
      };
    }),
  }));
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
      connectionState:
        current.activeRunId && current.threadStatus === "streaming"
          ? "disconnected"
          : "idle",
    }));
  };

  const applyEvent = (event: ThreadStreamEvent) => {
    if (
      "runId" in event &&
      state.activeRunId &&
      event.runId !== state.activeRunId
    ) {
      return;
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
        setState((current) => ({
          ...current,
          lastSyncedAt: Date.now(),
          queuedFollowUps: normalizeQueuedFollowUps(event.queuedFollowUps),
        }));
        return;
      case "run.cancelled":
      case "run.failed":
      case "run.finished":
        setState((current) => ({
          ...current,
          activeRunId: null,
          connectionState: "idle",
          errorMessage:
            event.type === "run.failed" ? event.error : current.errorMessage,
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

    if (!state.activeRunId || state.threadStatus !== "streaming") {
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
        messages: normalizeThreadUIMessages(messages),
      }));
    },
    beginAction() {
      setState((current) => ({
        ...current,
        composerState: {
          pendingActionCount: current.composerState.pendingActionCount + 1,
        },
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
    async refreshSnapshot(options) {
      const snapshot = await fetchThreadSessionSnapshot(threadId, options);
      if (!snapshot) {
        return;
      }
      this.hydrate(snapshot);
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
  files,
  text,
}: Pick<SendThreadMessageInput, "files" | "text">): ThreadUIMessage {
  const fileParts = files ?? [];

  return {
    id: crypto.randomUUID(),
    metadata: {},
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
  hydrateFromServer = false,
  initialActiveRunId = null,
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
      messages: initialMessages,
      queuedFollowUps: initialQueuedFollowUps,
      threadId,
      threadTitle: initialThreadTitle,
      threadStatus: initialThreadStatus,
    });
  }, [
    initialActiveRunId,
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

  useEffect(() => {
    if (!hydrateFromServer) {
      return;
    }

    void store.refreshSnapshot({ allowMissing: true }).catch((error) => {
      const nextError =
        error instanceof Error
          ? error
          : new Error("Unable to refresh the chat session.");
      onError?.(nextError);
    });
  }, [hydrateFromServer, onError, store]);

  const postThreadAction = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/chat", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        let message = "Unable to process the chat request.";

        try {
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          message = payload.error?.message ?? message;
        } catch {
          // keep the fallback message when the response is not JSON
        }

        throw new Error(message);
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
    ): Promise<ThreadChatBootstrapResponse | null> => {
      store.beginAction();

      if (localMessages) {
        store.applyLocalMessages(localMessages);
      }

      try {
        const { data } = await postThreadAction(body);
        if (data?.snapshot) {
          store.hydrate(data.snapshot);
        } else {
          await store.refreshSnapshot();
        }
        return data;
      } catch (error) {
        const nextError =
          error instanceof Error
            ? error
            : new Error("Unable to process the chat request.");
        onError?.(nextError);
        throw nextError;
      } finally {
        store.endAction();
      }
    },
    [onError, postThreadAction, store],
  );

  const sendMessage = useCallback(
    async ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      return runAction({
        id: threadId,
        message: createUserThreadMessage({ files, text }),
        modelId,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(threadMode ? { threadMode } : {}),
        trigger: "submit-user-message",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
  );

  const editMessage = useCallback(
    async ({
      files,
      modelId,
      reasoningEffort,
      targetMessageId,
      text,
    }: EditThreadMessageInput) => {
      await runAction({
        id: threadId,
        message: createUserThreadMessage({ files, text }),
        messageId: targetMessageId,
        modelId,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        trigger: "edit-user-message",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
  );

  const queueFollowUp = useCallback(
    async ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      await runAction({
        id: threadId,
        message: createUserThreadMessage({ files, text }),
        modelId,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(threadMode ? { threadMode } : {}),
        trigger: "queue-follow-up",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
  );

  const steerFollowUp = useCallback(
    async ({
      files,
      modelId,
      reasoningEffort,
      text,
      threadMode,
    }: SendThreadMessageInput) => {
      await runAction({
        id: threadId,
        message: createUserThreadMessage({ files, text }),
        modelId,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(threadMode ? { threadMode } : {}),
        trigger: "steer-follow-up",
        workspaceId: workspaceIdRef.current,
      });
    },
    [runAction, threadId],
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
    connectionState: state.connectionState,
    editMessage,
    errorMessage: state.errorMessage,
    messages: state.messages,
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
