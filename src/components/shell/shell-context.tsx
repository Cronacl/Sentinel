"use client";

import { usePathname } from "next/navigation";
import {
  type PropsWithChildren,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { closeRepoDiffSidebarState } from "@/components/chat/repo-diff-sidebar-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED } from "@/schemas/general-settings.schema";
import { api } from "@/trpc/react";

import {
  resolveShellRouteState,
  type ShellNavigationOptions,
} from "./shell-route";
import {
  clearRightSidebarState,
  DEFAULT_RIGHT_SIDEBAR_STATE,
  type RightSidebarPanelId,
  type RightSidebarSize,
} from "./right-sidebar-state";
import { setBrowserSessionPersistenceEnabled } from "@/components/browser/browser-sidebar-store";

const RIGHT_SIDEBAR_DRAWER_BREAKPOINT = "(max-width: 1024px)";

type RightSidebarOptions = {
  panelId?: RightSidebarPanelId;
  size?: RightSidebarSize;
};

interface ShellContextValue {
  pathname: string;
  selectedThreadId: string | null;
  isHomeRoute: boolean;
  isThreadRoute: boolean;
  navigateHome: (options?: ShellNavigationOptions) => void;
  navigateToThread: (
    threadId: string,
    options?: ShellNavigationOptions,
  ) => void;

  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;

  rightSidebarOpen: boolean;
  rightSidebarContent: ReactNode | null;
  rightSidebarDrawerMode: boolean;
  rightSidebarPanelId: RightSidebarPanelId;
  rightSidebarSize: RightSidebarSize;
  toggleRightSidebar: () => void;
  openRightSidebar: (content: ReactNode, options?: RightSidebarOptions) => void;
  closeRightSidebar: () => void;
  setRightSidebarContent: (
    content: ReactNode | null,
    options?: RightSidebarOptions,
  ) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

function getBrowserShellPathname(fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const browserPathname = window.location.pathname;
  return browserPathname.startsWith("/settings") ? browserPathname : fallback;
}

export function ShellProvider({ children }: PropsWithChildren) {
  const nextPathname = usePathname();
  const [pathname, setPathname] = useState(() =>
    getBrowserShellPathname(nextPathname),
  );
  const initialPathRef = useRef(pathname);
  const generalSettings = api.generalSettings.get.useQuery();

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(
    DEFAULT_RIGHT_SIDEBAR_STATE.open,
  );
  const [rightSidebarContent, setRightSidebarContent] =
    useState<ReactNode | null>(DEFAULT_RIGHT_SIDEBAR_STATE.content);
  const [rightSidebarPanelId, setRightSidebarPanelId] =
    useState<RightSidebarPanelId>(DEFAULT_RIGHT_SIDEBAR_STATE.panelId);
  const [rightSidebarSize, setRightSidebarSize] = useState<RightSidebarSize>(
    DEFAULT_RIGHT_SIDEBAR_STATE.size,
  );
  const rightSidebarDrawerMode = useMediaQuery(RIGHT_SIDEBAR_DRAWER_BREAKPOINT);

  useEffect(() => {
    setPathname(getBrowserShellPathname(nextPathname));
  }, [nextPathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    setBrowserSessionPersistenceEnabled(
      generalSettings.data?.persistBrowserSession ??
        DEFAULT_BROWSER_SESSION_PERSISTENCE_ENABLED,
    );
  }, [generalSettings.data?.persistBrowserSession]);

  const closeRightSidebar = useCallback(() => {
    const nextState = clearRightSidebarState({
      content: rightSidebarContent,
      open: rightSidebarOpen,
      panelId: rightSidebarPanelId,
      size: rightSidebarSize,
    });

    if (rightSidebarPanelId === "repo-diff") {
      closeRepoDiffSidebarState();
    }

    setRightSidebarOpen(nextState.open);
    setRightSidebarContent(nextState.content);
    setRightSidebarPanelId(nextState.panelId);
    setRightSidebarSize(nextState.size);
  }, [
    rightSidebarContent,
    rightSidebarOpen,
    rightSidebarPanelId,
    rightSidebarSize,
  ]);

  useEffect(() => {
    if (pathname !== initialPathRef.current) {
      closeRightSidebar();
    }
    initialPathRef.current = pathname;
  }, [closeRightSidebar, pathname]);

  const navigatePath = useCallback(
    (nextPath: string, options?: ShellNavigationOptions) => {
      if (typeof window === "undefined") {
        return;
      }

      const historyMethod = options?.replace ? "replaceState" : "pushState";
      window.history[historyMethod](null, "", nextPath);
      setPathname(nextPath);
    },
    [],
  );

  const navigateHome = useCallback(
    (options?: ShellNavigationOptions) => {
      navigatePath("/", options);
    },
    [navigatePath],
  );

  const navigateToThread = useCallback(
    (threadId: string, options?: ShellNavigationOptions) => {
      navigatePath(`/thread/${threadId}`, options);
    },
    [navigatePath],
  );

  const routeState = useMemo(
    () => resolveShellRouteState(pathname),
    [pathname],
  );

  const toggleLeftSidebar = useCallback(
    () => setLeftSidebarOpen((prev) => !prev),
    [],
  );

  const toggleRightSidebar = useCallback(() => {
    if (rightSidebarOpen) {
      closeRightSidebar();
      return;
    }

    if (!rightSidebarContent) {
      return;
    }

    setRightSidebarOpen(true);
  }, [closeRightSidebar, rightSidebarContent, rightSidebarOpen]);

  const openRightSidebar = useCallback(
    (content: ReactNode, options?: RightSidebarOptions) => {
      setRightSidebarPanelId(options?.panelId ?? null);
      setRightSidebarSize(options?.size ?? "narrow");
      setRightSidebarContent(content);
      setRightSidebarOpen(true);
    },
    [],
  );

  const updateRightSidebarContent = useCallback(
    (content: ReactNode | null, options?: RightSidebarOptions) => {
      if (options?.panelId !== undefined) {
        setRightSidebarPanelId(options.panelId);
      }
      if (options?.size) {
        setRightSidebarSize(options.size);
      } else if (content === null) {
        setRightSidebarSize("narrow");
      }
      if (content === null && options?.panelId === undefined) {
        setRightSidebarPanelId(null);
      }
      setRightSidebarContent(content);
    },
    [],
  );

  const value = useMemo<ShellContextValue>(
    () => ({
      pathname: routeState.pathname,
      selectedThreadId: routeState.selectedThreadId,
      isHomeRoute: routeState.isHomeRoute,
      isThreadRoute: routeState.isThreadRoute,
      navigateHome,
      navigateToThread,
      leftSidebarOpen,
      toggleLeftSidebar,
      setLeftSidebarOpen,
      rightSidebarOpen,
      rightSidebarContent,
      rightSidebarDrawerMode,
      rightSidebarPanelId,
      rightSidebarSize,
      toggleRightSidebar,
      openRightSidebar,
      closeRightSidebar,
      setRightSidebarContent: updateRightSidebarContent,
    }),
    [
      routeState.pathname,
      routeState.selectedThreadId,
      routeState.isHomeRoute,
      routeState.isThreadRoute,
      navigateHome,
      navigateToThread,
      leftSidebarOpen,
      toggleLeftSidebar,
      setLeftSidebarOpen,
      rightSidebarOpen,
      rightSidebarContent,
      rightSidebarDrawerMode,
      rightSidebarPanelId,
      rightSidebarSize,
      toggleRightSidebar,
      openRightSidebar,
      closeRightSidebar,
      updateRightSidebarContent,
    ],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}

export function useRightSidebar() {
  const {
    openRightSidebar,
    closeRightSidebar,
    setRightSidebarContent,
    rightSidebarOpen,
    rightSidebarDrawerMode,
    rightSidebarPanelId,
    rightSidebarSize,
    toggleRightSidebar,
  } = useShell();

  return useMemo(
    () => ({
      open: openRightSidebar,
      close: closeRightSidebar,
      toggle: toggleRightSidebar,
      setContent: setRightSidebarContent,
      isOpen: rightSidebarOpen,
      isDrawerMode: rightSidebarDrawerMode,
      panelId: rightSidebarPanelId,
      size: rightSidebarSize,
    }),
    [
      openRightSidebar,
      closeRightSidebar,
      toggleRightSidebar,
      setRightSidebarContent,
      rightSidebarOpen,
      rightSidebarDrawerMode,
      rightSidebarPanelId,
      rightSidebarSize,
    ],
  );
}
