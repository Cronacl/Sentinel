export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCE_VALUES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const THEME_PREFERENCE_STORAGE_KEY = "sentinel.theme-preference";

export const THEME_OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "Use the light theme.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the dark theme.",
  },
  {
    value: "system",
    label: "System",
    description: "Match your device theme.",
  },
] as const;

export function resolveThemePreference(
  preference: ThemePreference,
): ResolvedTheme {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyThemePreference(preference: ThemePreference) {
  const resolved = resolveThemePreference(preference);

  if (typeof document === "undefined") {
    return resolved;
  }

  const root = document.documentElement;
  (
    window as typeof window & { __sentinelThemePreference?: ThemePreference }
  ).__sentinelThemePreference = preference;
  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Ignore localStorage write failures and continue with the applied theme.
  }

  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");

  return resolved;
}

export function getThemeInitScript(
  fallbackPreference: ThemePreference = DEFAULT_THEME_PREFERENCE,
) {
  return `(function(){var k=${JSON.stringify(
    THEME_PREFERENCE_STORAGE_KEY,
  )};var p=${JSON.stringify(
    fallbackPreference,
  )};try{var s=window.localStorage.getItem(k);if(s==="light"||s==="dark"||s==="system"){p=s;}}catch{}var d=document.documentElement;var t=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.classList.toggle("dark",t==="dark");window.__sentinelThemePreference=p;})();`;
}
