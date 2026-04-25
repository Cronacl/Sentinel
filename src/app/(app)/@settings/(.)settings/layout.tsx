"use client";

import { useRouter } from "next/navigation";
import { type PropsWithChildren, useCallback } from "react";

import { DesktopTitleBar } from "@/components/shell/sidebar-window-chrome";
import { getDesktopApi } from "@/lib/desktop/client";
import { useShortcutAction, useShortcutScope } from "@/lib/shortcuts/provider";

const SETTINGS_SIDEBAR_WIDTH = 224;

export default function SettingsModalLayout({ children }: PropsWithChildren) {
  const router = useRouter();

  const desktop = getDesktopApi();
  const platform = desktop?.app.platform ?? null;
  const isWindows = platform === "win32";
  const settingsScope = useShortcutScope({
    kind: "overlay",
  });

  const close = useCallback(() => {
    router.back();
  }, [router]);
  useShortcutAction("overlay.close", close, {
    scopeId: settingsScope.id,
  });

  return (
    <div className="sentinel-settings-modal-root pointer-events-none fixed inset-0 z-50 flex flex-col">
      {isWindows ? (
        <div className="pointer-events-auto">
          <DesktopTitleBar platform="win32" />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div
          aria-hidden
          className="shrink-0"
          style={{ width: SETTINGS_SIDEBAR_WIDTH }}
        />

        <main className="pointer-events-auto relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
