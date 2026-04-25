"use client";

const SETTINGS_RETURN_PATH_KEY = "sentinel.settings.returnPath";

type RouterLike = {
  push: (href: string) => void;
};

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isSettingsPath(path: string) {
  return path === "/settings" || path.startsWith("/settings/");
}

export function rememberSettingsReturnPath(currentPath = getCurrentPath()) {
  if (typeof window === "undefined" || isSettingsPath(currentPath)) {
    return;
  }

  window.sessionStorage.setItem(SETTINGS_RETURN_PATH_KEY, currentPath);
}

export function openSettingsRoute(
  router: RouterLike,
  href = "/settings",
  currentPath?: string,
) {
  rememberSettingsReturnPath(currentPath);
  router.push(href);
}

export function closeSettingsRoute(router: RouterLike, fallback = "/") {
  if (typeof window === "undefined") {
    router.push(fallback);
    return;
  }

  const returnPath =
    window.sessionStorage.getItem(SETTINGS_RETURN_PATH_KEY) ?? fallback;

  window.sessionStorage.removeItem(SETTINGS_RETURN_PATH_KEY);
  router.push(isSettingsPath(returnPath) ? fallback : returnPath);
}
