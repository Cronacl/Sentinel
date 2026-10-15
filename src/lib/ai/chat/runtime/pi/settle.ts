import "server-only";

import type { PiRpcProcess } from "@/lib/ai/chat/engines/pi/rpc";

import type { PiRunControl } from "./control";

// When a Pi turn is over (t3code packages/provider-pi/src/server/adapter.ts,
// MIT). `agent_settled` is Pi's terminal signal, but an extension can start
// detached compaction as it unwinds, so the turn ends only once `get_state`
// reports Pi idle: not streaming, not compacting, nothing queued. Builds that
// never send `agent_settled` (0.80.x) are asked after `agent_end`, and a
// prompt answer that started no run we saw is checked too. A busy Pi is asked
// again with backoff; a Pi that cannot answer is ended, which ends the turn.

/** Tests shorten these. */
export const PI_SETTLE_TIMINGS = {
  /** After `agent_end` when no `agent_settled` follows. */
  afterEndMs: 10_000,
  /** After a prompt answer when no `agent_start` was seen. */
  afterPromptMs: 1_000,
  /** The longest wait between checks while Pi is busy. */
  maxBusyDelayMs: 2_000,
  /** Before asking again after a failed check. */
  retryMs: 100,
  /** How long Stop waits for Pi to settle after `abort` before ending it. */
  stopGraceMs: 5_000,
};

const MAX_FAILED_CHECKS = 3;
const CHECK_TIMEOUT_MS = 5_000;

export function isPiIdle(state: unknown) {
  const record =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : {};
  return (
    record.isStreaming !== true &&
    record.isCompacting !== true &&
    (typeof record.pendingMessageCount === "number"
      ? record.pendingMessageCount
      : 0) === 0
  );
}

/** New agent activity: checks already running stop. */
export function cancelPiIdleCheck(control: PiRunControl) {
  control.settleGeneration += 1;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms).unref?.();
  });
}

/**
 * Settles the turn once Pi is idle. A later check (or new activity)
 * replaces this one; `onBroken` ends a Pi that keeps failing to answer.
 */
export async function settleWhenPiIdle(
  control: PiRunControl,
  process: PiRpcProcess,
  input: { delayMs: number; onBroken(): Promise<void> },
) {
  control.settleGeneration += 1;
  const generation = control.settleGeneration;
  const current = () =>
    !control.finished &&
    control.settleGeneration === generation &&
    process.isAlive();
  let wait = input.delayMs;
  let failures = 0;
  for (;;) {
    await sleep(wait);
    if (!current()) {
      return;
    }
    let state: unknown;
    try {
      state = await process.request(
        "get_state",
        {},
        {
          timeoutMs: CHECK_TIMEOUT_MS,
        },
      );
    } catch {
      if (!current()) {
        return;
      }
      failures += 1;
      if (failures >= MAX_FAILED_CHECKS) {
        await input.onBroken();
        return;
      }
      wait = PI_SETTLE_TIMINGS.retryMs;
      continue;
    }
    if (!current()) {
      return;
    }
    if (isPiIdle(state)) {
      control.tracker.settled = true;
      control.settle.resolve();
      return;
    }
    failures = 0;
    wait = Math.min(Math.max(wait * 2, 250), PI_SETTLE_TIMINGS.maxBusyDelayMs);
  }
}
