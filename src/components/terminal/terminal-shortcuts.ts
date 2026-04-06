import type { DesktopPlatform } from "@/lib/desktop/contracts";

function resolveShortcutPlatform(platform?: DesktopPlatform | null) {
  if (platform) {
    return platform;
  }

  if (typeof navigator !== "undefined") {
    const navigatorPlatform = navigator.platform.toLowerCase();
    if (navigatorPlatform.includes("mac")) {
      return "darwin";
    }
    if (navigatorPlatform.includes("win")) {
      return "win32";
    }
  }

  return "linux";
}

export function isTerminalToggleShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
  platform?: DesktopPlatform | null,
) {
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "j") {
    return false;
  }

  const resolvedPlatform = resolveShortcutPlatform(platform);

  if (resolvedPlatform === "darwin") {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}
