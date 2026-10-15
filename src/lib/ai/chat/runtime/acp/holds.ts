import "server-only";

import type { AcpAgentProcess } from "@/lib/ai/chat/engines/acp/connection";
import type { AcpProcessHolds } from "@/lib/ai/chat/engines/acp/descriptor";
import { getAcpProcessPool } from "@/lib/ai/chat/engines/acp/launch";

// Pool pins for work an agent runs on its own between turns (Grok's
// background tasks; design acp-and-agents, process pool): the idle reap would kill
// it. Each hold pins the pool entry once, until released, the process
// exits, or the hard cap passes. Pins and unpins go to the entry only while
// it still holds this process, so a stale hold never unpins a successor.

/** Hard cap of one hold (design: pinned up to 60 min). */
export const ACP_PROCESS_HOLD_CAP_MS = 60 * 60_000;

type Holds = Map<string, ReturnType<typeof setTimeout>>;

const holdsByProcess = new WeakMap<AcpAgentProcess, Holds>();

function holdsOf(process: AcpAgentProcess) {
  let holds = holdsByProcess.get(process);
  if (!holds) {
    const created: Holds = new Map();
    holdsByProcess.set(process, created);
    // The entry goes with the process: only the timers need clearing.
    void process.exited.then(() => {
      for (const timer of created.values()) {
        clearTimeout(timer);
      }
      created.clear();
    });
    holds = created;
  }
  return holds;
}

function ownsEntry(poolKey: string, process: AcpAgentProcess) {
  return getAcpProcessPool().peek(poolKey) === process;
}

export function acpProcessHolds(
  process: AcpAgentProcess,
  poolKey: string,
  options: { capMs?: number } = {},
): AcpProcessHolds {
  const release = (holdId: string) => {
    const holds = holdsOf(process);
    const timer = holds.get(holdId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    holds.delete(holdId);
    if (ownsEntry(poolKey, process)) {
      getAcpProcessPool().unpin(poolKey);
    }
  };
  return {
    holdProcess(holdId) {
      const holds = holdsOf(process);
      if (holds.has(holdId) || !process.isAlive()) {
        return;
      }
      if (!ownsEntry(poolKey, process)) {
        return;
      }
      getAcpProcessPool().pin(poolKey);
      const timer = setTimeout(
        () => release(holdId),
        options.capMs ?? ACP_PROCESS_HOLD_CAP_MS,
      );
      (timer as { unref?: () => void }).unref?.();
      holds.set(holdId, timer);
    },
    releaseProcess: release,
  };
}

/** Outstanding holds of a process (tests). */
export function acpProcessHoldCount(process: AcpAgentProcess) {
  return holdsByProcess.get(process)?.size ?? 0;
}
