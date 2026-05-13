"use client";

import type {
  BrowserAutomationCommandEnvelope,
  BrowserAutomationCommandInput,
  BrowserAutomationCommandResult,
  BrowserAutomationConsoleLog,
  BrowserAutomationTab,
} from "@/lib/browser/automation-types";

import {
  DEFAULT_BROWSER_URL,
  createBrowserTab,
  getBrowserSidebarSnapshot,
  openBrowserSidebar,
  setActiveBrowserTab,
  setBrowserAutomationActiveTab,
  updateBrowserTab,
} from "./browser-sidebar-store";

export type BrowserAutomationWebviewElement = HTMLElement & {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  capturePage?: () => Promise<{ toDataURL?: () => string }>;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
  getTitle?: () => string;
  getURL?: () => string;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  sendInputEvent?: (event: Record<string, unknown>) => void;
  src: string;
};

const webviews = new Map<string, BrowserAutomationWebviewElement>();
const consoleLogs = new Map<string, BrowserAutomationConsoleLog[]>();
const MAX_LOGS_PER_TAB = 300;

function scopedKey(scopeId: string, tabId: string) {
  return `${scopeId}:${tabId}`;
}

function getNowIso() {
  return new Date().toISOString();
}

function getActiveTabId(scopeId: string) {
  return getBrowserSidebarSnapshot(scopeId).activeTabId;
}

function toAutomationTab(scopeId: string, tabId: string): BrowserAutomationTab {
  const state = getBrowserSidebarSnapshot(scopeId);
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) {
    throw new Error(`Browser tab not found: ${tabId}`);
  }

  const webview = webviews.get(scopedKey(scopeId, tabId));
  let url = tab.url;
  let title = tab.title;
  let canGoBack = tab.canGoBack;
  let canGoForward = tab.canGoForward;

  try {
    url = webview?.getURL?.() || url;
  } catch {}
  try {
    title = webview?.getTitle?.() || title;
  } catch {}
  try {
    canGoBack = webview?.canGoBack?.() ?? canGoBack;
    canGoForward = webview?.canGoForward?.() ?? canGoForward;
  } catch {}

  return {
    active: state.activeTabId === tabId,
    canGoBack,
    canGoForward,
    id: tab.id,
    isLoading: tab.isLoading,
    title,
    url,
  };
}

function getTargetTabId(scopeId: string, tabId?: string) {
  const targetTabId = tabId ?? getActiveTabId(scopeId);
  if (!targetTabId) {
    throw new Error("No browser tab is open.");
  }
  return targetTabId;
}

function focusAutomationTab(scopeId: string, tabId: string) {
  setActiveBrowserTab(tabId, scopeId);
  setBrowserAutomationActiveTab(tabId, scopeId);
}

async function waitForWebview(
  scopeId: string,
  tabId: string,
  timeoutMs = 8_000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const webview = webviews.get(scopedKey(scopeId, tabId));
    if (webview) return webview;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for the browser tab to mount.");
}

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("URL is required.");
  if (/^(https?|file):\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function getTabsResult(
  scopeId: string,
): Extract<BrowserAutomationCommandResult, { type: "tabs" }> {
  const state = getBrowserSidebarSnapshot(scopeId);
  return {
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => toAutomationTab(scopeId, tab.id)),
    type: "tabs",
  };
}

function buildSnapshotScript() {
  return String.raw`
(() => {
  const maxText = 90;
  const maxNodes = 180;
  const candidateSelector = (el) => {
    if (el.dataset && el.dataset.testid) return '[data-testid="' + CSS.escape(el.dataset.testid) + '"]';
    if (el.id) return '#' + CSS.escape(el.id);
    const aria = el.getAttribute('aria-label');
    if (aria) return el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
    return el.tagName.toLowerCase();
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, maxText);
  const interesting = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],[data-testid],[aria-label],summary'))
    .filter(visible)
    .slice(0, maxNodes)
    .map((el, index) => {
      const rect = el.getBoundingClientRect();
      const attrs = [];
      for (const name of ['role','aria-label','placeholder','href','type','name','value','data-testid']) {
        const value = name === 'data-testid' ? el.dataset?.testid : el.getAttribute(name);
        if (value) attrs.push(name + '="' + String(value).slice(0, 120) + '"');
      }
      return String(index + 1) + '. <' + el.tagName.toLowerCase() + ' ' + attrs.join(' ') + '> text="' + textOf(el) + '" selector="' + candidateSelector(el) + '" rect=' + Math.round(rect.x) + ',' + Math.round(rect.y) + ',' + Math.round(rect.width) + 'x' + Math.round(rect.height);
    });
  return [
    'title: ' + document.title,
    'url: ' + location.href,
    'interactive elements:',
    interesting.length ? interesting.join('\n') : '(none found)'
  ].join('\n');
})()
`;
}

