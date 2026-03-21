"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { Toaster } from "sileo";

import { ThemeSync } from "@/components/theme/theme-sync";
import {
  DEFAULT_THEME_PREFERENCE,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";
import { TRPCReactProvider } from "@/trpc/react";

type ThemeWindow = Window & {
  __sentinelThemePreference?: ThemePreference;
};

export function Providers({ children }: PropsWithChildren) {
  const [toasterTheme, setToasterTheme] = useState<ResolvedTheme>("dark");
  const toasterOptions =
    toasterTheme === "dark"
      ? {
          duration: 2200,
          fill: "#000",
          roundness: 16,
          styles: {
            badge: "bg-white/10!",
            button: "bg-white/10! text-white! hover:bg-white/15!",
            description: "text-white/72!",
            title: "text-white!",
          },
        }
      : {
          duration: 2200,
          fill: "#ffffff",
          roundness: 16,
          styles: {
            badge: "bg-black/6!",
            button: "bg-black/6! text-black! hover:bg-black/10!",
            description: "text-black/65!",
            title: "text-black!",
          },
        };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const themeWindow = window as ThemeWindow;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncToasterTheme = () => {
      setToasterTheme(
        resolveThemePreference(
          themeWindow.__sentinelThemePreference ?? DEFAULT_THEME_PREFERENCE,
        ),
      );
    };

    const handleThemeChange = () => {
      syncToasterTheme();
    };

    const handleSystemThemeChange = () => {
      if (
        (themeWindow.__sentinelThemePreference ?? DEFAULT_THEME_PREFERENCE) ===
        "system"
      ) {
        syncToasterTheme();
      }
    };

    syncToasterTheme();
    window.addEventListener("sentinel-theme-change", handleThemeChange);
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      window.removeEventListener("sentinel-theme-change", handleThemeChange);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  return (
    <TRPCReactProvider>
      <ThemeSync />
      <Toaster
        offset={{ top: 16 }}
        options={toasterOptions}
        position="top-center"
        theme={toasterTheme}
      />
      {children}
    </TRPCReactProvider>
  );
}
