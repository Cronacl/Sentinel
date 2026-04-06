"use client";

import { scheduleIdleTask } from "./idle-task";

type BackgroundTask = {
  key: string;
  minIntervalMs?: number;
  run: () => Promise<unknown> | unknown;
};

const BACKGROUND_TASK_BATCH_SIZE = 2;
const BACKGROUND_TASK_RETRY_DELAY_MS = 4_000;

const pendingTasks = new Map<string, BackgroundTask>();
const lastRunAtByKey = new Map<string, number>();
let flushCleanup: (() => void) | null = null;
let delayedFlushHandle: number | null = null;
let isFlushing = false;

function canRunBackgroundTaskNow() {
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    return false;
  }

  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    if (navigator.onLine === false) {
      return false;
    }

    const connection = navigator as Navigator & {
      connection?: { saveData?: boolean };
    };
    if (connection.connection?.saveData) {
      return false;
    }
  }

  return true;
}

function clearScheduledFlush() {
  flushCleanup?.();
  flushCleanup = null;

  if (delayedFlushHandle != null) {
    window.clearTimeout(delayedFlushHandle);
    delayedFlushHandle = null;
  }
}

function scheduleDelayedFlush(delayMs: number) {
  if (delayedFlushHandle != null) {
    return;
  }

  delayedFlushHandle = window.setTimeout(() => {
    delayedFlushHandle = null;
    scheduleFlush();
  }, delayMs);
}

function scheduleFlush() {
  if (flushCleanup || delayedFlushHandle != null || isFlushing) {
    return;
  }

  flushCleanup = scheduleIdleTask(
    () => {
      flushCleanup = null;
      void flushBackgroundTasks();
    },
    {
      fallbackDelayMs: 160,
      timeoutMs: 1_500,
    },
  );
}

async function flushBackgroundTasks() {
  if (isFlushing) {
    return;
  }

  if (!canRunBackgroundTaskNow()) {
    scheduleDelayedFlush(BACKGROUND_TASK_RETRY_DELAY_MS);
    return;
  }

  const now = Date.now();
  const readyTasks: BackgroundTask[] = [];
  let nextEligibleDelayMs = Number.POSITIVE_INFINITY;

  for (const task of pendingTasks.values()) {
    const minIntervalMs = task.minIntervalMs ?? 0;
    const elapsedMs = now - (lastRunAtByKey.get(task.key) ?? 0);
    const remainingMs = minIntervalMs - elapsedMs;

    if (remainingMs <= 0) {
      readyTasks.push(task);
      if (readyTasks.length >= BACKGROUND_TASK_BATCH_SIZE) {
        break;
      }
      continue;
    }

    nextEligibleDelayMs = Math.min(nextEligibleDelayMs, remainingMs);
  }

  if (readyTasks.length === 0) {
    if (pendingTasks.size > 0) {
      scheduleDelayedFlush(
        Number.isFinite(nextEligibleDelayMs)
          ? Math.max(120, Math.trunc(nextEligibleDelayMs))
          : BACKGROUND_TASK_RETRY_DELAY_MS,
      );
    }
    return;
  }

  isFlushing = true;

  try {
    await Promise.allSettled(
      readyTasks.map(async (task) => {
        pendingTasks.delete(task.key);
        lastRunAtByKey.set(task.key, Date.now());
        await task.run();
      }),
    );
  } finally {
    isFlushing = false;
  }

  if (pendingTasks.size > 0) {
    scheduleFlush();
  }
}

export function enqueueBackgroundTask(task: BackgroundTask) {
  pendingTasks.set(task.key, task);
  scheduleFlush();
}
