"use client";

import type { PropsWithChildren, ReactNode } from "react";

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
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="sentinel-scroll-shell h-full w-full">
        <div className="sentinel-scroll-area h-[calc(100vh-0.25rem)] w-full px-6 py-8 lg:px-8">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="app-region-no-drag min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-foreground text-xl font-medium tracking-tight">
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
