"use client";

import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight02Icon,
  Cancel01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BorderBeam } from "border-beam";
import {
  Button,
  CloseButton,
  Input,
  ScrollShadow,
  Tooltip,
} from "@heroui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { getDesktopWindowControlsInset } from "@/components/shell/sidebar-window-chrome";
import { useRightSidebar } from "@/components/shell/shell-context";
import { getDesktopApi } from "@/lib/desktop/client";

import {
  DEFAULT_BROWSER_URL,
  closeBrowserTab,
  createBrowserTab,
  setActiveBrowserTab,
  updateBrowserTab,
  useBrowserSidebarState,
  type BrowserTab,
} from "./browser-sidebar-store";
import {
  recordBrowserAutomationConsoleLog,
  registerBrowserAutomationWebview,
  type BrowserAutomationWebviewElement,
} from "./browser-automation";

type BrowserWebviewElement = BrowserAutomationWebviewElement & {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  src: string;
  stop: () => void;
};

type BrowserWebviewEvent = Event & {
  errorCode?: number;
  errorDescription?: string;
  isMainFrame?: boolean;
  level?: string;
  message?: string;
  title?: string;
  url?: string;
  validatedURL?: string;
};

const TAB_MOTION_TRANSITION = {
  opacity: {
    duration: 0.16,
    ease: [0.32, 0.72, 0, 1] as const,
  },
  scale: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  width: {
    duration: 0.24,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  x: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
  },
  layout: {
    duration: 0.24,
    ease: [0.16, 1, 0.3, 1] as const,
  },
};

