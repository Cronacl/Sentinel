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

interface ShellContextValue {
  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;

  rightSidebarOpen: boolean;
  rightSidebarContent: ReactNode | null;
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
      toggleRightSidebar,
      openRightSidebar,
      closeRightSidebar,
      setRightSidebarContent,
    ],
  );

  return (
    <ShellContext.Provider value={value}>
      {children}
    </ShellContext.Provider>
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
    toggleRightSidebar,
  } = useShell();

  return useMemo(
    () => ({
      open: openRightSidebar,
      close: closeRightSidebar,
      toggle: toggleRightSidebar,
      setContent: setRightSidebarContent,
      isOpen: rightSidebarOpen,
    }),
    [
      openRightSidebar,
      closeRightSidebar,
      toggleRightSidebar,
      setRightSidebarContent,
      rightSidebarOpen,
    ],
  );
}
