"use client";

import { useEffect } from "react";

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

    const themeWindow = window as ThemeWindow;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      applyThemePreference(
        themeWindow.__sentinelThemePreference ?? DEFAULT_THEME_PREFERENCE,
      );
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