async function executeJavaScript<T>(
  scopeId: string,
  tabId: string,
  code: string,
): Promise<T> {
  const webview = await waitForWebview(scopeId, tabId);
  if (typeof webview.executeJavaScript !== "function") {
    throw new Error("This browser tab does not support script execution.");
  }
  return (await webview.executeJavaScript(code, true)) as T;
}

function selectorScript(selector: string, body: string) {
  return `
(() => {
  const selector = ${JSON.stringify(selector)};
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found for selector: ' + selector);
  ${body}
})()
`;
}

async function openTab(scopeId: string, url?: string) {
  const normalizedUrl = url ? normalizeUrl(url) : DEFAULT_BROWSER_URL;
  const state = getBrowserSidebarSnapshot(scopeId);
  const tabId =
    state.tabs.length === 0
      ? openBrowserSidebar(normalizedUrl, scopeId)
      : createBrowserTab(normalizedUrl, scopeId);

  if (!tabId) {
    throw new Error("Unable to create browser tab.");
  }

  setActiveBrowserTab(tabId, scopeId);
  setBrowserAutomationActiveTab(tabId, scopeId);
  if (normalizedUrl !== DEFAULT_BROWSER_URL) {
    await waitForWebview(scopeId, tabId);
  }
  return toAutomationTab(scopeId, tabId);
}

async function navigateTab(scopeId: string, tabId: string, url: string) {
  const normalizedUrl = normalizeUrl(url);
  updateBrowserTab(
    tabId,
    {
      isLoading: normalizedUrl !== DEFAULT_BROWSER_URL,
      title:
        normalizedUrl === DEFAULT_BROWSER_URL ? "Start Page" : "Loading...",
      url: normalizedUrl,
    },
    scopeId,
  );
  focusAutomationTab(scopeId, tabId);

  if (normalizedUrl !== DEFAULT_BROWSER_URL) {
    const webview = await waitForWebview(scopeId, tabId);
    webview.src = normalizedUrl;
  }

  return toAutomationTab(scopeId, tabId);
}

export function registerBrowserAutomationWebview(
  scopeId: string,
  tabId: string,
  webview: BrowserAutomationWebviewElement | null,
  previousWebview?: BrowserAutomationWebviewElement | null,
) {
  const key = scopedKey(scopeId, tabId);
  if (webview) {
    webviews.set(key, webview);
    return;
  }

  if (!previousWebview || webviews.get(key) === previousWebview) {
    webviews.delete(key);
  }
}

export function recordBrowserAutomationConsoleLog(
  scopeId: string,
  tabId: string,
  event: {
    level?: string;
    message?: string;
  },
) {
  const level =
    event.level === "debug" ||
    event.level === "info" ||
    event.level === "log" ||
    event.level === "warn" ||
    event.level === "error"
      ? event.level
      : "log";
  const key = scopedKey(scopeId, tabId);
  const logs = consoleLogs.get(key) ?? [];
  logs.push({
    level,
    message: event.message ?? "",
    timestamp: getNowIso(),
    url: toAutomationTab(scopeId, tabId).url || null,
  });
  if (logs.length > MAX_LOGS_PER_TAB) {
    logs.splice(0, logs.length - MAX_LOGS_PER_TAB);
  }
  consoleLogs.set(key, logs);
}

