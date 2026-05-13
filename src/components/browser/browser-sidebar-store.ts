"use client";

import { useSyncExternalStore } from "react";

export type BrowserTab = {
  canGoBack: boolean;
  canGoForward: boolean;
  id: string;
  isLoading: boolean;
  title: string;
  url: string;
};

export type BrowserSidebarState = {
  activeTabId: string | null;
  automationActiveTabId: string | null;
  devicePreset: string;
  deviceToolbarEnabled: boolean;
  deviceWidth: number | null;
  tabs: BrowserTab[];
};

export const DEFAULT_BROWSER_URL = "about:blank";
export const GLOBAL_BROWSER_SCOPE_ID = "global";
const BROWSER_SIDEBAR_STORAGE_KEY = "sentinel.browser-sidebar-state.v2";
const LEGACY_BROWSER_SIDEBAR_STORAGE_KEY = "sentinel.browser-sidebar-state.v1";

const DEFAULT_STATE: BrowserSidebarState = {
  activeTabId: null,
  automationActiveTabId: null,
  devicePreset: "responsive",
  deviceToolbarEnabled: false,
  deviceWidth: null,
  tabs: [],
};

let states = new Map<string, BrowserSidebarState>();
let snapshots = new Map<string, BrowserSidebarState>();
let scopesSnapshot: Array<{ scopeId: string; state: BrowserSidebarState }> = [];
const listeners = new Set<() => void>();
let hasHydratedPersistedState = false;
let browserSessionPersistenceEnabled = true;
let visibleBrowserScopeId: string | null = null;

const nextTabIdByScope = new Map<string, number>();

function getInitialTabTitle(url: string) {
  return url === DEFAULT_BROWSER_URL ? "Start Page" : "New Tab";
}

