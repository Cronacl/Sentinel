"use client";

import { useSyncExternalStore } from "react";

import { getDesktopApi } from "@/lib/desktop/client";

export type TerminalSession = {
  cwd: string;
  exited: boolean;
  exitCode?: number;
  id: string;
  label: string;
  pid: number;
};

type TerminalState = {
  activeSessionId: string | null;
  isOpen: boolean;
  panelHeight: number;
  sessions: TerminalSession[];
};

type TerminalOutputListener = (data: string) => void;

const PANEL_HEIGHT_STORAGE_KEY = "sentinel.terminal.panel-height";
const MAX_OUTPUT_BUFFER_LENGTH = 200_000;
const MIN_PANEL_HEIGHT = 220;
const DEFAULT_PANEL_HEIGHT = 320;

function getInitialPanelHeight() {
  if (typeof window === "undefined") {
    return DEFAULT_PANEL_HEIGHT;
  }

  const storedValue = window.localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY);
  const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : NaN;
  return getClampedPanelHeight(parsedValue);
}

function getClampedPanelHeight(value: number) {
  const maxHeight =
    typeof window === "undefined"
      ? 720
      : Math.max(MIN_PANEL_HEIGHT, Math.floor(window.innerHeight * 0.75));

  if (!Number.isFinite(value)) {
    return Math.min(DEFAULT_PANEL_HEIGHT, maxHeight);
  }

  return Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight, Math.round(value)));
}

function getTerminalLabel(cwd: string) {
  const segments = cwd.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || cwd;
}

const DEFAULT_STATE: TerminalState = {
  activeSessionId: null,
  isOpen: false,
  panelHeight: getInitialPanelHeight(),
  sessions: [],
};

let state = DEFAULT_STATE;
let preferredCwd: string | null = null;
let didBindDesktopEvents = false;
const listeners = new Set<() => void>();
const sessionOutputs = new Map<string, string>();
const sessionOutputListeners = new Map<string, Set<TerminalOutputListener>>();

function normalizeCwd(cwd: string | null | undefined) {
  const normalized = cwd?.trim();
  return normalized ? normalized : null;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persistPanelHeight(panelHeight: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PANEL_HEIGHT_STORAGE_KEY, String(panelHeight));
}

function appendSessionOutput(sessionId: string, data: string) {
  if (!data) {
    return;
  }

  const previousOutput = sessionOutputs.get(sessionId) ?? "";
  const nextOutput = `${previousOutput}${data}`.slice(
    -MAX_OUTPUT_BUFFER_LENGTH,
  );
  sessionOutputs.set(sessionId, nextOutput);

  sessionOutputListeners.get(sessionId)?.forEach((listener) => listener(data));
}

function removeSessionOutput(sessionId: string) {
  sessionOutputs.delete(sessionId);
  sessionOutputListeners.delete(sessionId);
}

function markTerminalSessionExited(sessionId: string, exitCode?: number) {
  const sessionIndex = state.sessions.findIndex(
    (session) => session.id === sessionId,
  );

  if (sessionIndex === -1) {
    return;
  }

  const session = state.sessions[sessionIndex];
  if (!session) {
    return;
  }

  if (session.exited && session.exitCode === exitCode) {
    return;
  }

  const sessions = [...state.sessions];
  sessions[sessionIndex] = {
    ...session,
    exitCode,
    exited: true,
  };

  state = {
    ...state,
    sessions,
  };
  emit();
}

function bindDesktopEvents() {
  if (didBindDesktopEvents) {
    return;
  }

  const desktop = getDesktopApi();
  if (!desktop) {
    return;
  }

  desktop.terminal.onData((sessionId, data) => {
    appendSessionOutput(sessionId, data);
  });

  desktop.terminal.onExit((sessionId, exitCode) => {
    markTerminalSessionExited(sessionId, exitCode);
  });

  didBindDesktopEvents = true;
}

function findNextActiveSessionId(
  sessions: TerminalSession[],
  removedId: string,
) {
  if (sessions.length === 0) {
    return null;
  }

  const activeIndex = state.sessions.findIndex(
    (session) => session.id === removedId,
  );
  const nextSession =
    sessions[activeIndex] ?? sessions[activeIndex - 1] ?? sessions[0];
  return nextSession?.id ?? null;
}

export function getTerminalState() {
  return state;
}

export function setTerminalPreferredCwd(cwd: string | null) {
  preferredCwd = normalizeCwd(cwd);
}

export function getTerminalDefaultCwd() {
  return (
    preferredCwd ??
    state.sessions.find((session) => session.id === state.activeSessionId)
      ?.cwd ??
    state.sessions[0]?.cwd ??
    null
  );
}

export function openTerminal(cwd?: string | null) {
  bindDesktopEvents();
  setTerminalPreferredCwd(cwd ?? null);

  if (state.isOpen) {
    return;
  }

  state = {
    ...state,
    isOpen: true,
  };
  emit();
}

