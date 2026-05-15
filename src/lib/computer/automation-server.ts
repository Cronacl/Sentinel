import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ComputerAutomationCommandEnvelope,
  ComputerAutomationCommandInput,
  ComputerAutomationCommandResult,
  ComputerAutomationResultEnvelope,
} from "./automation-types";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const CLIENT_STALE_AFTER_MS = 45_000;

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (result: ComputerAutomationCommandResult) => void;
  timer: NodeJS.Timeout;
};

type ComputerAutomationClientState = {
  lastSeenAt: number;
  pending: Map<string, PendingCommand>;
};

type ComputerAutomationUserState = {
  lastSeenAt: number;
  pollWaiters: Set<(command: ComputerAutomationCommandEnvelope | null) => void>;
  queue: ComputerAutomationCommandEnvelope[];
  threads: Map<string, ComputerAutomationClientState>;
};

declare global {
  // eslint-disable-next-line no-var
  var __sentinelComputerAutomationClients:
    | Map<string, ComputerAutomationUserState>
    | undefined;
}

const clients =
  globalThis.__sentinelComputerAutomationClients ??
  (globalThis.__sentinelComputerAutomationClients = new Map());

function getUserState(userId: string) {
  let state = clients.get(userId);
  if (!state) {
    state = {
      lastSeenAt: 0,
      pollWaiters: new Set(),
      queue: [],
      threads: new Map(),
    };
    clients.set(userId, state);
  }
  return state;
}

function getClientState(userId: string, threadId: string) {
  const userState = getUserState(userId);
  let state = userState.threads.get(threadId);
  if (!state) {
    state = { lastSeenAt: 0, pending: new Map() };
    userState.threads.set(threadId, state);
  }
  return state;
}

function deliverCommand(
  state: ComputerAutomationUserState,
  command: ComputerAutomationCommandEnvelope,
) {
  const waiter = state.pollWaiters.values().next().value as
    | ((command: ComputerAutomationCommandEnvelope | null) => void)
    | undefined;

  if (waiter) {
    state.pollWaiters.delete(waiter);
    waiter(command);
    return;
  }

  state.queue.push(command);
}

export async function dispatchComputerCommand({
  abortSignal,
  command,
  threadId,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  userId,
}: {
  abortSignal?: AbortSignal;
  command: ComputerAutomationCommandInput;
  threadId: string;
  timeoutMs?: number;
  userId: string;
}): Promise<ComputerAutomationCommandResult> {
  const userState = getUserState(userId);
  const state = getClientState(userId, threadId);
  const commandId = randomUUID();
  const envelope = { command, id: commandId, threadId };

  return await new Promise<ComputerAutomationCommandResult>(
    (resolve, reject) => {
      const cleanup = () => {
        abortSignal?.removeEventListener("abort", abort);
        const pending = state.pending.get(commandId);
        if (pending) {
          clearTimeout(pending.timer);
          state.pending.delete(commandId);
        }
      };

      const abort = () => {
        cleanup();
        reject(new Error("Computer command was cancelled."));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            state.lastSeenAt > 0 || userState.lastSeenAt > 0
              ? "Timed out waiting for the desktop computer-use bridge to respond."
              : "Desktop computer-use bridge is unavailable. Open Sentinel in the desktop app and keep the bridge mounted.",
          ),
        );
      }, timeoutMs);

      state.pending.set(commandId, {
        reject: (error: Error) => {
          cleanup();
          reject(error);
        },
        resolve: (result: ComputerAutomationCommandResult) => {
          cleanup();
          resolve(result);
        },
        timer,
      });

      abortSignal?.addEventListener("abort", abort, { once: true });
      deliverCommand(userState, envelope);
    },
  );
}

export async function pollComputerAutomationCommand({
  abortSignal,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  userId,
}: {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  userId: string;
}): Promise<ComputerAutomationCommandEnvelope | null> {
  const state = getUserState(userId);
  const now = Date.now();
  state.lastSeenAt = now;

  const queued = state.queue.shift();
  if (queued) {
    getClientState(userId, queued.threadId).lastSeenAt = now;
    return queued;
  }

  return await new Promise((resolve) => {
    let settled = false;

    const finish = (command: ComputerAutomationCommandEnvelope | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", abort);
      state.pollWaiters.delete(finish);
      resolve(command);
    };

    const abort = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);
    state.pollWaiters.add(finish);
    abortSignal?.addEventListener("abort", abort, { once: true });
  });
}

export function submitComputerAutomationResult(
  userId: string,
  envelope: ComputerAutomationResultEnvelope,
) {
  const userState = getUserState(userId);
  const state = getClientState(userId, envelope.threadId);
  const now = Date.now();
  userState.lastSeenAt = now;
  state.lastSeenAt = now;

  const pending = state.pending.get(envelope.commandId);
  if (!pending) return false;

  if (envelope.ok) {
    pending.resolve(envelope.result);
  } else {
    pending.reject(new Error(envelope.error));
  }

  return true;
}

export function markComputerAutomationClientSeen(userId: string) {
  getUserState(userId).lastSeenAt = Date.now();
}

export function getComputerAutomationClientStatus(userId: string) {
  const state = getUserState(userId);
  const now = Date.now();
  let pendingCount = 0;
  for (const threadState of state.threads.values()) {
    pendingCount += threadState.pending.size;
  }

  return {
    connected:
      state.lastSeenAt > 0 && now - state.lastSeenAt <= CLIENT_STALE_AFTER_MS,
    lastSeenAt: state.lastSeenAt
      ? new Date(state.lastSeenAt).toISOString()
      : null,
    pendingCount,
    queuedCount: state.queue.length,
  };
}
