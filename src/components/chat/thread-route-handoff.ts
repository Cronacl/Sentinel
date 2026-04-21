import type {
  ChatComposerOpenCodeSelection,
  ChatComposerThreadSelection,
} from "./chat-composer/types";
import type { DraftProjectMode } from "./draft-thread-project-mode";

export type ThreadRouteHandoffState = {
  draftPreparedWorktree: {
    branch: string;
    path: string;
  } | null;
  draftProjectMode: DraftProjectMode;
  openCodeSelection: ChatComposerOpenCodeSelection;
  threadId: string;
  threadSelection: ChatComposerThreadSelection;
  updatedAt: number;
};

const threadRouteHandoffStore = new Map<string, ThreadRouteHandoffState>();

export const THREAD_ROUTE_HANDOFF_MAX_AGE_MS = 30_000;

export function setThreadRouteHandoff(state: ThreadRouteHandoffState) {
  threadRouteHandoffStore.set(state.threadId, state);
}

export function peekThreadRouteHandoff(threadId: string) {
  return threadRouteHandoffStore.get(threadId) ?? null;
}

export function clearThreadRouteHandoff(threadId: string) {
  threadRouteHandoffStore.delete(threadId);
}

export function isThreadRouteHandoffFresh(
  state: ThreadRouteHandoffState,
  now = Date.now(),
) {
  return (
    now >= state.updatedAt &&
    now - state.updatedAt <= THREAD_ROUTE_HANDOFF_MAX_AGE_MS
  );
}
