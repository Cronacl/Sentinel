"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

import { useShell } from "./shell-context";

const SIDEBAR_WIDTH = 380;
const DRAWER_BREAKPOINT = "(max-width: 1024px)";

export function RightSidebar() {
  const { rightSidebarOpen, rightSidebarContent, closeRightSidebar } =
    useShell();
  const isDrawerMode = useMediaQuery(DRAWER_BREAKPOINT);

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
          className="bg-surface border-separator ease-out-quart fixed top-0 right-0 z-50 flex h-dvh flex-col border-l shadow-xl transition-transform duration-300"
          style={{
            width: SIDEBAR_WIDTH,
            maxWidth: "90vw",
            transform: rightSidebarOpen
              ? "translateX(0)"
              : `translateX(100%)`,
          }}
        >
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">{rightSidebarContent}</div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside
      className="border-separator bg-surface ease-out-quart flex h-full shrink-0 flex-col overflow-clip border-l transition-[width] duration-300"
      style={{ width: rightSidebarOpen ? SIDEBAR_WIDTH : 0 }}
    >
      <div className="flex h-full flex-col" style={{ width: SIDEBAR_WIDTH }}>
        <div className="min-h-0 flex-1">{rightSidebarContent}</div>
      </div>
    </aside>
  );
}
