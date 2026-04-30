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
  tabs: BrowserTab[];
};

export const DEFAULT_BROWSER_URL = "about:blank";
const BROWSER_SIDEBAR_STORAGE_KEY = "sentinel.browser-sidebar-state.v1";

const DEFAULT_STATE: BrowserSidebarState = {
  activeTabId: null,
  automationActiveTabId: null,
  tabs: [],
};

let state: BrowserSidebarState = DEFAULT_STATE;
let snapshot: BrowserSidebarState = DEFAULT_STATE;
const listeners = new Set<() => void>();
let hasHydratedPersistedState = false;
let browserSessionPersistenceEnabled = true;

let nextTabId = 1;

function getInitialTabTitle(url: string) {
  return url === DEFAULT_BROWSER_URL ? "Start Page" : "New Tab";
}

function emit() {
  listeners.forEach((listener) => listener());
}

function syncSnapshot() {
  snapshot = { ...state };
  persistBrowserSidebarState();
}

function generateTabId() {
  return `browser-tab-${nextTabId++}`;
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
    const raw = window.localStorage.getItem(BROWSER_SIDEBAR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STATE;
    }

    const parsed = JSON.parse(raw) as {
      activeTabId?: unknown;
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

  if (state.tabs.length === 0) {
    clearPersistedBrowserSidebarState();
    return;
  }

  try {
    window.localStorage.setItem(
      BROWSER_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        activeTabId: state.activeTabId,
        tabs: state.tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
        })),
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
  state = persistedState;
  snapshot = persistedState;
  nextTabId = getNextTabIdSeed(persistedState.tabs);
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

export function openBrowserSidebar(initialUrl = DEFAULT_BROWSER_URL) {
  hydrateBrowserSidebarState();

  if (state.tabs.length > 0) {
    return state.activeTabId;
  }

  const id = generateTabId();
  state = {
    activeTabId: id,
    automationActiveTabId: null,
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
  };
  syncSnapshot();
  emit();
  return id;
}

export function closeBrowserSidebarState() {
  hydrateBrowserSidebarState();

  if (browserSessionPersistenceEnabled) {
    persistBrowserSidebarState();
    return;
  }

  if (state.tabs.length === 0 && state.activeTabId === null) {
    return;
  }

  state = DEFAULT_STATE;
  syncSnapshot();
  emit();
}

export function createBrowserTab(url = DEFAULT_BROWSER_URL) {
  hydrateBrowserSidebarState();

  const id = generateTabId();
  const newTab: BrowserTab = {
    canGoBack: false,
    canGoForward: false,
    id,
    isLoading: url !== DEFAULT_BROWSER_URL,
    title: getInitialTabTitle(url),
    url,
  };

  state = {
    activeTabId: id,
    automationActiveTabId: state.automationActiveTabId,
    tabs: [...state.tabs, newTab],
  };
  syncSnapshot();
  emit();
  return id;
}

export function closeBrowserTab(tabId: string) {
  hydrateBrowserSidebarState();

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

  state = {
    activeTabId: nextActiveTabId,
    automationActiveTabId:
      state.automationActiveTabId === tabId
        ? null
        : state.automationActiveTabId,
    tabs: nextTabs,
  };
  syncSnapshot();
  emit();
}

export function setActiveBrowserTab(tabId: string) {
  hydrateBrowserSidebarState();

  if (state.activeTabId === tabId) return;
  if (!state.tabs.some((t) => t.id === tabId)) return;

  state = { ...state, activeTabId: tabId };
  syncSnapshot();
  emit();
}

export function setBrowserAutomationActiveTab(tabId: string | null) {
  hydrateBrowserSidebarState();

  const nextTabId =
    tabId && state.tabs.some((tab) => tab.id === tabId) ? tabId : null;
  if (state.automationActiveTabId === nextTabId) return;

  state = { ...state, automationActiveTabId: nextTabId };
  syncSnapshot();
  emit();
}

export function updateBrowserTab(
  tabId: string,
  patch: Partial<Omit<BrowserTab, "id">>,
) {
  hydrateBrowserSidebarState();

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
  state = { ...state, tabs: nextTabs };
  syncSnapshot();
  emit();
}

function subscribe(listener: () => void) {
  hydrateBrowserSidebarState();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getBrowserSidebarState() {
  hydrateBrowserSidebarState();
  return snapshot;
}

export function getBrowserSidebarSnapshot() {
  return getBrowserSidebarState();
}

export function useBrowserSidebarState() {
  return useSyncExternalStore(
    subscribe,
    getBrowserSidebarState,
    getBrowserSidebarState,
  );
}
