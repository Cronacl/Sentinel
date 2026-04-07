"use client";

import type { ReactNode } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopPlatform } from "@/lib/desktop/contracts";

import { SidebarToggle } from "./sidebar-toggle";

type DesktopChromeMetrics = {
  sidebarChromeHeight: number;
  sidebarLeadingWidth: number;
  sidebarTrailingWidth: number;
  titleBarHeight: number;
  windowControlsWidth: number;
};

const DEFAULT_DESKTOP_CHROME_METRICS: DesktopChromeMetrics = {
  sidebarChromeHeight: 56,
  sidebarLeadingWidth: 52,
  sidebarTrailingWidth: 52,
  titleBarHeight: 0,
  windowControlsWidth: 0,
};

const DESKTOP_CHROME_METRICS: Record<DesktopPlatform, DesktopChromeMetrics> = {
  darwin: {
    sidebarChromeHeight: 56,
    sidebarLeadingWidth: 72,
    sidebarTrailingWidth: 72,
    titleBarHeight: 0,
    windowControlsWidth: 0,
  },
  linux: {
    sidebarChromeHeight: 56,
    sidebarLeadingWidth: 52,
    sidebarTrailingWidth: 112,
    titleBarHeight: 32,
    windowControlsWidth: 112,
  },
  win32: {
    sidebarChromeHeight: 56,
    sidebarLeadingWidth: 52,
    sidebarTrailingWidth: 52,
    titleBarHeight: 32,
    windowControlsWidth: 132,
  },
};

export function getDesktopChromeMetrics(
  platform: DesktopPlatform | null,
): DesktopChromeMetrics {
  return platform
    ? DESKTOP_CHROME_METRICS[platform]
    : DEFAULT_DESKTOP_CHROME_METRICS;
}

export function getDesktopWindowControlsInset(
  platform: DesktopPlatform | null,
) {
  return getDesktopChromeMetrics(platform).windowControlsWidth;
}

function WindowsMinimizeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-2.5 w-2.5"
      fill="none"
      viewBox="0 0 10 10"
    >
      <path
        d="M2 7.25h6"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="1"
      />
    </svg>
  );
}

function LinuxMaximizeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-2.5 w-2.5"
      fill="none"
      viewBox="0 0 10 10"
    >
      <rect
        height="5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1"
        width="5"
        x="2.5"
        y="2.5"
      />
    </svg>
  );
}

function WindowsMaximizeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-2.5 w-2.5"
      fill="none"
      viewBox="0 0 10 10"
    >
      <path d="M2 2.5h6v5H2z" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-2.5 w-2.5"
      fill="none"
      viewBox="0 0 10 10"
    >
      <path
        d="m2.5 2.5 5 5m0-5-5 5"
        stroke="currentColor"
        strokeLinecap="square"
        strokeWidth="1"
      />
    </svg>
  );
}

function WindowControlButton({
  ariaLabel,
  children,
  className,
  onPress,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onPress: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`app-region-no-drag flex items-center justify-center text-foreground/70 transition-colors ${className ?? ""}`}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

function LinuxWindowControls({ className }: { className?: string }) {
  const desktop = getDesktopApi();

  return (
    <div
      className={`flex h-8 items-center justify-end gap-1 ${className ?? ""}`.trim()}
    >
      <WindowControlButton
        ariaLabel="Minimize window"
        className="h-8 w-8 rounded-md hover:bg-black/6 dark:hover:bg-white/8"
        onPress={() => void desktop?.window.minimize()}
      >
        <WindowsMinimizeIcon />
      </WindowControlButton>
      <WindowControlButton
        ariaLabel="Maximize window"
        className="h-8 w-8 rounded-md hover:bg-black/6 dark:hover:bg-white/8"
        onPress={() => void desktop?.window.toggleMaximize()}
      >
        <LinuxMaximizeIcon />
      </WindowControlButton>
      <WindowControlButton
        ariaLabel="Close window"
        className="h-8 w-8 rounded-md hover:bg-black/10 dark:hover:bg-white/12 hover:text-foreground"
        onPress={() => void desktop?.window.close()}
      >
        <CloseIcon />
      </WindowControlButton>
    </div>
  );
}

function WindowsWindowControls({ className }: { className?: string }) {
  const desktop = getDesktopApi();

  return (
    <div className={`flex h-8 items-stretch ${className ?? ""}`.trim()}>
      <WindowControlButton
        ariaLabel="Minimize window"
        className="h-8 w-11 hover:bg-black/6 dark:hover:bg-white/8"
        onPress={() => void desktop?.window.minimize()}
      >
        <WindowsMinimizeIcon />
      </WindowControlButton>
      <WindowControlButton
        ariaLabel="Maximize window"
        className="h-8 w-11 hover:bg-black/6 dark:hover:bg-white/8"
        onPress={() => void desktop?.window.toggleMaximize()}
      >
        <WindowsMaximizeIcon />
      </WindowControlButton>
      <WindowControlButton
        ariaLabel="Close window"
        className="h-8 w-11 hover:bg-[#e81123] hover:text-white"
        onPress={() => void desktop?.window.close()}
      >
        <CloseIcon />
      </WindowControlButton>
    </div>
  );
}

export function DesktopTitleBar({
  platform,
}: {
  platform: Exclude<DesktopPlatform, "darwin">;
}) {
  return (
    <div className="app-region-drag flex h-8 w-full shrink-0 items-center justify-end border-b border-border/10 bg-surface">
      {platform === "linux" ? (
        <div className="app-region-no-drag">
          <LinuxWindowControls />
        </div>
      ) : (
        <div className="app-region-no-drag">
          <WindowsWindowControls />
        </div>
      )}
    </div>
  );
}

export function SidebarWindowChrome() {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const chromeMetrics = getDesktopChromeMetrics(platform);

  return (
    <div
      className="app-region-drag grid shrink-0 items-center px-3"
      style={{
        gridTemplateColumns: `${chromeMetrics.sidebarLeadingWidth}px 1fr ${chromeMetrics.sidebarTrailingWidth}px`,
        minHeight: chromeMetrics.sidebarChromeHeight,
      }}
    >
      <div aria-hidden />

      <div className="flex justify-center">
        <SidebarToggle className="app-region-no-drag" />
      </div>

      <div aria-hidden />
    </div>
  );
}
