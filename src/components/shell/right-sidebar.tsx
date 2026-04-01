"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

import { useShell } from "./shell-context";

const SIDEBAR_WIDTHS = {
  browser: 620,
  narrow: 380,
  wide: 560,
} as const;
const DRAWER_BREAKPOINT = "(max-width: 1024px)";
const DESKTOP_MIN_WIDTH = 320;
const DESKTOP_MAX_WIDTH = 920;
const DESKTOP_BROWSER_MAX_WIDTH = 1180;

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
  const [desktopWidth, setDesktopWidth] = useState(
    widthBySizeRef.current[rightSidebarSize],
  );
  const [isResizing, setIsResizing] = useState(false);

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
    const nextWidth = clampDesktopWidth(
      widthBySizeRef.current[rightSidebarSize],
    );
    widthBySizeRef.current[rightSidebarSize] = nextWidth;
    setDesktopWidth(nextWidth);
  }, [clampDesktopWidth, rightSidebarSize]);

  useEffect(() => {
    if (isDrawerMode) {
      return;
    }

    const handleResize = () => {
      setDesktopWidth((current) => {
        const nextWidth = clampDesktopWidth(current);
        widthBySizeRef.current[rightSidebarSize] = nextWidth;
        return nextWidth;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampDesktopWidth, isDrawerMode, rightSidebarSize]);

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
          widthBySizeRef.current[rightSidebarSize] = nextWidth;
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
      rightSidebarSize,
    ],
  );

  const sidebarWidth = isDrawerMode
    ? SIDEBAR_WIDTHS[rightSidebarSize]
    : desktopWidth;

  if (!rightSidebarContent) return null;

  if (isDrawerMode) {
    return (
      <>
        {/* backdrop */}
        <div
          aria-hidden
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
            rightSidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={closeRightSidebar}
        />

        {/* drawer panel */}
        <aside
          className="bg-surface border-separator/70 ease-out-quart fixed top-0 right-0 z-50 flex h-dvh flex-col border-l shadow-xl transition-transform duration-300"
          style={{
            width: sidebarWidth,
            maxWidth: "90vw",
            transform: rightSidebarOpen ? "translateX(0)" : `translateX(100%)`,
          }}
        >
          <div className="flex h-full flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {rightSidebarContent}
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside
      className={`border-separator bg-surface relative flex h-full shrink-0 flex-col overflow-clip border-l ${
        isResizing ? "" : "ease-out-quart transition-[width] duration-300"
      }`}
      style={{ width: rightSidebarOpen ? sidebarWidth : 0 }}
    >
      <div
        aria-hidden
        className={`absolute top-0 left-0 h-full w-2 -translate-x-1/2 cursor-col-resize transition-opacity ${
          rightSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        } ${isDrawerMode ? "pointer-events-none opacity-0" : ""}`}
        {...resizeHandleProps}
      >
        <div className="mx-auto h-full w-px bg-border/40" />
      </div>
      <div className="flex h-full flex-col" style={{ width: sidebarWidth }}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {rightSidebarContent}
        </div>
      </div>
    </aside>
  );
}
