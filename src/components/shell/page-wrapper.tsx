"use client";

import type { PropsWithChildren, ReactNode } from "react";

import { useShell } from "./shell-context";
import { SidebarToggle } from "./sidebar-toggle";
import { ScrollShadow } from "@heroui/react";

interface PageWrapperProps extends PropsWithChildren {
  /** Page title shown in the header. */
  title?: string;
  /** Subtitle or description rendered below the title. */
  subtitle?: ReactNode;
  /** Slot for action buttons rendered at the end of the header row. */
  actions?: ReactNode;
  /** Constrain content to a max-width. Defaults to none (full width). */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Remove default horizontal padding. Useful for edge-to-edge layouts like tables. */
  flush?: boolean;
}

const maxWidthMap = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "",
} as const;

export function PageWrapper({
  title,
  subtitle,
  actions,
  maxWidth = "full",
  flush = false,
  children,
}: PageWrapperProps) {
  const { leftSidebarOpen, isMobile } = useShell();
  const showToggle = !leftSidebarOpen || isMobile;

  const hasHeader = title || showToggle || actions;

  return (
    <div className="flex w-full items-start h-full flex-col overflow-hidden">
      {hasHeader && (
        <header
          className="app-region-no-drag flex shrink-0 items-center gap-3 px-4 lg:px-6"
          style={{ minHeight: 44 }}
        >
          {showToggle && <SidebarToggle className="app-region-no-drag" />}

          {title && (
            <div className="min-w-0 flex-1">
              <h1 className="text-foreground truncate text-sm font-medium">
                {title}
              </h1>
              {subtitle && (
                <p className="text-muted truncate text-xs">{subtitle}</p>
              )}
            </div>
          )}

          {!title && <div className="flex-1" />}

          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}

      <div className="flex w-full flex-1 overflow-y-auto">
        <ScrollShadow
          className={`w-full h-[calc(100vh-44px)] overflow-y-auto ${
            flush ? "" : "px-4 py-4 lg:px-5 lg:py-5"
          }`}
        >
          {children}
        </ScrollShadow>
      </div>
    </div>
  );
}
