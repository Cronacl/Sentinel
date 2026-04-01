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
  tabs: BrowserTab[];
};

export const DEFAULT_BROWSER_URL = "about:blank";

const DEFAULT_STATE: BrowserSidebarState = {
  activeTabId: null,
  tabs: [],
};

let state: BrowserSidebarState = DEFAULT_STATE;
let snapshot: BrowserSidebarState = DEFAULT_STATE;
const listeners = new Set<() => void>();

let nextTabId = 1;

function getInitialTabTitle(url: string) {
  return url === DEFAULT_BROWSER_URL ? "Start Page" : "New Tab";
}

function emit() {
  listeners.forEach((listener) => listener());
}

function syncSnapshot() {
  snapshot = { ...state };
}

function generateTabId() {
  return `browser-tab-${nextTabId++}`;
}

export function openBrowserSidebar(initialUrl = DEFAULT_BROWSER_URL) {
  if (state.tabs.length > 0) {
    return;
  }

  const id = generateTabId();
  state = {
    activeTabId: id,
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
}

export function closeBrowserSidebarState() {
  if (state.tabs.length === 0 && state.activeTabId === null) {
    return;
  }

  state = DEFAULT_STATE;
  syncSnapshot();
  emit();
}

export function createBrowserTab(url = DEFAULT_BROWSER_URL) {
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
    tabs: [...state.tabs, newTab],
  };
  syncSnapshot();
  emit();
}

export function closeBrowserTab(tabId: string) {
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
    tabs: nextTabs,
  };
  syncSnapshot();
  emit();
}

export function setActiveBrowserTab(tabId: string) {
  if (state.activeTabId === tabId) return;
  if (!state.tabs.some((t) => t.id === tabId)) return;

  state = { ...state, activeTabId: tabId };
  syncSnapshot();
  emit();
}

export function updateBrowserTab(
  tabId: string,
  patch: Partial<Omit<BrowserTab, "id">>,
) {
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
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getBrowserSidebarState() {
  return snapshot;
}

export function useBrowserSidebarState() {
  return useSyncExternalStore(
    subscribe,
    getBrowserSidebarState,
    getBrowserSidebarState,
  );
}