export function closeTerminal() {
  if (!state.isOpen) {
    return;
  }

  state = {
    ...state,
    isOpen: false,
  };
  emit();
}

export function toggleTerminal(cwd?: string | null) {
  if (state.isOpen) {
    closeTerminal();
    return;
  }

  openTerminal(cwd);
}

export async function createTerminalSession(cwd?: string | null) {
  bindDesktopEvents();

  const desktop = getDesktopApi();
  const resolvedCwd = normalizeCwd(cwd) ?? getTerminalDefaultCwd();
  if (!desktop || !resolvedCwd) {
    return null;
  }

  const result = await desktop.terminal.create(resolvedCwd);
  const session: TerminalSession = {
    cwd: resolvedCwd,
    exited: false,
    id: result.sessionId,
    label: getTerminalLabel(resolvedCwd),
    pid: result.pid,
  };

  preferredCwd = resolvedCwd;
  sessionOutputs.set(session.id, "");
  state = {
    ...state,
    activeSessionId: session.id,
    isOpen: true,
    sessions: [...state.sessions, session],
  };
  emit();

  return session;
}

export function getTerminalSessionForCwd(cwd: string | null | undefined) {
  const normalizedCwd = normalizeCwd(cwd);
  if (!normalizedCwd) {
    return null;
  }

  return (
    state.sessions.find((session) => session.cwd === normalizedCwd) ?? null
  );
}

export async function openOrCreateTerminalSession(
  cwd: string | null | undefined,
  options?: {
    toggleIfAlreadyActive?: boolean;
  },
) {
  const normalizedCwd = normalizeCwd(cwd);
  if (!normalizedCwd) {
    return null;
  }

  setTerminalPreferredCwd(normalizedCwd);
  const existingSession = getTerminalSessionForCwd(normalizedCwd);
  const shouldToggleIfAlreadyActive =
    options?.toggleIfAlreadyActive === true &&
    state.isOpen &&
    existingSession?.id === state.activeSessionId;

  if (shouldToggleIfAlreadyActive) {
    closeTerminal();
    return existingSession;
  }

  if (existingSession) {
    const shouldEmit =
      !state.isOpen || state.activeSessionId !== existingSession.id;

    if (shouldEmit) {
      state = {
        ...state,
        activeSessionId: existingSession.id,
        isOpen: true,
      };
      emit();
    }

    return existingSession;
  }

  return createTerminalSession(normalizedCwd);
}

export async function killTerminalSession(sessionId: string) {
  const desktop = getDesktopApi();
  const session = state.sessions.find((entry) => entry.id === sessionId);

  try {
    if (desktop && session && !session.exited) {
      await desktop.terminal.kill(sessionId);
    }
  } finally {
    removeTerminalSession(sessionId);
  }
}

export function removeTerminalSession(sessionId: string) {
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  if (sessions.length === state.sessions.length) {
    return;
  }

  removeSessionOutput(sessionId);
  state = {
    ...state,
    activeSessionId:
      state.activeSessionId === sessionId
        ? findNextActiveSessionId(sessions, sessionId)
        : state.activeSessionId,
    isOpen: sessions.length > 0 ? state.isOpen : false,
    sessions,
  };
  emit();
}

export function setActiveTerminalSession(sessionId: string) {
  if (state.activeSessionId === sessionId) {
    return;
  }

  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  preferredCwd = session.cwd;
  state = {
    ...state,
    activeSessionId: sessionId,
  };
  emit();
}

export function setTerminalPanelHeight(panelHeight: number) {
  const nextHeight = getClampedPanelHeight(panelHeight);
  if (nextHeight === state.panelHeight) {
    return;
  }

  persistPanelHeight(nextHeight);
  state = {
    ...state,
    panelHeight: nextHeight,
  };
  emit();
}

export function subscribeTerminalOutput(
  sessionId: string,
  listener: TerminalOutputListener,
) {
  let listenersForSession = sessionOutputListeners.get(sessionId);
  if (!listenersForSession) {
    listenersForSession = new Set();
    sessionOutputListeners.set(sessionId, listenersForSession);
  }

  listenersForSession.add(listener);

  return {
    initialOutput: sessionOutputs.get(sessionId) ?? "",
    unsubscribe: () => {
      const currentListeners = sessionOutputListeners.get(sessionId);
      currentListeners?.delete(listener);

      if (currentListeners && currentListeners.size === 0) {
        sessionOutputListeners.delete(sessionId);
      }
    },
  };
}

function subscribe(listener: () => void) {
  bindDesktopEvents();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTerminalState<T>(selector: (state: TerminalState) => T) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getTerminalState,
    getTerminalState,
  );

  return selector(snapshot);
}
