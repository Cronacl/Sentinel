"use client";

import { ScrollShadow } from "@heroui/react";
import type { PropsWithChildren, ReactNode } from "react";

import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import { useShell } from "@/components/shell/shell-context";

interface SettingsPageWrapperProps extends PropsWithChildren {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function SettingsPageWrapper({
  title,
  subtitle,
  actions,
  children,
}: SettingsPageWrapperProps) {
  const { leftSidebarOpen } = useShell();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <ScrollShadow className="h-[calc(100vh-0.25rem)] w-full overflow-y-auto px-6 py-8 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="app-region-no-drag min-w-0">
              <div className="flex items-center gap-3">
                {!leftSidebarOpen ? (
                  <SidebarToggle className="app-region-no-drag rounded-xl border border-white/10 bg-white/[0.02]" />
                ) : null}
                <h1 className="text-foreground text-xl font-medium tracking-tight">
                  {title}
                </h1>
              </div>
              {subtitle && (
                <p className="text-muted mt-1 text-sm">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
          </div>
          {children}
        </div>
      </ScrollShadow>
    </div>
  );
}
