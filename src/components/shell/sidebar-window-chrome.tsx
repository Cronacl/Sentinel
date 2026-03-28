"use client";

import type { ReactNode } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import type { DesktopPlatform } from "@/lib/desktop/contracts";

import { SidebarToggle } from "./sidebar-toggle";

const DESKTOP_WINDOW_CONTROLS_WIDTH: Record<
  Exclude<DesktopPlatform, "darwin">,
  number
> = {
  linux: 112,
  win32: 132,
};

export function getDesktopWindowControlsInset(
  platform: DesktopPlatform | null,
) {
  if (platform === "win32" || platform === "linux") {
    return DESKTOP_WINDOW_CONTROLS_WIDTH[platform];
  }

  return 0;
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

export function DesktopWindowControls({
  platform,
}: {
  platform: DesktopPlatform | null;
}) {
  if (platform === "linux") {
    return <LinuxWindowControls />;
  }

  return null;
}

export function SidebarWindowChrome() {
  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const isMac = platform === "darwin";
  const chromeHeight = 56;
  const edgeWidth = isMac ? 72 : 52;

  return (
    <div
      className="app-region-drag grid shrink-0 items-center px-3"
      style={{
        gridTemplateColumns: `${edgeWidth}px 1fr ${edgeWidth}px`,
        minHeight: chromeHeight,
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
