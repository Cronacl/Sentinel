"use client";

import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight02Icon,
  Camera01Icon,
  Cancel01Icon,
  CleanIcon,
  CookieIcon,
  LinkSquare02Icon,
  MinusSignIcon,
  MoreVerticalIcon,
  PlusSignIcon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BorderBeam } from "border-beam";
import {
  Button,
  CloseButton,
  Dropdown,
  Input,
  Label,
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
  GLOBAL_BROWSER_SCOPE_ID,
  closeBrowserTab,
  createBrowserTab,
  setActiveBrowserTab,
  setDevicePreset,
  setDeviceToolbarEnabled,
  setDeviceWidth,
  setVisibleBrowserScopeId,
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
  getZoomFactor: () => number;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache: () => void;
  setZoomFactor: (factor: number) => void;
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

const DEVICE_PRESETS = [
  { id: "responsive", label: "Responsive", width: null },
  { id: "iphone-se", label: "iPhone SE", width: 375 },
  { id: "iphone-14-pro", label: "iPhone 14 Pro", width: 393 },
  { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440 },
  { id: "ipad", label: "iPad", width: 768 },
  { id: "ipad-pro", label: "iPad Pro", width: 1024 },
] as const;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

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
  scopeId: string,
  tabId: string,
  webview: BrowserWebviewElement,
  nextUrl?: string,
) {
  if (!hasWebviewNavigationApi(webview)) {
    updateBrowserTab(
      tabId,
      {
        canGoBack: false,
        canGoForward: false,
        url: nextUrl ?? DEFAULT_BROWSER_URL,
      },
      scopeId,
    );
    return;
  }

  const resolvedUrl = nextUrl ?? safelyGetWebviewUrl(webview);
  const historyState = safelyGetWebviewHistoryState(webview);
  updateBrowserTab(
    tabId,
    {
      canGoBack: historyState.canGoBack,
      canGoForward: historyState.canGoForward,
      url: resolvedUrl ?? DEFAULT_BROWSER_URL,
    },
    scopeId,
  );
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

export function BrowserViewport({
  deviceWidth,
  isAutomationActive,
  isActive,
  onRegisterWebview,
  scopeId,
  tab,
}: {
  deviceWidth: number | null;
  isAutomationActive: boolean;
  isActive: boolean;
  onRegisterWebview: (
    tabId: string,
    webview: BrowserWebviewElement | null,
  ) => void;
  scopeId: string;
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
      updateBrowserTab(tab.id, { isLoading: true }, scopeId);
    };
    const handleLoadStop = () => {
      updateBrowserTab(tab.id, { isLoading: false }, scopeId);
      syncWebviewNavigationState(scopeId, tab.id, webview);
    };
    const handleNavigate = (event: Event) => {
      const nextUrl = (event as BrowserWebviewEvent).url;
      updateBrowserTab(tab.id, { isLoading: false }, scopeId);
      syncWebviewNavigationState(scopeId, tab.id, webview, nextUrl);
    };
    const handleTitleUpdate = (event: Event) => {
      const nextTitle = (event as BrowserWebviewEvent).title?.trim();
      updateBrowserTab(
        tab.id,
        {
          title: nextTitle || getTabHostname(tab.url),
        },
        scopeId,
      );
    };
    const handleFailLoad = (event: Event) => {
      const browserEvent = event as BrowserWebviewEvent;
      if (browserEvent.errorCode === -3 || browserEvent.isMainFrame === false) {
        return;
      }

      updateBrowserTab(
        tab.id,
        {
          isLoading: false,
          title: getTabHostname(browserEvent.validatedURL ?? tab.url),
          url: browserEvent.validatedURL ?? tab.url,
        },
        scopeId,
      );
      syncWebviewNavigationState(
        scopeId,
        tab.id,
        webview,
        browserEvent.validatedURL ?? tab.url,
      );
    };
    const handleConsoleMessage = (event: Event) => {
      const browserEvent = event as BrowserWebviewEvent;
      recordBrowserAutomationConsoleLog(scopeId, tab.id, {
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
  }, [scopeId, tab.id, tab.url]);

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
      const previousWebview = webviewRef.current;
      webviewRef.current = nextWebview;
      registerBrowserAutomationWebview(
        scopeId,
        tab.id,
        nextWebview,
        previousWebview,
      );
      onRegisterWebview(tab.id, nextWebview);
    },
    [onRegisterWebview, scopeId, tab.id],
  );

  if (tab.url === DEFAULT_BROWSER_URL) {
    return (
      <div className={`absolute inset-0 ${isActive ? "block" : "hidden"}`} />
    );
  }

  const WebviewTag: any = "webview";
  const hasDeviceConstraint = deviceWidth !== null && deviceWidth > 0;

  return (
    <div
      className={`absolute inset-0 ${isActive ? "block" : "hidden"} min-h-0 min-w-0`}
    >
      <BrowserAutomationViewportFrame active={isAutomationActive} />
      {hasDeviceConstraint ? (
        <div className="absolute inset-0 flex min-h-0 min-w-0 bg-foreground/[0.02]">
          <div
            className="shrink-0 border-r border-dashed border-foreground/[0.06]"
            style={{ flex: "1 1 0" }}
          />
          <div
            ref={containerRef}
            className="relative flex min-h-0 shrink-0 bg-background"
            style={{ width: `${deviceWidth}px`, maxWidth: "100%" }}
          >
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
          <div
            className="shrink-0 border-l border-dashed border-foreground/[0.06]"
            style={{ flex: "1 1 0" }}
          />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="absolute inset-0 flex min-h-0 min-w-0"
        >
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
      )}
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

function BrowserMoreOptionsMenu({
  deviceToolbarEnabled,
  hasLivePage,
  onClearCache,
  onClearCookies,
  onHardReload,
  onToggleDeviceToolbar,
  onZoomChange,
  zoomFactor,
}: {
  deviceToolbarEnabled: boolean;
  hasLivePage: boolean;
  onClearCache: () => void;
  onClearCookies: () => void;
  onHardReload: () => void;
  onToggleDeviceToolbar: () => void;
  onZoomChange: (factor: number) => void;
  zoomFactor: number;
}) {
  const zoomPercent = Math.round(zoomFactor * 100);

  return (
    <Dropdown>
      <Tooltip.Root delay={150}>
        <Button
          aria-label="More options"
          className="h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-lg"
          isIconOnly
          size="sm"
          variant="ghost"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={MoreVerticalIcon}
            size={14}
            strokeWidth={1.5}
          />
        </Button>
        <Tooltip.Content offset={10}>More options</Tooltip.Content>
      </Tooltip.Root>
      <Dropdown.Popover className="min-w-[196px]" placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => {
            switch (key) {
              case "hard-reload":
                onHardReload();
                break;
              case "toggle-device-toolbar":
                onToggleDeviceToolbar();
                break;
              case "clear-cookies":
                onClearCookies();
                break;
              case "clear-cache":
                onClearCache();
                break;
            }
          }}
        >
          <Dropdown.Item
            id="hard-reload"
            isDisabled={!hasLivePage}
            textValue="Hard reload"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={ArrowReloadHorizontalIcon}
              size={14}
              strokeWidth={1.5}
            />
            <Label>Hard reload</Label>
          </Dropdown.Item>
          <Dropdown.Item
            id="toggle-device-toolbar"
            textValue={
              deviceToolbarEnabled
                ? "Hide device toolbar"
                : "Show device toolbar"
            }
          >
            <HugeiconsIcon
              color="currentColor"
              icon={Tablet01Icon}
              size={14}
              strokeWidth={1.5}
            />
            <Label>
              {deviceToolbarEnabled
                ? "Hide device toolbar"
                : "Show device toolbar"}
            </Label>
          </Dropdown.Item>
          <Dropdown.Item id="zoom-controls" textValue={`Zoom ${zoomPercent}%`}>
            <div
              className="flex w-full items-center"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="flex-1 text-[13px]">Zoom</span>
              <div className="flex items-center gap-0.5">
                <button
                  className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:bg-content2 disabled:opacity-30"
                  disabled={zoomFactor <= MIN_ZOOM}
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoomChange(Math.max(MIN_ZOOM, zoomFactor - ZOOM_STEP));
                  }}
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={MinusSignIcon}
                    size={11}
                  />
                </button>
                <span className="min-w-[36px] text-center text-[11px] tabular-nums text-foreground/60">
                  {zoomPercent}%
                </span>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded-md transition-colors hover:bg-content2 disabled:opacity-30"
                  disabled={zoomFactor >= MAX_ZOOM}
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoomChange(Math.min(MAX_ZOOM, zoomFactor + ZOOM_STEP));
                  }}
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={PlusSignIcon}
                    size={11}
                  />
                </button>
                {zoomFactor !== 1 ? (
                  <button
                    className="ml-0.5 rounded-md px-1 py-px text-[10px] font-medium text-foreground/50 transition-colors hover:bg-content2 hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoomChange(1);
                    }}
                    type="button"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          </Dropdown.Item>
          <Dropdown.Item
            id="clear-cookies"
            isDisabled={!hasLivePage}
            textValue="Clear cookies"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={CookieIcon}
              size={14}
              strokeWidth={1.5}
            />
            <Label>Clear cookies</Label>
          </Dropdown.Item>
          <Dropdown.Item
            id="clear-cache"
            isDisabled={!hasLivePage}
            textValue="Clear cache"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={CleanIcon}
              size={14}
              strokeWidth={1.5}
            />
            <Label>Clear cache</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function DeviceToolbar({
  devicePreset,
  deviceWidth,
  scopeId,
}: {
  devicePreset: string;
  deviceWidth: number | null;
  scopeId: string;
}) {
  const [widthInput, setWidthInput] = useState(
    deviceWidth !== null ? String(deviceWidth) : "",
  );

  useEffect(() => {
    setWidthInput(deviceWidth !== null ? String(deviceWidth) : "");
  }, [deviceWidth]);

  const handlePresetChange = useCallback(
    (key: React.Key) => {
      const preset = DEVICE_PRESETS.find((p) => p.id === key);
      if (preset) {
        setDevicePreset(preset.id, preset.width, scopeId);
      }
    },
    [scopeId],
  );

  const handleWidthCommit = useCallback(() => {
    const parsed = Number.parseInt(widthInput, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setDeviceWidth(parsed, scopeId);
    } else {
      setWidthInput(deviceWidth !== null ? String(deviceWidth) : "");
    }
  }, [widthInput, deviceWidth, scopeId]);

  const handleWidthKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleWidthCommit();
      }
    },
    [handleWidthCommit],
  );

  const activePreset = DEVICE_PRESETS.find((p) => p.id === devicePreset);

  return (
    <motion.div
      animate={{ height: "auto", opacity: 1 }}
      className="shrink-0 overflow-hidden border-b border-border/30"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        <Dropdown>
          <Button
            className="h-6 min-h-6 shrink-0 gap-1 rounded-lg px-1.5"
            size="sm"
            variant="ghost"
          >
            <svg
              className="w-3 h-3"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
            >
              <g
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              >
                <path d="M13.5 2h-3c-2.357 0-3.536 0-4.268.732S5.5 4.643 5.5 7v10c0 2.357 0 3.535.732 4.268S8.143 22 10.5 22h3c2.357 0 3.535 0 4.268-.732c.732-.733.732-1.911.732-4.268V7c0-2.357 0-3.536-.732-4.268C17.035 2 15.857 2 13.5 2" />
                <path d="M12.125 19H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0" />
              </g>
            </svg>
            <span
              className="text-[11px] font-medium"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {activePreset?.label ?? "Custom"}
            </span>
          </Button>
          <Dropdown.Popover className="min-w-[176px]" placement="bottom start">
            <Dropdown.Menu onAction={handlePresetChange}>
              {DEVICE_PRESETS.map((preset) => (
                <Dropdown.Item
                  id={preset.id}
                  key={preset.id}
                  textValue={preset.label}
                >
                  <Label className="flex-1">{preset.label}</Label>
                  {preset.width !== null ? (
                    <span className="text-[11px] tabular-nums text-foreground/40">
                      {preset.width}
                    </span>
                  ) : null}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>

        <div className="flex items-center gap-0.5 rounded-lg bg-content1/20 px-1 py-px">
          <Input.Root
            className="h-5 min-h-5 w-[48px] rounded-lg bg-transparent px-0.5 font-mono text-[11px] outline-none ring-0 shadow-none focus-within:ring-0"
            onChange={(e) => setWidthInput(e.currentTarget.value)}
            onBlur={handleWidthCommit}
            onKeyDown={handleWidthKeyDown}
            placeholder="—"
            value={widthInput}
          />
          <span className="text-[10px] text-foreground/30">px</span>
        </div>
      </div>
    </motion.div>
  );
}

export function BrowserSidebar({
  scopeId = GLOBAL_BROWSER_SCOPE_ID,
}: {
  scopeId?: string | null;
}) {
  const resolvedScopeId = scopeId ?? GLOBAL_BROWSER_SCOPE_ID;
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const rightSidebar = useRightSidebar();
  const {
    activeTabId,
    automationActiveTabId,
    devicePreset,
    deviceToolbarEnabled,
    deviceWidth,
    tabs,
  } = useBrowserSidebarState(resolvedScopeId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const [addressInput, setAddressInput] = useState(
    formatAddressInput(activeTab?.url ?? ""),
  );
  const [zoomFactor, setZoomFactorState] = useState(1);
  const tabButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabListContentRef = useRef<HTMLDivElement | null>(null);
  const webviewRefs = useRef<Map<string, BrowserWebviewElement>>(new Map());
  const titleBarInset = getDesktopWindowControlsInset(platform);
  const hasLivePage = Boolean(
    activeTab?.url && activeTab.url !== DEFAULT_BROWSER_URL,
  );
  const browserChromeStyle = {
    paddingRight: titleBarInset ? titleBarInset + 14 : undefined,
  } as CSSProperties;
  const effectiveDeviceWidth = deviceToolbarEnabled ? deviceWidth : null;

  useEffect(() => {
    setVisibleBrowserScopeId(resolvedScopeId);
    return () => {
      setVisibleBrowserScopeId(null);
    };
  }, [resolvedScopeId]);

  useEffect(() => {
    setAddressInput(formatAddressInput(activeTab?.url ?? ""));
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const targetTabId = automationActiveTabId ?? activeTabId;
    if (!targetTabId) return;

    const frame = window.requestAnimationFrame(() => {
      const tabButton = tabButtonRefs.current.get(targetTabId);
      const tabListScroller = tabListContentRef.current?.parentElement;
      if (!tabButton || !tabListScroller) return;

      const tabRect = tabButton.getBoundingClientRect();
      const scrollerRect = tabListScroller.getBoundingClientRect();
      const tabLeft =
        tabRect.left - scrollerRect.left + tabListScroller.scrollLeft;
      const centeredLeft =
        tabLeft - (tabListScroller.clientWidth - tabButton.offsetWidth) / 2;
      const maxScrollLeft =
        tabListScroller.scrollWidth - tabListScroller.clientWidth;

      tabListScroller.scrollTo({
        behavior: "smooth",
        left: Math.max(0, Math.min(centeredLeft, maxScrollLeft)),
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
      updateBrowserTab(
        activeTabId,
        {
          isLoading: normalized !== DEFAULT_BROWSER_URL,
          title:
            normalized === DEFAULT_BROWSER_URL
              ? "Start Page"
              : getTabHostname(normalized),
          url: normalized,
        },
        resolvedScopeId,
      );

      const webview = webviewRefs.current.get(activeTabId) ?? null;
      if (
        hasWebviewNavigationApi(webview) &&
        normalized !== DEFAULT_BROWSER_URL
      ) {
        webview.src = normalized;
      }
    },
    [activeTabId, resolvedScopeId],
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
      updateBrowserTab(activeTabId, { isLoading: true }, resolvedScopeId);
      webview.reload();
    }
  }, [activeTabId, resolvedScopeId]);

  const handleStop = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (hasWebviewNavigationApi(webview)) {
      webview.stop();
      updateBrowserTab(activeTabId, { isLoading: false }, resolvedScopeId);
    }
  }, [activeTabId, resolvedScopeId]);

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
      setActiveBrowserTab(tabId, resolvedScopeId);
      const tab = tabs.find((item) => item.id === tabId);
      if (tab) {
        setAddressInput(formatAddressInput(tab.url));
      }
    },
    [tabs, resolvedScopeId],
  );

  const handleNewTab = useCallback(() => {
    createBrowserTab(DEFAULT_BROWSER_URL, resolvedScopeId);
    setAddressInput("");
  }, [resolvedScopeId]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeBrowserTab(tabId, resolvedScopeId);
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
    [activeTabId, handleClose, tabs, resolvedScopeId],
  );

  const handleZoomChange = useCallback(
    (factor: number) => {
      const clamped = Math.round(factor * 100) / 100;
      setZoomFactorState(clamped);
      if (!activeTabId) return;
      const webview = webviewRefs.current.get(activeTabId) ?? null;
      if (webview && typeof webview.setZoomFactor === "function") {
        webview.setZoomFactor(clamped);
      }
    },
    [activeTabId],
  );

  const handleHardReload = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (webview && typeof webview.reloadIgnoringCache === "function") {
      updateBrowserTab(activeTabId, { isLoading: true }, resolvedScopeId);
      webview.reloadIgnoringCache();
    }
  }, [activeTabId, resolvedScopeId]);

  const handleClearCookies = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (webview && typeof webview.executeJavaScript === "function") {
      void webview.executeJavaScript(
        "document.cookie.split(';').forEach(c => document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')",
        true,
      );
    }
  }, [activeTabId]);

  const handleClearCache = useCallback(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (webview && typeof webview.executeJavaScript === "function") {
      void webview.executeJavaScript(
        "caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))))",
        true,
      );
    }
  }, [activeTabId]);

  const handleToggleDeviceToolbar = useCallback(() => {
    setDeviceToolbarEnabled(!deviceToolbarEnabled, resolvedScopeId);
  }, [deviceToolbarEnabled, resolvedScopeId]);

  const handleScreenshot = useCallback(async () => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (!webview || typeof webview.capturePage !== "function") return;

    try {
      const image = await webview.capturePage();
      const dataUrl = image?.toDataURL?.();
      if (!dataUrl) return;

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `screenshot-${Date.now()}.png`, {
        type: "image/png",
      });

      window.dispatchEvent(
        new CustomEvent("sentinel:browser-screenshot", { detail: file }),
      );
    } catch {
      // silently ignore capture failures
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) return;
    const webview = webviewRefs.current.get(activeTabId) ?? null;
    if (webview && typeof webview.getZoomFactor === "function") {
      try {
        setZoomFactorState(webview.getZoomFactor());
      } catch {
        setZoomFactorState(1);
      }
    }
  }, [activeTabId]);

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
              ref={tabListContentRef}
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
          <div className="flex items-center gap-1 rounded-lg bg-content1/20 p-0.5">
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
              className="h-8 min-h-8 flex-1 rounded-lg bg-transparent px-1 font-mono text-xs outline-none ring-0 shadow-none focus-within:outline-none focus-within:ring-0 data-[focus=true]:outline-none data-[focus=true]:ring-0"
              onChange={(event) => setAddressInput(event.currentTarget.value)}
              onKeyDown={handleAddressKeyDown}
              placeholder="Search or enter a URL"
              value={addressInput}
            />

            <NavButton
              ariaLabel="Screenshot to chat"
              icon={Camera01Icon}
              isDisabled={!hasLivePage}
              onPress={() => void handleScreenshot()}
            />
            <NavButton
              ariaLabel={
                deviceToolbarEnabled
                  ? "Hide device toolbar"
                  : "Show device toolbar"
              }
              icon={Tablet01Icon}
              isActive={deviceToolbarEnabled}
              onPress={handleToggleDeviceToolbar}
            />
            <NavButton
              ariaLabel="Open in browser"
              icon={LinkSquare02Icon}
              isDisabled={!hasLivePage}
              onPress={() => void handleOpenExternal()}
            />
            <BrowserMoreOptionsMenu
              deviceToolbarEnabled={deviceToolbarEnabled}
              hasLivePage={hasLivePage}
              onClearCache={handleClearCache}
              onClearCookies={handleClearCookies}
              onHardReload={handleHardReload}
              onToggleDeviceToolbar={handleToggleDeviceToolbar}
              onZoomChange={handleZoomChange}
              zoomFactor={zoomFactor}
            />
          </div>
        </div>

        {activeTab?.isLoading ? (
          <div className="h-px w-full overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[loading-bar_1.4s_ease-in-out_infinite] bg-primary/70" />
          </div>
        ) : null}
      </header>

      <AnimatePresence initial={false}>
        {deviceToolbarEnabled ? (
          <DeviceToolbar
            key="device-toolbar"
            devicePreset={devicePreset}
            deviceWidth={deviceWidth}
            scopeId={resolvedScopeId}
          />
        ) : null}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1 bg-background">
        {tabs.map((tab) => (
          <BrowserViewport
            key={tab.id}
            deviceWidth={effectiveDeviceWidth}
            isAutomationActive={tab.id === automationActiveTabId}
            isActive={tab.id === activeTabId}
            onRegisterWebview={registerWebview}
            scopeId={resolvedScopeId}
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
  isActive,
  isDisabled,
  onPress,
}: {
  ariaLabel: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  isActive?: boolean;
  isDisabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Tooltip.Root delay={150}>
      <Button
        aria-label={ariaLabel}
        className={`h-7 w-7 min-h-7 min-w-7 shrink-0 rounded-lg ${isActive ? "bg-content2/80 text-foreground" : ""}`}
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
          strokeWidth={1.5}
        />
      </Button>
      <Tooltip.Content offset={10}>{ariaLabel}</Tooltip.Content>
    </Tooltip.Root>
  );
}
