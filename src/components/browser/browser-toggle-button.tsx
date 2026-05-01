"use client";

import { WebDesign02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@heroui/react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { isDesktopRuntime } from "@/lib/desktop/client";
import { useShortcutAction } from "@/lib/shortcuts/provider";

import { BrowserSidebar } from "./browser-sidebar";
import {
  openBrowserSidebar,
  useBrowserSidebarState,
} from "./browser-sidebar-store";

export function BrowserToggleButton() {
  const isDesktop = isDesktopRuntime();
  const rightSidebar = useRightSidebar();
  const browserState = useBrowserSidebarState();

  const isBrowserSidebarActive =
    rightSidebar.isOpen &&
    rightSidebar.panelId === "browser" &&
    browserState.tabs.length > 0;

  const handleToggle = () => {
    if (isBrowserSidebarActive) {
      rightSidebar.close();
      return;
    }

    openBrowserSidebar();
    rightSidebar.open(<BrowserSidebar />, {
      panelId: "browser",
      size: "browser",
    });
  };

  useShortcutAction("browser.toggle", handleToggle, {
    enabled: isDesktop,
  });

  if (!isDesktop) {
    return null;
  }

  return (
    <Button
      aria-label="Toggle built-in browser"
      className="max-h-7"
      isIconOnly
      onPress={handleToggle}
      size="sm"
      variant={isBrowserSidebarActive ? "secondary" : "tertiary"}
    >
      <HugeiconsIcon
        color="currentColor"
        icon={WebDesign02Icon}
        size={16}
        strokeWidth={1.6}
      />
    </Button>
  );
}
