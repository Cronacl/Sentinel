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

/**
 * Whether this client can run a sign-in command in an embedded terminal
 * (the desktop app). Browsers get a command to copy instead.
 */
export function canRunDesktopTerminalCommands() {
  return typeof getDesktopApi()?.terminal.createCommand === "function";
}
