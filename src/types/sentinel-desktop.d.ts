import type { SentinelDesktopApi } from "@/lib/desktop/contracts";

declare global {
  interface Window {
    sentinelDesktop?: SentinelDesktopApi;
  }
}

export {};
