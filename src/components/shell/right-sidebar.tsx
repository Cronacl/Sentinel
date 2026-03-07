"use client";

import { useShell } from "./shell-context";

export function RightSidebar() {
  const { rightSidebarOpen, rightSidebarContent, isMobile, closeRightSidebar } =
    useShell();

  if (!rightSidebarContent) return null;

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
            rightSidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={closeRightSidebar}
          onKeyDown={() => {}}
          role="presentation"
        />

        {/* Slide-in panel from right */}
        <aside
          className={`border-separator bg-surface ease-out-quart fixed inset-y-0 right-0 z-50 flex w-[85%] flex-col border-l transition-transform duration-300 ${
            rightSidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex-1 overflow-y-auto">{rightSidebarContent}</div>
        </aside>
      </>
    );
  }

  return (
    <aside
      className="border-separator bg-surface ease-out-quart flex h-full shrink-0 flex-col overflow-hidden border-l transition-[width] duration-300"
      style={{ width: rightSidebarOpen ? 380 : 0 }}
    >
      <div className="flex h-full flex-col" style={{ width: 380 }}>
        <div className="flex-1 overflow-y-auto">{rightSidebarContent}</div>
      </div>
    </aside>
  );
}
