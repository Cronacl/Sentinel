"use client";

import type { PropsWithChildren } from "react";

import { useShell } from "./shell-context";

export function LeftSidebar({ children }: PropsWithChildren) {
  const { leftSidebarOpen, isMobile, setLeftSidebarOpen } = useShell();

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
            leftSidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setLeftSidebarOpen(false)}
          onKeyDown={() => {}}
          role="presentation"
        />

        {/* Slide-in panel */}
        <aside
          className={`border-separator bg-surface ease-out-quart fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-300 ${
            leftSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside
      className="border-separator bg-surface ease-out-quart flex h-full shrink-0 flex-col overflow-hidden border-r transition-[width] duration-300"
      style={{ width: leftSidebarOpen ? 256 : 0 }}
    >
      <div className="flex h-full w-64 flex-col">{children}</div>
    </aside>
  );
}
