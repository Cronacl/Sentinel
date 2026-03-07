import type { SentinelDesktopApi } from "@/lib/desktop/contracts";

export function getDesktopApi(): SentinelDesktopApi | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sentinelDesktop ?? null;
}

export function isDesktopRuntime() {
  return getDesktopApi() !== null;
}
