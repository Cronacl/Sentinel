"use client";

import { useEffect } from "react";

import { getDesktopApi } from "@/lib/desktop/client";
import {
  applyThemePreference,
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
} from "@/lib/theme";

type ThemeWindow = Window & {
  __sentinelThemePreference?: ThemePreference;
};

export function ThemeSync() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const desktop = getDesktopApi();
    const themeWindow = window as ThemeWindow;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      const resolvedTheme = applyThemePreference(
        themeWindow.__sentinelThemePreference ?? DEFAULT_THEME_PREFERENCE,
      );

      void desktop?.window.syncTheme(resolvedTheme);
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

    return () => {
      mediaQuery.removeEventListener("change", handleSystemChange);
      window.removeEventListener("sentinel-theme-change", handleThemeChange);
    };
  }, []);

  return null;
}
