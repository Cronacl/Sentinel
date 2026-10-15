import type { AcpThreadState } from "@/lib/ai/chat/engines/state/acp";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

// What of the thread an ACP agent's own session is missing (design
// acp-and-agents §1.6, §2.5). The session holds the turns it ran; the
// persisted state marks the last of them (`syncedMessageId`). Turns after
// that mark came from somewhere else (another engine answered, a turn
// failed) and are sent with the next prompt; a thread that no longer
// contains the mark (an edited message, a checkpoint restore, another
// branch) has diverged from the session, which is then replaced by a new
// one that gets the whole transcript. Pure.

export type AcpHistoryPlan =
  /** The session holds every earlier turn. */
  | { type: "none" }
  /** The session never got the transcript: send every earlier turn. */
  | { type: "full" }
  /** Turns the session missed, oldest first. */
  | { messages: ThreadUIMessage[]; type: "since" }
  /** The session holds turns the thread no longer has: open a new one. */
  | { type: "diverged" };

export function planAcpHistory(input: {
  /** The message this turn sends (excluded from the history). */
  currentMessageId: string | null;
  state: Pick<
    AcpThreadState,
    "historyDelivered" | "sessionId" | "syncedMessageId"
  > | null;
  /** The thread's active messages, as the model sees them. */
  transcript: readonly ThreadUIMessage[];
}): AcpHistoryPlan {
  const state = input.state;
  if (!state?.sessionId || state.historyDelivered === false) {
    return { type: "full" };
  }
  if (!state.syncedMessageId) {
    // State written before the mark existed: the old Cursor runtime sent
    // the whole transcript with every prompt, so its session has it all.
    return { type: "none" };
  }
  const earlier = input.transcript.filter(
    (message) => message.id !== input.currentMessageId,
  );
  const index = earlier.findIndex(
    (message) => message.id === state.syncedMessageId,
  );
  if (index === -1) {
    return { type: "diverged" };
  }
  const missed = earlier.slice(index + 1);
  return missed.length > 0
    ? { messages: missed, type: "since" }
    : { type: "none" };
}

export const MISSED_TURNS_HEADING =
  "Conversation since your last reply (turns you have not seen):";
