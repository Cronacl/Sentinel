"use client";

import { useSyncExternalStore } from "react";

type ReasoningSidebarState = {
  isLastStreamingPart: boolean;
  isStreaming: boolean;
  reasoning: string;
  reasoningKey: string | null;
  title: string | null;
  tokenCount?: number;
};

const DEFAULT_STATE: ReasoningSidebarState = {
  isLastStreamingPart: false,
  isStreaming: false,
  reasoning: "",
  reasoningKey: null,
  title: null,
  tokenCount: undefined,
};

let state = DEFAULT_STATE;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getReasoningSidebarState() {
  return state;
}

export function setReasoningSidebarState(
  nextState: Partial<ReasoningSidebarState>,
) {
  state = {
    ...state,
    ...nextState,
  };
  emit();
}

export function closeReasoningSidebarState() {
  state = DEFAULT_STATE;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReasoningSidebarState<T>(
  selector: (state: ReasoningSidebarState) => T,
) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}
