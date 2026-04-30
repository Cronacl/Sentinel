import "server-only";

import { randomUUID } from "node:crypto";

import type {
  BrowserAutomationCommandEnvelope,
  BrowserAutomationCommandInput,
  BrowserAutomationCommandResult,
  BrowserAutomationResultEnvelope,
} from "./automation-types";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const CLIENT_STALE_AFTER_MS = 45_000;

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (result: BrowserAutomationCommandResult) => void;
  timer: NodeJS.Timeout;
};

type BrowserAutomationClientState = {
  lastSeenAt: number;
  pending: Map<string, PendingCommand>;
  pollWaiters: Set<(command: BrowserAutomationCommandEnvelope | null) => void>;
  queue: BrowserAutomationCommandEnvelope[];
};

declare global {
  // eslint-disable-next-line no-var
  var __sentinelBrowserAutomationClients:
    | Map<string, BrowserAutomationClientState>
    | undefined;
}

const clients =
  globalThis.__sentinelBrowserAutomationClients ??
  (globalThis.__sentinelBrowserAutomationClients = new Map());

function getClientState(userId: string) {
  let state = clients.get(userId);
  if (!state) {
    state = {
      lastSeenAt: 0,
      pending: new Map(),
      pollWaiters: new Set(),
      queue: [],
    };
    clients.set(userId, state);
  }
  return state;
}

function rejectPendingCommand(
  commandId: string,
  pending: PendingCommand,
  error: Error,
) {
  clearTimeout(pending.timer);
  pending.reject(error);
}

function deliverCommand(
  state: BrowserAutomationClientState,
  command: BrowserAutomationCommandEnvelope,
) {
  const waiter = state.pollWaiters.values().next().value as
    | ((command: BrowserAutomationCommandEnvelope | null) => void)
    | undefined;

  if (waiter) {
    state.pollWaiters.delete(waiter);
    waiter(command);
    return;
  }

  state.queue.push(command);
}

export async function dispatchBrowserCommand({
  abortSignal,
  command,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  userId,
}: {
  abortSignal?: AbortSignal;
  command: BrowserAutomationCommandInput;
  timeoutMs?: number;
  userId: string;
}): Promise<BrowserAutomationCommandResult> {
  const state = getClientState(userId);
  const commandId = randomUUID();
  const envelope = { command, id: commandId };

  return await new Promise<BrowserAutomationCommandResult>(
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
        reject(new Error("Browser command was cancelled."));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            state.lastSeenAt > 0
              ? "Timed out waiting for the browser panel to respond."
              : "Desktop browser bridge is unavailable. Open Sentinel in the desktop app and keep the browser bridge mounted.",
          ),
        );
      }, timeoutMs);

      state.pending.set(commandId, {
        reject: (error: Error) => {
          cleanup();
          reject(error);
        },
        resolve: (result: BrowserAutomationCommandResult) => {
          cleanup();
          resolve(result);
        },
        timer,
      });

      abortSignal?.addEventListener("abort", abort, { once: true });
      deliverCommand(state, envelope);
    },
  );
}

export async function pollBrowserAutomationCommand({
  abortSignal,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  userId,
}: {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  userId: string;
}): Promise<BrowserAutomationCommandEnvelope | null> {
  const state = getClientState(userId);
  state.lastSeenAt = Date.now();

  const queued = state.queue.shift();
  if (queued) {
    return queued;
  }

  return await new Promise((resolve) => {
    let settled = false;

    const finish = (command: BrowserAutomationCommandEnvelope | null) => {
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

export function submitBrowserAutomationResult(
  userId: string,
  envelope: BrowserAutomationResultEnvelope,
) {
  const state = getClientState(userId);
  state.lastSeenAt = Date.now();

  const pending = state.pending.get(envelope.commandId);
  if (!pending) {
    return false;
  }

  if (envelope.ok) {
    pending.resolve(envelope.result);
  } else {
    pending.reject(new Error(envelope.error));
  }

  return true;
}

export function markBrowserAutomationClientSeen(userId: string) {
  const state = getClientState(userId);
  state.lastSeenAt = Date.now();
}

export function getBrowserAutomationClientStatus(userId: string) {
  const state = getClientState(userId);
  const now = Date.now();
  const connected =
    state.lastSeenAt > 0 && now - state.lastSeenAt <= CLIENT_STALE_AFTER_MS;

  return {
    connected,
    lastSeenAt: state.lastSeenAt
      ? new Date(state.lastSeenAt).toISOString()
      : null,
    pendingCount: state.pending.size,
    queuedCount: state.queue.length,
  };
}

export function clearBrowserAutomationStateForTests(userId: string) {
  const state = clients.get(userId);
  if (!state) return;

  for (const [commandId, pending] of state.pending) {
    rejectPendingCommand(
      commandId,
      pending,
      new Error("Browser automation state was cleared."),
    );
  }
  state.pending.clear();
  state.queue = [];
  state.pollWaiters.forEach(
    (waiter: (command: BrowserAutomationCommandEnvelope | null) => void) =>
      waiter(null),
  );
  state.pollWaiters.clear();
  clients.delete(userId);
}
