"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

import { useShell } from "./shell-context";

const SIDEBAR_WIDTHS = {
  browser: 540,
  narrow: 380,
  wide: 500,
} as const;
const DRAWER_BREAKPOINT = "(max-width: 1024px)";
const DESKTOP_MIN_WIDTH = 320;
const DESKTOP_MAX_WIDTH = 920;
const DESKTOP_BROWSER_MAX_WIDTH = 1180;
const SIDEBAR_SPRING = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1] as const,
};
const SIDEBAR_CONTENT_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};
const SIDEBAR_CLOSE_DELAY_MS = 280;

export function RightSidebar() {
  const {
    rightSidebarOpen,
    rightSidebarContent,
    rightSidebarPanelId,
    rightSidebarSize,
    closeRightSidebar,
  } = useShell();
  const isDrawerMode = useMediaQuery(DRAWER_BREAKPOINT);
  const widthBySizeRef = useRef<Record<keyof typeof SIDEBAR_WIDTHS, number>>({
    browser: SIDEBAR_WIDTHS.browser,
    narrow: SIDEBAR_WIDTHS.narrow,
    wide: SIDEBAR_WIDTHS.wide,
  });
  const closeTimeoutRef = useRef<number | null>(null);
  const [desktopWidth, setDesktopWidth] = useState(
    widthBySizeRef.current[rightSidebarSize],
  );
  const [isResizing, setIsResizing] = useState(false);
  const [renderedContent, setRenderedContent] = useState(rightSidebarContent);
  const [renderedSize, setRenderedSize] = useState(rightSidebarSize);

  const getMinDesktopWidth = useCallback(() => {
    if (rightSidebarPanelId === "browser") return 420;
    if (rightSidebarPanelId === "repo-diff") return 420;

    return DESKTOP_MIN_WIDTH;
  }, [rightSidebarPanelId]);

  const getMaxDesktopWidth = useCallback(() => {
    if (typeof window === "undefined") {
      return rightSidebarPanelId === "browser"
        ? DESKTOP_BROWSER_MAX_WIDTH
        : DESKTOP_MAX_WIDTH;
    }

    if (rightSidebarPanelId === "browser") {
      return Math.min(
        DESKTOP_BROWSER_MAX_WIDTH,
        Math.floor(window.innerWidth * 0.82),
      );
    }

    return Math.min(DESKTOP_MAX_WIDTH, Math.floor(window.innerWidth * 0.72));
  }, [rightSidebarPanelId]);

  const clampDesktopWidth = useCallback(
    (value: number) =>
      Math.min(getMaxDesktopWidth(), Math.max(getMinDesktopWidth(), value)),
    [getMaxDesktopWidth, getMinDesktopWidth],
  );

  useEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (rightSidebarContent !== null) {
      setRenderedContent(rightSidebarContent);
      setRenderedSize(rightSidebarSize);
      return;
    }

    if (!rightSidebarOpen) {
      closeTimeoutRef.current = window.setTimeout(() => {
        setRenderedContent(null);
        setRenderedSize("narrow");
        closeTimeoutRef.current = null;
      }, SIDEBAR_CLOSE_DELAY_MS);
    }
  }, [rightSidebarContent, rightSidebarOpen, rightSidebarSize]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextWidth = clampDesktopWidth(widthBySizeRef.current[renderedSize]);
    widthBySizeRef.current[renderedSize] = nextWidth;
    setDesktopWidth(nextWidth);
  }, [clampDesktopWidth, renderedSize]);

  useEffect(() => {
    if (isDrawerMode) {
      return;
    }

    const handleResize = () => {
      setDesktopWidth((current) => {
        const nextWidth = clampDesktopWidth(current);
        widthBySizeRef.current[renderedSize] = nextWidth;
        return nextWidth;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampDesktopWidth, isDrawerMode, renderedSize]);

  const resizeHandleProps = useMemo(
    () => ({
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDrawerMode || !rightSidebarOpen) {
          return;
        }

        event.preventDefault();

        const startX = event.clientX;
        const startWidth = desktopWidth;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        setIsResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const handlePointerMove = (moveEvent: PointerEvent) => {
          const delta = startX - moveEvent.clientX;
          const nextWidth = clampDesktopWidth(startWidth + delta);
          widthBySizeRef.current[renderedSize] = nextWidth;
          setDesktopWidth(nextWidth);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
          target.releasePointerCapture(upEvent.pointerId);
          setIsResizing(false);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
      },
    }),
    [
      clampDesktopWidth,
      desktopWidth,
      isDrawerMode,
      rightSidebarOpen,
      renderedSize,
    ],
  );

  const sidebarWidth = isDrawerMode
    ? SIDEBAR_WIDTHS[renderedSize]
    : desktopWidth;

  if (!renderedContent) return null;

  if (isDrawerMode) {
    return (
      <AnimatePresence initial={false}>
        <motion.div
          aria-hidden
          animate={{
            opacity: rightSidebarOpen ? 1 : 0,
            pointerEvents: rightSidebarOpen ? "auto" : "none",
          }}
          className="fixed inset-0 z-40 bg-black/40"
          initial={false}
          onClick={closeRightSidebar}
          transition={SIDEBAR_CONTENT_TRANSITION}
        />

        <motion.aside
          animate={{
            opacity: rightSidebarOpen ? 1 : 0.98,
            x: rightSidebarOpen ? 0 : 24,
          }}
          className="bg-surface border-separator/20 fixed top-0 right-0 z-50 flex h-dvh flex-col border-l shadow-xl"
          initial={false}
          style={{
            width: sidebarWidth,
            maxWidth: "90vw",
          }}
          transition={SIDEBAR_SPRING}
        >
          <motion.div
            animate={{
              opacity: rightSidebarOpen ? 1 : 0,
              x: rightSidebarOpen ? 0 : 8,
            }}
            className="flex h-full flex-col"
            initial={false}
            transition={SIDEBAR_CONTENT_TRANSITION}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {renderedContent}
            </div>
          </motion.div>
        </motion.aside>
      </AnimatePresence>
    );
  }

  return (
    <motion.aside
      animate={{
        width: rightSidebarOpen ? sidebarWidth : 0,
      }}
      className="border-separator/50 bg-surface relative flex h-full shrink-0 flex-col overflow-clip border-l"
      initial={false}
      transition={isResizing ? { duration: 0 } : SIDEBAR_SPRING}
    >
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 z-20 w-3 cursor-col-resize transition-opacity duration-200 ${
          rightSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        } ${isDrawerMode ? "pointer-events-none opacity-0" : ""}`}
        {...resizeHandleProps}
      >
        <div className="h-full w-px scale-x-50 bg-border/40 origin-left" />
      </div>
      <motion.div
        animate={{
          opacity: rightSidebarOpen ? 1 : 0,
          x: rightSidebarOpen ? 0 : 10,
        }}
        className="flex h-full flex-col"
        initial={false}
        style={{ width: sidebarWidth }}
        transition={isResizing ? { duration: 0 } : SIDEBAR_CONTENT_TRANSITION}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {renderedContent}
        </div>
      </motion.div>
    </motion.aside>
  );
}
