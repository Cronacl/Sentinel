"use client";

import { getDesktopApi } from "@/lib/desktop/client";
import type { PropsWithChildren, ReactNode } from "react";

import { useShell } from "@/components/shell";
import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import {
  getDesktopChromeMetrics,
  getDesktopWindowControlsInset,
} from "@/components/shell/sidebar-window-chrome";

interface SettingsPageWrapperProps extends PropsWithChildren {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}

export function SettingsPageWrapper({
  title,
  subtitle,
  actions,
  contentClassName,
  children,
}: SettingsPageWrapperProps) {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const isMacDesktop = platform === "darwin";
  const chromeMetrics = getDesktopChromeMetrics(platform);
  const { leftSidebarOpen } = useShell();
  const leadingInset = isMacDesktop && !leftSidebarOpen ? 92 : undefined;
  const trailingInset = getDesktopWindowControlsInset(platform) || undefined;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-clip">
      <div className="sentinel-scroll-shell min-h-0 h-full w-full">
        <div
          className="sentinel-scroll-area h-full w-full px-6 py-8 lg:px-8"
          style={{
            paddingLeft: leadingInset,
            paddingTop:
              platform !== "win32" && chromeMetrics.titleBarHeight > 0
                ? 24
                : undefined,
          }}
        >
          <div className={`mx-auto w-full ${contentClassName ?? "max-w-2xl"}`}>
            <div
              className="mb-6 flex items-start justify-between gap-4"
              style={{ paddingRight: trailingInset }}
            >
              <div className="app-region-no-drag min-w-0">
                <div className="flex items-center gap-3">
                  {!leftSidebarOpen && <SidebarToggle />}
                  <h1 className="text-foreground text-xl font-medium">
                    {title}
                  </h1>
                </div>
                {subtitle && (
                  <p className="text-muted mt-1 text-sm">{subtitle}</p>
                )}
              </div>
              {actions && (
                <div className="flex shrink-0 items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
