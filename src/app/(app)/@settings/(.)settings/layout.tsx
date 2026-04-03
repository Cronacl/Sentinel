"use client";

import { Button } from "@heroui/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
import { type PropsWithChildren, useCallback } from "react";

import { SETTINGS_NAV } from "@/components/settings/settings-nav";
import { getDesktopApi } from "@/lib/desktop/client";
import { useShortcutAction, useShortcutScope } from "@/lib/shortcuts/provider";

const SETTINGS_SIDEBAR_WIDTH = 224;

export default function SettingsModalLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();

  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const isMac = platform === "darwin";
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
    <div className="bg-surface fixed inset-0 z-50 flex">
      <aside
        className="border-separator bg-surface flex h-full shrink-0 flex-col border-r"
        style={{ width: SETTINGS_SIDEBAR_WIDTH }}
      >
        <div
          className="app-region-drag shrink-0"
          style={{ minHeight: isMac ? 56 : 40 }}
        />

        <div className="shrink-0 px-3 pb-1">
          <button
            className="text-muted hover:text-foreground inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors"
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

        <nav className="flex flex-col gap-0.5 px-3 pt-1">
          {SETTINGS_NAV.map((item) => (
            <Button
              key={item.href}
              size="sm"
              fullWidth
              variant={isActive(item.href) ? "tertiary" : "ghost"}
              className="justify-start rounded-lg"
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
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-background">
        {children}
      </main>
    </div>
  );
}