function normalizeScopeId(scopeId?: string | null) {
  const trimmed = scopeId?.trim();
  return trimmed || GLOBAL_BROWSER_SCOPE_ID;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function syncScopesSnapshot() {
  scopesSnapshot = Array.from(snapshots.entries()).map(([scopeId, state]) => ({
    scopeId,
    state,
  }));
}

function getScopeState(scopeId?: string | null) {
  hydrateBrowserSidebarState();
  const normalizedScopeId = normalizeScopeId(scopeId);
  let state = states.get(normalizedScopeId);
  if (!state) {
    state = DEFAULT_STATE;
    states.set(normalizedScopeId, state);
    snapshots.set(normalizedScopeId, state);
    nextTabIdByScope.set(normalizedScopeId, getNextTabIdSeed(state.tabs));
    syncScopesSnapshot();
  }
  return state;
}

function setScopeState(scopeId: string, nextState: BrowserSidebarState) {
  states.set(scopeId, nextState);
  snapshots.set(scopeId, { ...nextState });
  syncScopesSnapshot();
  persistBrowserSidebarState();
}

function syncSnapshot(scopeId: string) {
  const state = states.get(scopeId) ?? DEFAULT_STATE;
  snapshots.set(scopeId, { ...state });
  syncScopesSnapshot();
  persistBrowserSidebarState();
}

function generateTabId(scopeId: string) {
  const nextTabId = nextTabIdByScope.get(scopeId) ?? 1;
  nextTabIdByScope.set(scopeId, nextTabId + 1);
  return `browser-tab-${nextTabId}`;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

function getNextTabIdSeed(tabs: BrowserTab[]) {
  const maxId = tabs.reduce((currentMax, tab) => {
    const match = /^browser-tab-(\d+)$/.exec(tab.id);
    if (!match) return currentMax;

    const numericId = Number.parseInt(match[1] ?? "0", 10);
    return Number.isFinite(numericId)
      ? Math.max(currentMax, numericId)
      : currentMax;
  }, 0);

  return maxId + 1;
}

function normalizePersistedTab(value: unknown): BrowserTab | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const tab = value as Record<string, unknown>;
  if (typeof tab.id !== "string" || typeof tab.url !== "string") {
    return null;
  }

  return {
    canGoBack: false,
    canGoForward: false,
    id: tab.id,
    isLoading: false,
    title:
      typeof tab.title === "string" && tab.title.trim().length > 0
        ? tab.title
        : getInitialTabTitle(tab.url),
    url: tab.url,
  };
}

function readPersistedBrowserSidebarState(): BrowserSidebarState {
  if (!canUseLocalStorage()) {
    return DEFAULT_STATE;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_BROWSER_SIDEBAR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STATE;
    }

    const parsed = JSON.parse(raw) as {
      activeTabId?: unknown;
      devicePreset?: unknown;
      deviceToolbarEnabled?: unknown;
      deviceWidth?: unknown;
      tabs?: unknown;
    };
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
          .map(normalizePersistedTab)
          .filter((tab): tab is BrowserTab => tab !== null)
      : [];

    if (tabs.length === 0) {
      return DEFAULT_STATE;
    }

    const activeTabId =
      typeof parsed.activeTabId === "string" &&
      tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : tabs[0]!.id;

    return {
      activeTabId,
      automationActiveTabId: null,
      devicePreset:
        typeof parsed.devicePreset === "string"
          ? parsed.devicePreset
          : "responsive",
      deviceToolbarEnabled: parsed.deviceToolbarEnabled === true,
      deviceWidth:
        typeof parsed.deviceWidth === "number" && parsed.deviceWidth > 0
          ? parsed.deviceWidth
          : null,
      tabs,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function clearPersistedBrowserSidebarState() {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(BROWSER_SIDEBAR_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function persistBrowserSidebarState() {
  if (!browserSessionPersistenceEnabled) {
    clearPersistedBrowserSidebarState();
    return;
  }

  if (!canUseLocalStorage()) {
    return;
  }

  const scopes = Array.from(states.entries()).filter(
    ([, state]) => state.tabs.length > 0,
  );

  if (scopes.length === 0) {
    clearPersistedBrowserSidebarState();
    return;
  }

  try {
    window.localStorage.setItem(
      BROWSER_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        scopes: Object.fromEntries(
          scopes.map(([scopeId, state]) => [
            scopeId,
            {
              activeTabId: state.activeTabId,
              devicePreset: state.devicePreset,
              deviceToolbarEnabled: state.deviceToolbarEnabled,
              deviceWidth: state.deviceWidth,
              tabs: state.tabs.map((tab) => ({
                id: tab.id,
                title: tab.title,
                url: tab.url,
              })),
            },
          ]),
        ),
      }),
    );
  } catch {
    // ignore storage failures
  }
}

function hydrateBrowserSidebarState() {
  if (hasHydratedPersistedState) {
    return;
  }

  hasHydratedPersistedState = true;
  const persistedState = readPersistedBrowserSidebarState();
  states = new Map([[GLOBAL_BROWSER_SCOPE_ID, persistedState]]);
  snapshots = new Map([[GLOBAL_BROWSER_SCOPE_ID, persistedState]]);
  syncScopesSnapshot();
  nextTabIdByScope.set(
    GLOBAL_BROWSER_SCOPE_ID,
    getNextTabIdSeed(persistedState.tabs),
  );

  if (canUseLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(BROWSER_SIDEBAR_STORAGE_KEY);
      const parsed = raw
        ? (JSON.parse(raw) as { scopes?: Record<string, unknown> })
        : null;
      if (parsed?.scopes && typeof parsed.scopes === "object") {
        states = new Map();
        snapshots = new Map();
        nextTabIdByScope.clear();
        for (const [scopeId, value] of Object.entries(parsed.scopes)) {
          const persistedScope = readPersistedScopeState(value);
          if (persistedScope.tabs.length === 0) continue;
          const normalizedScopeId = normalizeScopeId(scopeId);
          states.set(normalizedScopeId, persistedScope);
          snapshots.set(normalizedScopeId, persistedScope);
          nextTabIdByScope.set(
            normalizedScopeId,
            getNextTabIdSeed(persistedScope.tabs),
          );
        }
        if (states.size === 0) {
          states.set(GLOBAL_BROWSER_SCOPE_ID, DEFAULT_STATE);
          snapshots.set(GLOBAL_BROWSER_SCOPE_ID, DEFAULT_STATE);
          nextTabIdByScope.set(GLOBAL_BROWSER_SCOPE_ID, 1);
        }
        syncScopesSnapshot();
      }
    } catch {
      // ignore malformed v2 state and keep the legacy/global fallback
    }
  }
}

function readPersistedScopeState(value: unknown): BrowserSidebarState {
  if (!value || typeof value !== "object") {
    return DEFAULT_STATE;
  }

  const parsed = value as {
    activeTabId?: unknown;
    devicePreset?: unknown;
    deviceToolbarEnabled?: unknown;
    deviceWidth?: unknown;
    tabs?: unknown;
  };
  const tabs = Array.isArray(parsed.tabs)
    ? parsed.tabs
        .map(normalizePersistedTab)
        .filter((tab): tab is BrowserTab => tab !== null)
    : [];

  if (tabs.length === 0) {
    return DEFAULT_STATE;
  }

  const activeTabId =
    typeof parsed.activeTabId === "string" &&
    tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]!.id;

  return {
    activeTabId,
    automationActiveTabId: null,
    devicePreset:
      typeof parsed.devicePreset === "string"
        ? parsed.devicePreset
        : "responsive",
    deviceToolbarEnabled: parsed.deviceToolbarEnabled === true,
    deviceWidth:
      typeof parsed.deviceWidth === "number" && parsed.deviceWidth > 0
        ? parsed.deviceWidth
        : null,
    tabs,
  };
}

export function setBrowserSessionPersistenceEnabled(enabled: boolean) {
  hydrateBrowserSidebarState();
  browserSessionPersistenceEnabled = enabled;

  if (enabled) {
    persistBrowserSidebarState();
    return;
  }

  clearPersistedBrowserSidebarState();
}

export function openBrowserSidebar(
  initialUrl = DEFAULT_BROWSER_URL,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (state.tabs.length > 0) {
    return state.activeTabId;
  }

  const id = generateTabId(normalizedScopeId);
  setScopeState(normalizedScopeId, {
    activeTabId: id,
    automationActiveTabId: null,
    devicePreset: state.devicePreset,
    deviceToolbarEnabled: state.deviceToolbarEnabled,
    deviceWidth: state.deviceWidth,
    tabs: [
      {
        canGoBack: false,
        canGoForward: false,
        id,
        isLoading: initialUrl !== DEFAULT_BROWSER_URL,
        title: getInitialTabTitle(initialUrl),
        url: initialUrl,
      },
    ],
  });
  emit();
  return id;
}

export function closeBrowserSidebarState(scopeId?: string | null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (browserSessionPersistenceEnabled) {
    persistBrowserSidebarState();
    return;
  }

  if (state.tabs.length === 0 && state.activeTabId === null) {
    return;
  }

  setScopeState(normalizedScopeId, DEFAULT_STATE);
  emit();
}

export function createBrowserTab(
  url = DEFAULT_BROWSER_URL,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  const id = generateTabId(normalizedScopeId);
  const newTab: BrowserTab = {
    canGoBack: false,
    canGoForward: false,
    id,
    isLoading: url !== DEFAULT_BROWSER_URL,
    title: getInitialTabTitle(url),
    url,
  };

  setScopeState(normalizedScopeId, {
    ...state,
    activeTabId: id,
    automationActiveTabId: state.automationActiveTabId,
    tabs: [...state.tabs, newTab],
  });
  emit();
  return id;
}

export function closeBrowserTab(tabId: string, scopeId?: string | null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) return;

  const nextTabs = state.tabs.filter((t) => t.id !== tabId);

  let nextActiveTabId = state.activeTabId;
  if (state.activeTabId === tabId) {
    if (nextTabs.length === 0) {
      nextActiveTabId = null;
    } else {
      const nextIndex = Math.min(tabIndex, nextTabs.length - 1);
      nextActiveTabId = nextTabs[nextIndex]!.id;
    }
  }

  setScopeState(normalizedScopeId, {
    ...state,
    activeTabId: nextActiveTabId,
    automationActiveTabId:
      state.automationActiveTabId === tabId
        ? null
        : state.automationActiveTabId,
    tabs: nextTabs,
  });
  emit();
}