function hasWebviewNavigationApi(
  webview: BrowserWebviewElement | null,
): webview is BrowserWebviewElement {
  return Boolean(
    webview &&
    typeof webview.canGoBack === "function" &&
    typeof webview.canGoForward === "function" &&
    typeof webview.getURL === "function" &&
    typeof webview.goBack === "function" &&
    typeof webview.goForward === "function" &&
    typeof webview.reload === "function" &&
    typeof webview.stop === "function",
  );
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function formatAddressInput(url: string) {
  return url === DEFAULT_BROWSER_URL ? "" : url;
}

function getTabHostname(url: string) {
  if (url === DEFAULT_BROWSER_URL) {
    return "Start Page";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Untitled";
  }
}

function getTabTitle(tab: BrowserTab) {
  if (tab.title && tab.title !== "Untitled") {
    return tab.title;
  }

  return getTabHostname(tab.url);
}

function getFaviconUrl(url: string) {
  if (url === DEFAULT_BROWSER_URL) {
    return null;
  }

  try {
    return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`;
  } catch {
    return null;
  }
}

function safelyGetWebviewUrl(webview: BrowserWebviewElement | null) {
  if (!hasWebviewNavigationApi(webview)) {
    return null;
  }

  try {
    const nextUrl = webview.getURL();
    return nextUrl || null;
  } catch {
    return null;
  }
}

function safelyGetWebviewHistoryState(webview: BrowserWebviewElement | null) {
  if (!hasWebviewNavigationApi(webview)) {
    return { canGoBack: false, canGoForward: false };
  }

  try {
    return {
      canGoBack: webview.canGoBack(),
      canGoForward: webview.canGoForward(),
    };
  } catch {
    return { canGoBack: false, canGoForward: false };
  }
}

function syncWebviewNavigationState(
  tabId: string,
  webview: BrowserWebviewElement,
  nextUrl?: string,
) {
  if (!hasWebviewNavigationApi(webview)) {
    updateBrowserTab(tabId, {
      canGoBack: false,
      canGoForward: false,
      url: nextUrl ?? DEFAULT_BROWSER_URL,
    });
    return;
  }

  const resolvedUrl = nextUrl ?? safelyGetWebviewUrl(webview);
  const historyState = safelyGetWebviewHistoryState(webview);
  updateBrowserTab(tabId, {
    canGoBack: historyState.canGoBack,
    canGoForward: historyState.canGoForward,
    url: resolvedUrl ?? DEFAULT_BROWSER_URL,
  });
}

function BrowserAutomationViewportFrame({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="sentinel-browser-frame pointer-events-none absolute inset-0"
    />
  );
}

function BrowserViewport({
  isAutomationActive,
  isActive,
  onRegisterWebview,
  tab,
}: {
  isAutomationActive: boolean;
  isActive: boolean;
  onRegisterWebview: (
    tabId: string,
    webview: BrowserWebviewElement | null,
  ) => void;
  tab: BrowserTab;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<BrowserWebviewElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const webview = webviewRef.current;

    if (!container || !webview || tab.url === DEFAULT_BROWSER_URL) {
      return;
    }

    let frameId = 0;
    const syncSize = () => {
      frameId = window.requestAnimationFrame(() => {
        const nextContainer = containerRef.current;
        const nextWebview = webviewRef.current;

        if (!nextContainer || !nextWebview) {
          return;
        }

        nextWebview.style.width = `${nextContainer.clientWidth}px`;
        nextWebview.style.height = `${nextContainer.clientHeight}px`;
      });
    };

    syncSize();

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });
    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [isActive, tab.url]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!hasWebviewNavigationApi(webview) || tab.url === DEFAULT_BROWSER_URL) {
      return;
    }

    const handleLoadStart = () => {
      updateBrowserTab(tab.id, { isLoading: true });
    };
    const handleLoadStop = () => {
      updateBrowserTab(tab.id, { isLoading: false });
      syncWebviewNavigationState(tab.id, webview);
    };
    const handleNavigate = (event: Event) => {
      const nextUrl = (event as BrowserWebviewEvent).url;
      updateBrowserTab(tab.id, { isLoading: false });
      syncWebviewNavigationState(tab.id, webview, nextUrl);
    };
    const handleTitleUpdate = (event: Event) => {
      const nextTitle = (event as BrowserWebviewEvent).title?.trim();
      updateBrowserTab(tab.id, {
        title: nextTitle || getTabHostname(tab.url),
      });
    };
    const handleFailLoad = (event: Event) => {
      const browserEvent = event as BrowserWebviewEvent;
      if (browserEvent.errorCode === -3 || browserEvent.isMainFrame === false) {
        return;
      }

      updateBrowserTab(tab.id, {
        isLoading: false,
        title: getTabHostname(browserEvent.validatedURL ?? tab.url),
        url: browserEvent.validatedURL ?? tab.url,
      });
      syncWebviewNavigationState(
        tab.id,
        webview,
        browserEvent.validatedURL ?? tab.url,
      );
    };
    const handleConsoleMessage = (event: Event) => {
      const browserEvent = event as BrowserWebviewEvent;
      recordBrowserAutomationConsoleLog(tab.id, {
        level: browserEvent.level,
        message: browserEvent.message,
      });
    };

    webview.addEventListener("did-start-loading", handleLoadStart);
    webview.addEventListener("did-stop-loading", handleLoadStop);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("dom-ready", handleLoadStop);
    webview.addEventListener("page-title-updated", handleTitleUpdate);
    webview.addEventListener("did-fail-load", handleFailLoad);
    webview.addEventListener("console-message", handleConsoleMessage);

    return () => {
      webview.removeEventListener("did-start-loading", handleLoadStart);
      webview.removeEventListener("did-stop-loading", handleLoadStop);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("dom-ready", handleLoadStop);
      webview.removeEventListener("page-title-updated", handleTitleUpdate);
      webview.removeEventListener("did-fail-load", handleFailLoad);
      webview.removeEventListener("console-message", handleConsoleMessage);
    };
  }, [tab.id, tab.url]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!hasWebviewNavigationApi(webview) || tab.url === DEFAULT_BROWSER_URL) {
      return;
    }

    const currentUrl = safelyGetWebviewUrl(webview);
    if (currentUrl !== tab.url && webview.src !== tab.url) {
      webview.src = tab.url;
    }
  }, [tab.url]);

  const setWebviewRef = useCallback(
    (node: HTMLElement | null) => {
      const nextWebview = node as BrowserWebviewElement | null;
      webviewRef.current = nextWebview;
      registerBrowserAutomationWebview(tab.id, nextWebview);
      onRegisterWebview(tab.id, nextWebview);
    },
    [onRegisterWebview, tab.id],
  );

  if (tab.url === DEFAULT_BROWSER_URL) {
    return (
      <div className={`absolute inset-0 ${isActive ? "block" : "hidden"}`} />
    );
  }

  const WebviewTag: any = "webview";

  return (
    <div
      className={`absolute inset-0 ${isActive ? "block" : "hidden"} min-h-0 min-w-0`}
    >
      <BrowserAutomationViewportFrame active={isAutomationActive} />
      <div ref={containerRef} className="absolute inset-0 flex min-h-0 min-w-0">
        <WebviewTag
          allowpopups="true"
          className="min-h-0 min-w-0 flex-1 border-0 bg-transparent"
          partition="persist:sentinel-browser"
          ref={setWebviewRef}
          src={tab.url}
          style={{
            display: "flex",
            height: "100%",
            width: "100%",
          }}
        />
      </div>
    </div>
  );
}

function BrowserTabButton({
  isAutomationActive,
  isActive,
  onClose,
  onSelect,
  tabRef,
  tab,
}: {
  isAutomationActive: boolean;
  isActive: boolean;
  onClose: () => void;
  onSelect: () => void;
  tabRef: (node: HTMLDivElement | null) => void;
  tab: BrowserTab;
}) {
  const faviconUrl = getFaviconUrl(tab.url);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, width: "auto", x: 0 }}
      className="shrink-0 overflow-hidden"
      exit={{ opacity: 0, scale: 0.94, width: 0, x: -10 }}
      initial={{ opacity: 0, scale: 0.94, width: 0, x: 10 }}
      layout="position"
      ref={tabRef}
      style={{ originX: 0.5 }}
      transition={TAB_MOTION_TRANSITION}
    >
      <BorderBeam
        active={isAutomationActive}
        borderRadius={999}
        brightness={1.02}
        colorVariant="ocean"
        duration={6.4}
        saturation={0.88}
        size="sm"
        strength={0.32}
        theme="dark"
      >
        <div
          className={`group relative flex min-h-[24px] min-w-0 max-w-28 items-center rounded-full border p-[1px] px-[4px] transition-[background-color,color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isActive
              ? "border-border bg-foreground/[0.04] text-foreground dark:bg-foreground/[0.06]"
              : "border-transparent text-muted hover:bg-foreground/[0.02] hover:text-foreground dark:hover:bg-foreground/[0.03]"
          }`}
        >
          <button
            aria-selected={isActive}
            className="flex h-[16px] min-w-0 flex-1 items-center justify-start gap-1 rounded-full px-[4px] py-0 text-left transition-[padding,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
            onClick={onSelect}
            style={{ fontFamily: "var(--font-display)" }}
            type="button"
          >
            {faviconUrl ? (
              <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-content2/80 text-[9px] text-foreground/80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="h-full w-full"
                  draggable={false}
                  src={faviconUrl}
                />
              </span>
            ) : null}
            <span className="min-w-0 truncate text-[10px] font-medium leading-[1.15]">
              {getTabTitle(tab)}
            </span>
          </button>
          <button
            aria-label={`Close tab ${getTabTitle(tab)}`}
            className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full transition-[opacity,background-color,color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-foreground/[0.05] hover:text-foreground active:scale-95 ${
              isActive
                ? "opacity-100 text-foreground/70"
                : "opacity-0 text-muted group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
            onClick={onClose}
            type="button"
          >
            <HugeiconsIcon color="currentColor" icon={Cancel01Icon} size={10} />
          </button>
        </div>
      </BorderBeam>
    </motion.div>
  );
}

export function BrowserSidebar() {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const rightSidebar = useRightSidebar();
  const { activeTabId, automationActiveTabId, tabs } = useBrowserSidebarState();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const [addressInput, setAddressInput] = useState(
    formatAddressInput(activeTab?.url ?? ""),
  );
  const tabButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const webviewRefs = useRef<Map<string, BrowserWebviewElement>>(new Map());
  const titleBarInset = getDesktopWindowControlsInset(platform);
  const hasLivePage = Boolean(
    activeTab?.url && activeTab.url !== DEFAULT_BROWSER_URL,
  );
  const browserChromeStyle = {
    paddingRight: titleBarInset ? titleBarInset + 14 : undefined,
  } as CSSProperties;

  useEffect(() => {
    setAddressInput(formatAddressInput(activeTab?.url ?? ""));
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const targetTabId = automationActiveTabId ?? activeTabId;
    if (!targetTabId) return;

    const frame = window.requestAnimationFrame(() => {
      tabButtonRefs.current.get(targetTabId)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, automationActiveTabId, tabs.length]);

  const registerWebview = useCallback(
    (tabId: string, webview: BrowserWebviewElement | null) => {
      if (webview) {
        webviewRefs.current.set(tabId, webview);
        return;
      }

      webviewRefs.current.delete(tabId);
    },
    [],
  );

  const handleClose = useCallback(() => {
    rightSidebar.close();
  }, [rightSidebar]);

  const handleNavigate = useCallback(
    (url: string) => {
      if (!activeTabId) return;
      const normalized = normalizeUrl(url);
      if (!normalized) return;

      setAddressInput(normalized);
      updateBrowserTab(activeTabId, {
        isLoading: normalized !== DEFAULT_BROWSER_URL,
        title:
          normalized === DEFAULT_BROWSER_URL
            ? "Start Page"
            : getTabHostname(normalized),
        url: normalized,
      });

      const webview = webviewRefs.current.get(activeTabId) ?? null;
      if (
        hasWebviewNavigationApi(webview) &&
        normalized !== DEFAULT_BROWSER_URL
      ) {
        webview.src = normalized;
      }
    },
    [activeTabId],
  );

  const handleAddressKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleNavigate(addressInput);
      }
    },
    [addressInput, handleNavigate],
  );

  const handleReload = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (hasWebviewNavigationApi(webview)) {
      updateBrowserTab(activeTabId, { isLoading: true });
      webview.reload();
    }
  }, [activeTabId]);

  const handleStop = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (hasWebviewNavigationApi(webview)) {
      webview.stop();
      updateBrowserTab(activeTabId, { isLoading: false });
    }
  }, [activeTabId]);

  const handleBack = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    const historyState = safelyGetWebviewHistoryState(webview);
    if (hasWebviewNavigationApi(webview) && historyState.canGoBack) {
      webview.goBack();
    }
  }, [activeTabId]);

  const handleForward = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    const historyState = safelyGetWebviewHistoryState(webview);
    if (hasWebviewNavigationApi(webview) && historyState.canGoForward) {
      webview.goForward();
    }
  }, [activeTabId]);

  const handleOpenExternal = useCallback(async () => {
    if (!activeTab?.url || activeTab.url === DEFAULT_BROWSER_URL) return;
    await desktop?.openExternal(activeTab.url);
  }, [activeTab?.url, desktop]);

  const handleTabSwitch = useCallback(
    (tabId: string) => {
      setActiveBrowserTab(tabId);
      const tab = tabs.find((item) => item.id === tabId);
      if (tab) {
        setAddressInput(formatAddressInput(tab.url));
      }
    },
    [tabs],
  );

  const handleNewTab = useCallback(() => {
    createBrowserTab();
    setAddressInput("");
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeBrowserTab(tabId);
      if (tabs.length <= 1) {
        handleClose();
        return;
      }

      if (tabId === activeTabId) {
        const remaining = tabs.filter((tab) => tab.id !== tabId);
        if (remaining.length > 0) {
          setAddressInput(formatAddressInput(remaining[0]!.url));
        }
      }
    },
    [activeTabId, handleClose, tabs],
  );

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header
        className="app-region-drag shrink-0 border-b border-border/40 bg-background py-0.5"
        style={browserChromeStyle}
      >
        <div className="flex min-h-9 items-center gap-2 px-2 py-1">
          <ScrollShadow
            className="app-region-no-drag min-w-0 flex-1"
            hideScrollBar
            orientation="horizontal"
          >
            <motion.div
              className="flex min-w-max items-center gap-0 pr-7"
              layout
              transition={TAB_MOTION_TRANSITION}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {tabs.map((tab) => (
                  <BrowserTabButton
                    key={tab.id}
                    isAutomationActive={tab.id === automationActiveTabId}
                    isActive={tab.id === activeTabId}
                    onClose={() => handleCloseTab(tab.id)}
                    onSelect={() => handleTabSwitch(tab.id)}
                    tab={tab}
                    tabRef={(node) => {
                      if (node) {
                        tabButtonRefs.current.set(tab.id, node);
                        return;
                      }

                      tabButtonRefs.current.delete(tab.id);
                    }}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </ScrollShadow>
          <div className="app-region-no-drag flex items-center gap-1">
            <Tooltip.Root delay={150}>
              <Button
                aria-label="New tab"
                className="size-6 shrink-0"
                isIconOnly
                onPress={handleNewTab}
                size="sm"
                variant="tertiary"
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Add01Icon}
                  size={13}
                />
              </Button>
              <Tooltip.Content offset={10}>New tab</Tooltip.Content>
            </Tooltip.Root>
            <CloseButton
              aria-label="Close browser sidebar"
              className="shrink-0"
              onPress={handleClose}
            />
          </div>
        </div>

        <div className="app-region-no-drag px-2 pb-1.5">
          <div className="flex items-center gap-1 rounded-sm bg-content1/20 p-0.5">
            <NavButton
              ariaLabel="Go back"
              icon={ArrowLeft02Icon}
              isDisabled={!activeTab?.canGoBack}
              onPress={handleBack}
            />
            <NavButton
              ariaLabel="Go forward"
              icon={ArrowRight02Icon}
              isDisabled={!activeTab?.canGoForward}
              onPress={handleForward}
            />
            {activeTab?.isLoading ? (
              <NavButton
                ariaLabel="Stop loading"
                icon={Cancel01Icon}
                isDisabled={!hasLivePage}
                onPress={handleStop}
              />
            ) : (
              <NavButton
                ariaLabel="Reload"
                icon={ArrowReloadHorizontalIcon}
                isDisabled={!hasLivePage}
                onPress={handleReload}
              />
            )}

            <Input.Root
              className="h-8 min-h-8 flex-1 rounded-sm bg-transparent px-1 font-mono text-xs outline-none ring-0 shadow-none focus-within:outline-none focus-within:ring-0 data-[focus=true]:outline-none data-[focus=true]:ring-0"
              onChange={(event) => setAddressInput(event.currentTarget.value)}
              onKeyDown={handleAddressKeyDown}
              placeholder="Search or enter a URL"
              value={addressInput}
            />

            <NavButton
              ariaLabel="Open in browser"
              icon={LinkSquare02Icon}
              isDisabled={!hasLivePage}
              onPress={() => void handleOpenExternal()}
            />
          </div>
        </div>

        {activeTab?.isLoading ? (
          <div className="h-px w-full overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[loading-bar_1.4s_ease-in-out_infinite] bg-primary/70" />
          </div>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 bg-background">
        {tabs.map((tab) => (
          <BrowserViewport
            key={tab.id}
            isAutomationActive={tab.id === automationActiveTabId}
            isActive={tab.id === activeTabId}
            onRegisterWebview={registerWebview}
            tab={tab}
          />
        ))}
      </div>
    </div>
  );
}

function NavButton({
  ariaLabel,
  icon,
  isDisabled,
  onPress,
}: {
  ariaLabel: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  isDisabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Tooltip.Root delay={150}>
      <Button
        aria-label={ariaLabel}
        className="h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-sm"
        isDisabled={isDisabled}
        isIconOnly
        onPress={onPress}
        size="sm"
        variant="ghost"
      >
        <HugeiconsIcon
          color="currentColor"
          icon={icon}
          size={14}
          strokeWidth={1.6}
        />
      </Button>
      <Tooltip.Content offset={10}>{ariaLabel}</Tooltip.Content>
    </Tooltip.Root>
  );
}
