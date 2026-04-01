"use client";

import { useEffect, useState } from "react";

import { resolveTheme } from "./highlighter";

export function useResolvedTheme() {
  const [state, setState] = useState(() => ({
    theme: resolveTheme(),
    version: 0,
  }));

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const syncTheme = () => {
      setState((current) => ({
        theme: resolveTheme(),
        version: current.version + 1,
      }));
    };
    const observer = new MutationObserver(syncTheme);

    observer.observe(root, {
      attributeFilter: ["class", "data-code-theme", "data-theme", "style"],
      attributes: true,
    });
    window.addEventListener("sentinel-theme-change", syncTheme);
    window.addEventListener("sentinel-appearance-change", syncTheme);
    syncTheme();

    return () => {
      observer.disconnect();
      window.removeEventListener("sentinel-theme-change", syncTheme);
      window.removeEventListener("sentinel-appearance-change", syncTheme);
    };
  }, []);

  return state.theme;
}
