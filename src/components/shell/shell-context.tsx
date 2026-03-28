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

import { useMediaQuery } from "@/hooks/use-media-query";

const RIGHT_SIDEBAR_DRAWER_BREAKPOINT = "(max-width: 1024px)";
export type RightSidebarSize = "narrow" | "wide";
export type RightSidebarPanelId = "repo-diff" | null;

type RightSidebarOptions = {
  panelId?: RightSidebarPanelId;
  size?: RightSidebarSize;
};

interface ShellContextValue {
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

export function ShellProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const initialPathRef = useRef(pathname);

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarContent, setRightSidebarContent] =
    useState<ReactNode | null>(null);
  const [rightSidebarPanelId, setRightSidebarPanelId] =
    useState<RightSidebarPanelId>(null);
  const [rightSidebarSize, setRightSidebarSize] =
    useState<RightSidebarSize>("narrow");
  const rightSidebarDrawerMode = useMediaQuery(RIGHT_SIDEBAR_DRAWER_BREAKPOINT);

  useEffect(() => {
    if (pathname !== initialPathRef.current) {
      setRightSidebarOpen(false);
    }
    initialPathRef.current = pathname;
  }, [pathname]);

  const toggleLeftSidebar = useCallback(
    () => setLeftSidebarOpen((prev) => !prev),
    [],
  );

  const toggleRightSidebar = useCallback(
    () =>
      setRightSidebarOpen((prev) => {
        if (!prev && !rightSidebarContent) return false;
        return !prev;
      }),
    [rightSidebarContent],
  );

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

  const closeRightSidebar = useCallback(() => {
    setRightSidebarOpen(false);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
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
