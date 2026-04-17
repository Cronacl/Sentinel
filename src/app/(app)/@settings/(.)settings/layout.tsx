"use client";

import { Button, ScrollShadow } from "@heroui/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
import { type PropsWithChildren, useCallback } from "react";

import { SETTINGS_NAV } from "@/components/settings/settings-nav";
import {
  DesktopTitleBar,
  getDesktopChromeMetrics,
} from "@/components/shell/sidebar-window-chrome";
import { getDesktopApi } from "@/lib/desktop/client";
import { useShortcutAction, useShortcutScope } from "@/lib/shortcuts/provider";

const SETTINGS_SIDEBAR_WIDTH = 224;

export default function SettingsModalLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();

  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const isMac = platform === "darwin";
  const isWindows = platform === "win32";
  const chromeMetrics = getDesktopChromeMetrics(platform);
  const settingsScope = useShortcutScope({
    kind: "overlay",
  });

  const close = useCallback(() => {
    router.back();
  }, [router]);
  useShortcutAction("overlay.close", close, {
    scopeId: settingsScope.id,
  });

  const isActive = (href: string) =>
    href === "/settings" ? pathname === "/settings" : pathname.startsWith(href);

  return (
    <div className="bg-surface fixed inset-0 z-50 flex flex-col">
      {isWindows ? <DesktopTitleBar platform="win32" /> : null}
      <div className="flex min-h-0 flex-1">
        <aside
          className="border-separator bg-surface flex h-full min-h-0 shrink-0 flex-col"
          style={{ width: SETTINGS_SIDEBAR_WIDTH }}
        >
          <div
            className={`shrink-0 ${platform === "linux" ? "app-region-drag" : ""}`.trim()}
            style={{
              minHeight: isMac
                ? 56
                : isWindows
                  ? 0
                  : chromeMetrics.titleBarHeight + 8,
            }}
          />

          <div className="shrink-0 px-2.5 pb-1">
            <button
              className="text-foreground/60 hover:text-foreground inline-flex items-center gap-2 rounded-xl px-2.5 py-1 text-xs transition-colors"
              onClick={close}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={ArrowLeft02Icon}
                size={14}
                strokeWidth={1.5}
              />
              Back to app
            </button>
          </div>

          <ScrollShadow
            className="min-h-0 flex-1 px-2.5 pt-1 pb-3"
            hideScrollBar
            orientation="vertical"
          >
            <nav className="flex flex-col gap-0.5">
              {SETTINGS_NAV.map((item) => (
                <Button
                  key={item.href}
                  size="sm"
                  fullWidth
                  variant="ghost"
                  className={`justify-start rounded-xl px-2.5 ${
                    isActive(item.href)
                      ? "bg-default/70 text-foreground"
                      : "text-foreground/80 hover:bg-default/40 hover:text-foreground"
                  }`}
                  onPress={() => router.replace(item.href)}
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={item.icon}
                    size={15}
                    strokeWidth={1.5}
                  />
                  {item.label}
                </Button>
              ))}
            </nav>
          </ScrollShadow>
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
