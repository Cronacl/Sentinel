"use client";

type IdleHandle = number;
type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: IdleHandle) => void;
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout: number },
  ) => IdleHandle;
};

export function scheduleIdleTask(
  callback: () => void,
  options?: {
    fallbackDelayMs?: number;
    timeoutMs?: number;
  },
) {
  const idleWindow = window as IdleWindow;
  const timeoutMs = options?.timeoutMs ?? 1_000;

  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleHandle = idleWindow.requestIdleCallback(
      () => {
        callback();
      },
      { timeout: timeoutMs },
    );

    return () => {
      idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }

  const timeoutHandle = window.setTimeout(
    callback,
    options?.fallbackDelayMs ?? 120,
  );

  return () => {
    window.clearTimeout(timeoutHandle);
  };
}
