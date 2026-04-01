"use client";

import { useEffect } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import {
  applyAppearanceSettings,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_THEME_PREFERENCE,
  readStoredAppearanceSettings,
  type AppearanceSettings,
  type ThemePreference,
} from "@/lib/appearance";
import { api } from "@/trpc/react";

type ThemeWindow = Window & {
  __sentinelAppearance?: AppearanceSettings;
  __sentinelThemePreference?: ThemePreference;
};

export function ThemeSync() {
  const { data: appearance } = api.appearance.get.useQuery();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktop = getDesktopApi();
    const themeWindow = window as ThemeWindow;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      const resolvedTheme = applyAppearanceSettings(
        themeWindow.__sentinelAppearance ??
          readStoredAppearanceSettings() ??
          DEFAULT_APPEARANCE_SETTINGS,
      );

      void desktop?.window.syncTheme(resolvedTheme.resolvedTheme);
    };

    syncTheme();

    const handleSystemChange = () => {
      if (
        (themeWindow.__sentinelThemePreference ?? DEFAULT_THEME_PREFERENCE) ===
        "system"
      ) {
        syncTheme();
      }
    };

    const handleThemeChange = () => {
      syncTheme();
    };

    mediaQuery.addEventListener("change", handleSystemChange);
    window.addEventListener("sentinel-theme-change", handleThemeChange);
    window.addEventListener("sentinel-appearance-change", handleThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemChange);
      window.removeEventListener("sentinel-theme-change", handleThemeChange);
      window.removeEventListener(
        "sentinel-appearance-change",
        handleThemeChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!appearance) {
      return;
    }

    applyAppearanceSettings(appearance);
    window.dispatchEvent(new Event("sentinel-appearance-change"));
    window.dispatchEvent(new Event("sentinel-theme-change"));
  }, [appearance]);

  return null;
}