export function setActiveBrowserTab(tabId: string, scopeId?: string | null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (state.activeTabId === tabId) return;
  if (!state.tabs.some((t) => t.id === tabId)) return;

  setScopeState(normalizedScopeId, { ...state, activeTabId: tabId });
  emit();
}

export function setBrowserAutomationActiveTab(
  tabId: string | null,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  const nextTabId =
    tabId && state.tabs.some((tab) => tab.id === tabId) ? tabId : null;
  if (state.automationActiveTabId === nextTabId) return;

  setScopeState(normalizedScopeId, {
    ...state,
    automationActiveTabId: nextTabId,
  });
  emit();
}

export function setDeviceToolbarEnabled(
  enabled: boolean,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (state.deviceToolbarEnabled === enabled) return;

  setScopeState(normalizedScopeId, { ...state, deviceToolbarEnabled: enabled });
  emit();
}

export function setDevicePreset(
  preset: string,
  width: number | null,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (state.devicePreset === preset && state.deviceWidth === width) return;

  setScopeState(normalizedScopeId, {
    ...state,
    devicePreset: preset,
    deviceWidth: width,
  });
  emit();
}

export function setDeviceWidth(width: number | null, scopeId?: string | null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  if (state.deviceWidth === width) return;

  setScopeState(normalizedScopeId, {
    ...state,
    devicePreset: "custom",
    deviceWidth: width,
  });
  emit();
}

