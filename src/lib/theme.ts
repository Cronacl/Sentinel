export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCE_VALUES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

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

export function resolveThemePreference(preference: ThemePreference) {
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
  if (typeof document === "undefined") {
    return preference;
  }

  const resolved = resolveThemePreference(preference);
  const root = document.documentElement;
  (
    window as typeof window & { __sentinelThemePreference?: ThemePreference }
  ).__sentinelThemePreference = preference;

  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");

  return resolved;
}

export function getThemeInitScript(preference: ThemePreference) {
  return `(function(){var p=${JSON.stringify(
    preference,
  )};var d=document.documentElement;var t=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.classList.toggle("dark",t==="dark");window.__sentinelThemePreference=p;})();`;
}
