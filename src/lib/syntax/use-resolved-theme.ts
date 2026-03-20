"use client";

import { useEffect, useState } from "react";

import { resolveTheme } from "./highlighter";

export function useResolvedTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const syncTheme = () => setTheme(resolveTheme());
    const observer = new MutationObserver(syncTheme);

    observer.observe(root, {
      attributeFilter: ["class", "data-theme"],
      attributes: true,
    });
    syncTheme();

    return () => observer.disconnect();
  }, []);

  return theme;
}