export function updateBrowserTab(
  tabId: string,
  patch: Partial<Omit<BrowserTab, "id">>,
  scopeId?: string | null,
) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  const state = getScopeState(normalizedScopeId);

  const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex === -1) return;

  const tab = state.tabs[tabIndex]!;
  const updated = { ...tab, ...patch };

  if (
    tab.url === updated.url &&
    tab.title === updated.title &&
    tab.isLoading === updated.isLoading &&
    tab.canGoBack === updated.canGoBack &&
    tab.canGoForward === updated.canGoForward
  ) {
    return;
  }

  const nextTabs = [...state.tabs];
  nextTabs[tabIndex] = updated;
  setScopeState(normalizedScopeId, { ...state, tabs: nextTabs });
  emit();
}

function subscribe(listener: () => void) {
  hydrateBrowserSidebarState();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getBrowserSidebarState(scopeId?: string | null) {
  hydrateBrowserSidebarState();
  const normalizedScopeId = normalizeScopeId(scopeId);
  const snapshot = snapshots.get(normalizedScopeId);
  if (snapshot) return snapshot;

  snapshots.set(normalizedScopeId, DEFAULT_STATE);
  states.set(normalizedScopeId, DEFAULT_STATE);
  nextTabIdByScope.set(normalizedScopeId, 1);
  syncScopesSnapshot();
  return DEFAULT_STATE;
}

export function getBrowserSidebarSnapshot(scopeId?: string | null) {
  return getBrowserSidebarState(scopeId);
}

export function getBrowserSidebarScopes() {
  hydrateBrowserSidebarState();
  return Array.from(states.keys());
}

export function getBrowserSidebarScopesSnapshot() {
  hydrateBrowserSidebarState();
  return scopesSnapshot;
}

export function getVisibleBrowserScopeId() {
  return visibleBrowserScopeId;
}

export function setVisibleBrowserScopeId(scopeId: string | null) {
  const nextScopeId = scopeId ? normalizeScopeId(scopeId) : null;
  if (visibleBrowserScopeId === nextScopeId) return;
  visibleBrowserScopeId = nextScopeId;
  emit();
}

export function useBrowserSidebarState(scopeId?: string | null) {
  const normalizedScopeId = normalizeScopeId(scopeId);
  return useSyncExternalStore(
    subscribe,
    () => getBrowserSidebarState(normalizedScopeId),
    () => getBrowserSidebarState(normalizedScopeId),
  );
}

export function useBrowserSidebarScopesSnapshot() {
  return useSyncExternalStore(
    subscribe,
    getBrowserSidebarScopesSnapshot,
    getBrowserSidebarScopesSnapshot,
  );
}

export function useVisibleBrowserScopeId() {
  return useSyncExternalStore(
    subscribe,
    getVisibleBrowserScopeId,
    getVisibleBrowserScopeId,
  );
}

export function resetBrowserSidebarStoreForTests() {
  states = new Map([[GLOBAL_BROWSER_SCOPE_ID, DEFAULT_STATE]]);
  snapshots = new Map([[GLOBAL_BROWSER_SCOPE_ID, DEFAULT_STATE]]);
  syncScopesSnapshot();
  nextTabIdByScope.clear();
  nextTabIdByScope.set(GLOBAL_BROWSER_SCOPE_ID, 1);
  hasHydratedPersistedState = true;
  browserSessionPersistenceEnabled = true;
  visibleBrowserScopeId = null;
  emit();
}
