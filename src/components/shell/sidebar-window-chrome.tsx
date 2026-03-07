"use client";

import { getDesktopApi } from "@/lib/desktop/client";

import { SidebarToggle } from "./sidebar-toggle";

function TrafficLightButton({
  ariaLabel,
  colorClassName,
  onPress,
}: {
  ariaLabel: string;
  colorClassName: string;
  onPress: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`app-region-no-drag h-3.5 w-3.5 min-w-3.5 min-h-3.5 rounded-full transition-transform hover:scale-105 ${colorClassName}`}
      onClick={onPress}
      type="button"
    />
  );
}

export function SidebarWindowChrome() {
  const desktop = getDesktopApi();

  return (
    <div className="app-region-drag grid h-14 shrink-0 grid-cols-[52px_1fr_52px] items-center px-4">
      <div className="flex items-center gap-2">
        <TrafficLightButton
          ariaLabel="Close window"
          colorClassName="bg-[#ff5f57]"
          onPress={() => void desktop?.window.close()}
        />
        <TrafficLightButton
          ariaLabel="Minimize window"
          colorClassName="bg-[#febc2e]"
          onPress={() => void desktop?.window.minimize()}
        />
        <TrafficLightButton
          ariaLabel="Maximize window"
          colorClassName="bg-[#28c840]"
          onPress={() => void desktop?.window.toggleMaximize()}
        />
      </div>

      <div className="flex justify-center">
        <SidebarToggle className="app-region-no-drag" />
      </div>

      <div aria-hidden className="w-[52px]" />
    </div>
  );
}