export async function executeBrowserAutomationCommand(
  envelope: BrowserAutomationCommandEnvelope,
): Promise<BrowserAutomationCommandResult> {
  const command = envelope.command as BrowserAutomationCommandInput;
  const scopeId = envelope.threadId;

  switch (command.type) {
    case "tabs":
      return getTabsResult(scopeId);
    case "open":
      return { tab: await openTab(scopeId, command.url), type: "tab" };
    case "navigate": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      return {
        tab: await navigateTab(scopeId, tabId, command.url),
        type: "tab",
      };
    }
    case "back": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const webview = await waitForWebview(scopeId, tabId);
      webview.goBack?.();
      return { tab: toAutomationTab(scopeId, tabId), type: "tab" };
    }
    case "forward": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const webview = await waitForWebview(scopeId, tabId);
      webview.goForward?.();
      return { tab: toAutomationTab(scopeId, tabId), type: "tab" };
    }
    case "reload": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const webview = await waitForWebview(scopeId, tabId);
      updateBrowserTab(tabId, { isLoading: true }, scopeId);
      webview.reload?.();
      return { tab: toAutomationTab(scopeId, tabId), type: "tab" };
    }
    case "snapshot": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const content = await executeJavaScript<string>(
        scopeId,
        tabId,
        buildSnapshotScript(),
      );
      const tab = toAutomationTab(scopeId, tabId);
      return {
        activeTabId: tabId,
        content,
        tab,
        title: tab.title,
        type: "snapshot",
        url: tab.url,
      };
    }
    case "screenshot": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const webview = await waitForWebview(scopeId, tabId);
      const image = await webview.capturePage?.();
      const dataUrl = image?.toDataURL?.();
      if (!dataUrl) {
        throw new Error("This browser tab does not support screenshots.");
      }
      return {
        dataUrl,
        tab: toAutomationTab(scopeId, tabId),
        type: "screenshot",
      };
    }
    case "click": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      if (command.selector) {
        await executeJavaScript(
          scopeId,
          tabId,
          selectorScript(
            command.selector,
            "el.scrollIntoView({ block: 'center', inline: 'center' }); el.click(); return true;",
          ),
        );
      } else {
        await executeJavaScript(
          scopeId,
          tabId,
          `
(() => {
  const el = document.elementFromPoint(${command.x}, ${command.y});
  if (!el) throw new Error('No element found at coordinates.');
  el.click();
  return true;
})()
`,
        );
      }
      return {
        message: "Clicked browser page.",
        tab: toAutomationTab(scopeId, tabId),
        type: "ok",
      };
    }
    case "fill": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      await executeJavaScript(
        scopeId,
        tabId,
        selectorScript(
          command.selector,
          `
el.scrollIntoView({ block: 'center', inline: 'center' });
el.focus();
el.value = ${JSON.stringify(command.value)};
el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(command.value)} }));
el.dispatchEvent(new Event('change', { bubbles: true }));
return true;
`,
        ),
      );
      return {
        message: "Filled browser field.",
        tab: toAutomationTab(scopeId, tabId),
        type: "ok",
      };
    }
    case "press": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const webview = await waitForWebview(scopeId, tabId);
      if (command.selector) {
        await executeJavaScript(
          scopeId,
          tabId,
          selectorScript(
            command.selector,
            "el.scrollIntoView({ block: 'center', inline: 'center' }); el.focus(); return true;",
          ),
        );
      }
      webview.sendInputEvent?.({ keyCode: command.key, type: "keyDown" });
      webview.sendInputEvent?.({ keyCode: command.key, type: "keyUp" });
      return {
        message: `Pressed ${command.key}.`,
        tab: toAutomationTab(scopeId, tabId),
        type: "ok",
      };
    }
    case "console_logs": {
      const tabId = getTargetTabId(scopeId, command.tabId);
      focusAutomationTab(scopeId, tabId);
      const levels = new Set(command.levels ?? []);
      const limit = command.limit ?? 50;
      const logs = (consoleLogs.get(scopedKey(scopeId, tabId)) ?? [])
        .filter((log) => levels.size === 0 || levels.has(log.level))
        .slice(-limit);
      return {
        logs,
        tab: toAutomationTab(scopeId, tabId),
        type: "console_logs",
      };
    }
  }
}
