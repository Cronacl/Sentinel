"use client";

import type { PropsWithChildren } from "react";

import { useShell } from "./shell-context";

export function LeftSidebar({ children }: PropsWithChildren) {
  const { leftSidebarOpen } = useShell();

  return (
    <aside
      className="border-separator/70 bg-surface ease-out-quart flex h-full shrink-0 flex-col overflow-clip border-r transition-[width] duration-300"
      style={{ width: leftSidebarOpen ? 224 : 0 }}
    >
      <div className="flex h-full w-56 flex-col">{children}</div>
    </aside>
  );
}
