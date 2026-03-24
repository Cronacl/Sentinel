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

interface ShellContextValue {
  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;

  rightSidebarOpen: boolean;
  rightSidebarContent: ReactNode | null;
  rightSidebarDrawerMode: boolean;
  toggleRightSidebar: () => void;
  openRightSidebar: (content: ReactNode) => void;
  closeRightSidebar: () => void;
  setRightSidebarContent: (content: ReactNode | null) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const initialPathRef = useRef(pathname);

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarContent, setRightSidebarContent] =
    useState<ReactNode | null>(null);
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

  const openRightSidebar = useCallback((content: ReactNode) => {
    setRightSidebarContent(content);
    setRightSidebarOpen(true);
  }, []);

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
      toggleRightSidebar,
      openRightSidebar,
      closeRightSidebar,
      setRightSidebarContent,
    }),
    [
      leftSidebarOpen,
      toggleLeftSidebar,
      setLeftSidebarOpen,
      rightSidebarOpen,
      rightSidebarContent,
      rightSidebarDrawerMode,
      toggleRightSidebar,
      openRightSidebar,
      closeRightSidebar,
      setRightSidebarContent,
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
    }),
    [
      openRightSidebar,
      closeRightSidebar,
      toggleRightSidebar,
      setRightSidebarContent,
      rightSidebarOpen,
      rightSidebarDrawerMode,
    ],
  );
}
