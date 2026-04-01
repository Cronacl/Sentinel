import { registerCustomTheme } from "@pierre/diffs";
import { createCssVariablesTheme, type ThemeRegistration } from "shiki";

export const SENTINEL_LIGHT_CODE_THEME_NAME = "sentinel-light";
export const SENTINEL_DARK_CODE_THEME_NAME = "sentinel-dark";

const LIGHT_VARIABLE_DEFAULTS = {
  background: "#f5f5f5",
  foreground: "#111111",
  "ansi-black": "#111827",
  "ansi-red": "#cf222e",
  "ansi-green": "#116329",
  "ansi-yellow": "#9a6700",
  "ansi-blue": "#0550ae",
  "ansi-magenta": "#8250df",
  "ansi-cyan": "#0f766e",
  "ansi-white": "#6e7781",
  "ansi-bright-black": "#6e7781",
  "ansi-bright-red": "#cf222e",
  "ansi-bright-green": "#116329",
  "ansi-bright-yellow": "#9a6700",
  "ansi-bright-blue": "#0550ae",
  "ansi-bright-magenta": "#8250df",
  "ansi-bright-cyan": "#0f766e",
  "ansi-bright-white": "#111111",
  "token-changed": "#0550ae",
  "token-comment": "#6e7781",
  "token-constant": "#0550ae",
  "token-deleted": "#cf222e",
  "token-function": "#8250df",
  "token-inserted": "#116329",
  "token-keyword": "#cf222e",
  "token-link": "#0969da",
  "token-parameter": "#953800",
  "token-punctuation": "#57606a",
  "token-string": "#0a3069",
  "token-string-expression": "#116329",
} as const;

const DARK_VARIABLE_DEFAULTS = {
  background: "#0d0d0d",
  foreground: "#e5e5e5",
  "ansi-black": "#1a1a1a",
  "ansi-red": "#ff7b72",
  "ansi-green": "#7ee787",
  "ansi-yellow": "#e3b341",
  "ansi-blue": "#79c0ff",
  "ansi-magenta": "#d2a8ff",
  "ansi-cyan": "#39c5cf",
  "ansi-white": "#8b949e",
  "ansi-bright-black": "#8b949e",
  "ansi-bright-red": "#ff7b72",
  "ansi-bright-green": "#7ee787",
  "ansi-bright-yellow": "#e3b341",
  "ansi-bright-blue": "#79c0ff",
  "ansi-bright-magenta": "#d2a8ff",
  "ansi-bright-cyan": "#39c5cf",
  "ansi-bright-white": "#e5e5e5",
  "token-changed": "#79c0ff",
  "token-comment": "#8b949e",
  "token-constant": "#79c0ff",
  "token-deleted": "#ff7b72",
  "token-function": "#d2a8ff",
  "token-inserted": "#7ee787",
  "token-keyword": "#ff7b72",
  "token-link": "#58a6ff",
  "token-parameter": "#ffa657",
  "token-punctuation": "#c9d1d9",
  "token-string": "#a5d6ff",
  "token-string-expression": "#7ee787",
} as const;

export const SENTINEL_LIGHT_CODE_THEME: ThemeRegistration =
  createCssVariablesTheme({
    fontStyle: false,
    name: SENTINEL_LIGHT_CODE_THEME_NAME,
    variableDefaults: LIGHT_VARIABLE_DEFAULTS,
    variablePrefix: "--syntax-",
  });

export const SENTINEL_DARK_CODE_THEME: ThemeRegistration =
  createCssVariablesTheme({
    fontStyle: false,
    name: SENTINEL_DARK_CODE_THEME_NAME,
    variableDefaults: DARK_VARIABLE_DEFAULTS,
    variablePrefix: "--syntax-",
  });

let pierreThemesRegistered = false;

export function ensureSentinelDiffThemesRegistered() {
  if (pierreThemesRegistered) {
    return;
  }

  pierreThemesRegistered = true;

  registerCustomTheme(SENTINEL_LIGHT_CODE_THEME_NAME, () =>
    Promise.resolve(SENTINEL_LIGHT_CODE_THEME),
  );
  registerCustomTheme(SENTINEL_DARK_CODE_THEME_NAME, () =>
    Promise.resolve(SENTINEL_DARK_CODE_THEME),
  );
}

export function getSentinelCodeThemeName(theme: "light" | "dark") {
  return theme === "light"
    ? SENTINEL_LIGHT_CODE_THEME_NAME
    : SENTINEL_DARK_CODE_THEME_NAME;
}
