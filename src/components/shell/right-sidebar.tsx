"use client";

import { useShell } from "./shell-context";

export function RightSidebar() {
  const { rightSidebarOpen, rightSidebarContent } = useShell();

  if (!rightSidebarContent) return null;

  return (
    <aside
      className="border-separator bg-surface ease-out-quart flex h-full shrink-0 flex-col overflow-clip border-l transition-[width] duration-300"
      style={{ width: rightSidebarOpen ? 380 : 0 }}
    >
      <div className="flex h-full flex-col" style={{ width: 380 }}>
        <div className="min-h-0 flex-1">{rightSidebarContent}</div>
      </div>
    </aside>
  );
}
