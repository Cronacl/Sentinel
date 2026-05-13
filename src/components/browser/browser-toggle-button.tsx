"use client";

import { InternetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@heroui/react";

import { useRightSidebar, useShell } from "@/components/shell/shell-context";
import { isDesktopRuntime } from "@/lib/desktop/client";
import { useShortcutAction } from "@/lib/shortcuts/provider";

import { BrowserSidebar } from "./browser-sidebar";
import {
  DEFAULT_BROWSER_URL,
  GLOBAL_BROWSER_SCOPE_ID,
  openBrowserSidebar,
  setVisibleBrowserScopeId,
  useBrowserSidebarState,
} from "./browser-sidebar-store";

export function BrowserToggleButton() {
  const isDesktop = isDesktopRuntime();
  const rightSidebar = useRightSidebar();
  const { selectedThreadId } = useShell();
  const scopeId = selectedThreadId ?? GLOBAL_BROWSER_SCOPE_ID;
  const browserState = useBrowserSidebarState(scopeId);

  const isBrowserSidebarActive =
    rightSidebar.isOpen &&
    rightSidebar.panelId === "browser" &&
    browserState.tabs.length > 0;

  const handleToggle = () => {
    if (isBrowserSidebarActive) {
      rightSidebar.close();
      return;
    }

    openBrowserSidebar(DEFAULT_BROWSER_URL, scopeId);
    setVisibleBrowserScopeId(scopeId);
    rightSidebar.open(<BrowserSidebar scopeId={scopeId} />, {
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
      className="h-7 min-h-7 w-8 min-w-8 rounded-xl"
      isIconOnly
      onPress={handleToggle}
      size="sm"
      variant={isBrowserSidebarActive ? "secondary" : "tertiary"}
    >
      <HugeiconsIcon
        color="currentColor"
        icon={InternetIcon}
        size={16}
        strokeWidth={1.6}
      />
    </Button>
  );
}
