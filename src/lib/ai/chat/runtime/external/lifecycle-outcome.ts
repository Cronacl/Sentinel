import type { AcpStopReason } from "@/lib/ai/chat/engines/acp/schema";

// How an ACP turn's stopReason ends the run (design acp-and-agents §2.12).
// Pure; lifecycle.ts re-exports it.

export type ExternalRunOutcome = {
  finishReason: string | null;
  status: "cancelled" | "completed";
  statusLabel: string | null;
};

/**
 * ACP stopReason → how the run ends. A missing stop reason (some agents
 * answer `{}`) is a normal end of turn.
 */
export function outcomeFromStopReason(
  stopReason: AcpStopReason | null,
): ExternalRunOutcome {
  switch (stopReason) {
    case "cancelled":
      return { finishReason: null, status: "cancelled", statusLabel: null };
    case "max_tokens":
      return { finishReason: "length", status: "completed", statusLabel: null };
    case "max_turn_requests":
      return {
        finishReason: "other",
        status: "completed",
        statusLabel: "Turn limit reached",
      };
    case "refusal":
      return {
        finishReason: "content-filter",
        status: "completed",
        statusLabel: null,
      };
    default:
      return { finishReason: "stop", status: "completed", statusLabel: null };
  }
}
