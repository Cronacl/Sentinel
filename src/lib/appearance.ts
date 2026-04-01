export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;
export const CODE_THEME_VALUES = [
  "default",
  "github",
  "one",
  "tokyo-night",
  "solarized",
  "catppuccin",
] as const;

export type ThemePreference = (typeof THEME_PREFERENCE_VALUES)[number];
export type CodeThemeName = (typeof CODE_THEME_VALUES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const THEME_PREFERENCE_STORAGE_KEY = "sentinel.theme-preference";
export const APPEARANCE_STORAGE_KEY = "sentinel.appearance";

export const DEFAULT_UI_FONT_FAMILY =
  'var(--font-satoshi), ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
export const DEFAULT_CODE_FONT_FAMILY =
  '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", "Menlo", "Monaco", "Consolas", "Liberation Mono", monospace';
export const DEFAULT_UI_FONT_SIZE = 16;
export const DEFAULT_CODE_FONT_SIZE = 12.5;
export const MIN_UI_FONT_SIZE = 14;
export const MAX_UI_FONT_SIZE = 18;
export const MIN_CODE_FONT_SIZE = 11;
export const MAX_CODE_FONT_SIZE = 16;
export const FONT_SIZE_STEP = 0.5;
export const DEFAULT_CODE_THEME: CodeThemeName = "default";

export const CODE_THEME_OPTIONS = [
  {
    description: "Current Sentinel palette.",
    label: "Default",
    value: "default",
  },
  {
    description: "GitHub's familiar light and dark code colors.",
    label: "GitHub",
    value: "github",
  },
  {
    description: "The classic One Light and One Dark pair.",
    label: "One",
    value: "one",
  },
  {
    description: "The widely used Tokyo Night editor palette.",
    label: "Tokyo Night",
    value: "tokyo-night",
  },
  {
    description: "The long-standing Solarized light and dark pair.",
    label: "Solarized",
    value: "solarized",
  },
  {
    description: "Catppuccin Latte and Mocha.",
    label: "Catppuccin",
    value: "catppuccin",
  },
] as const satisfies ReadonlyArray<{
  description: string;
  label: string;
  value: CodeThemeName;
}>;

type CodeThemePalette = {
  background: string;
  foreground: string;
  "token-changed": string;
  "token-comment": string;
  "token-constant": string;
  "token-deleted": string;
  "token-function": string;
  "token-inserted": string;
  "token-keyword": string;
  "token-link": string;
  "token-parameter": string;
  "token-punctuation": string;
  "token-string": string;
  "token-string-expression": string;
};

type CodeThemeDefinition = Record<ResolvedTheme, CodeThemePalette>;

const CODE_THEME_PALETTES: Record<CodeThemeName, CodeThemeDefinition> = {
  catppuccin: {
    dark: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      "token-changed": "#f9e2af",
      "token-comment": "#9399b2",
      "token-constant": "#89b4fa",
      "token-deleted": "#f38ba8",
      "token-function": "#89b4fa",
      "token-inserted": "#a6e3a1",
      "token-keyword": "#cba6f7",
      "token-link": "#89b4fa",
      "token-parameter": "#fab387",
      "token-punctuation": "#bac2de",
      "token-string": "#a6e3a1",
      "token-string-expression": "#94e2d5",
    },
    light: {
      background: "#eff1f5",
      foreground: "#4c4f69",
      "token-changed": "#df8e1d",
      "token-comment": "#9ca0b0",
      "token-constant": "#1e66f5",
      "token-deleted": "#d20f39",
      "token-function": "#7287fd",
      "token-inserted": "#40a02b",
      "token-keyword": "#8839ef",
      "token-link": "#1e66f5",
      "token-parameter": "#fe640b",
      "token-punctuation": "#5c5f77",
      "token-string": "#40a02b",
      "token-string-expression": "#179299",
    },
  },
  default: {
    dark: {
      background: "#0d0d0d",
      foreground: "#e5e5e5",
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
    },
    light: {
      background: "#f5f5f5",
      foreground: "#111111",
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
    },
  },
  github: {
    dark: {
      background: "#0d1117",
      foreground: "#c9d1d9",
      "token-changed": "#58a6ff",
      "token-comment": "#8b949e",
      "token-constant": "#79c0ff",
      "token-deleted": "#f85149",
      "token-function": "#d2a8ff",
      "token-inserted": "#3fb950",
      "token-keyword": "#ff7b72",
      "token-link": "#58a6ff",
      "token-parameter": "#ffa657",
      "token-punctuation": "#c9d1d9",
      "token-string": "#a5d6ff",
      "token-string-expression": "#7ee787",
    },
    light: {
      background: "#ffffff",
      foreground: "#24292f",
      "token-changed": "#0969da",
      "token-comment": "#6e7781",
      "token-constant": "#0550ae",
      "token-deleted": "#cf222e",
      "token-function": "#8250df",
      "token-inserted": "#1a7f37",
      "token-keyword": "#cf222e",
      "token-link": "#0969da",
      "token-parameter": "#953800",
      "token-punctuation": "#57606a",
      "token-string": "#0a3069",
      "token-string-expression": "#1a7f37",
    },
  },
  one: {
    dark: {
      background: "#282c34",
      foreground: "#abb2bf",
      "token-changed": "#e5c07b",
      "token-comment": "#5c6370",
      "token-constant": "#d19a66",
      "token-deleted": "#e06c75",
      "token-function": "#61afef",
      "token-inserted": "#98c379",
      "token-keyword": "#c678dd",
      "token-link": "#61afef",
      "token-parameter": "#e5c07b",
      "token-punctuation": "#abb2bf",
      "token-string": "#98c379",
      "token-string-expression": "#56b6c2",
    },
    light: {
      background: "#fafafa",
      foreground: "#383a42",
      "token-changed": "#c18401",
      "token-comment": "#a0a1a7",
      "token-constant": "#986801",
      "token-deleted": "#e45649",
      "token-function": "#4078f2",
      "token-inserted": "#50a14f",
      "token-keyword": "#a626a4",
      "token-link": "#4078f2",
      "token-parameter": "#c18401",
      "token-punctuation": "#383a42",
      "token-string": "#50a14f",
      "token-string-expression": "#0184bc",
    },
  },
  solarized: {
    dark: {
      background: "#002b36",
      foreground: "#839496",
      "token-changed": "#b58900",
      "token-comment": "#586e75",
      "token-constant": "#268bd2",
      "token-deleted": "#dc322f",
      "token-function": "#268bd2",
      "token-inserted": "#859900",
      "token-keyword": "#859900",
      "token-link": "#268bd2",
      "token-parameter": "#b58900",
      "token-punctuation": "#93a1a1",
      "token-string": "#2aa198",
      "token-string-expression": "#2aa198",
    },
    light: {
      background: "#fdf6e3",
      foreground: "#657b83",
      "token-changed": "#b58900",
      "token-comment": "#93a1a1",
      "token-constant": "#268bd2",
      "token-deleted": "#dc322f",
      "token-function": "#268bd2",
      "token-inserted": "#859900",
      "token-keyword": "#859900",
      "token-link": "#268bd2",
      "token-parameter": "#b58900",
      "token-punctuation": "#657b83",
      "token-string": "#2aa198",
      "token-string-expression": "#2aa198",
    },
  },
  "tokyo-night": {
    dark: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      "token-changed": "#e0af68",
      "token-comment": "#565f89",
      "token-constant": "#7aa2f7",
      "token-deleted": "#f7768e",
      "token-function": "#7aa2f7",
      "token-inserted": "#9ece6a",
      "token-keyword": "#bb9af7",
      "token-link": "#7dcfff",
      "token-parameter": "#e0af68",
      "token-punctuation": "#a9b1d6",
      "token-string": "#9ece6a",
      "token-string-expression": "#73daca",
    },
    light: {
      background: "#e1e2e7",
      foreground: "#3760bf",
      "token-changed": "#8c6c3e",
      "token-comment": "#848cb5",
      "token-constant": "#2e7de9",
      "token-deleted": "#f52a65",
      "token-function": "#2e7de9",
      "token-inserted": "#587539",
      "token-keyword": "#9854f1",
      "token-link": "#2e7de9",
      "token-parameter": "#8c6c3e",
      "token-punctuation": "#6172b0",
      "token-string": "#587539",
      "token-string-expression": "#0f8b8d",
    },
  },
};

export type AppearanceSettings = {
  codeFontFamily: string;
  codeFontSize: number;
  codeTheme: CodeThemeName;
  themePreference: ThemePreference;
  uiFontFamily: string;
  uiFontSize: number;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  codeTheme: DEFAULT_CODE_THEME,
  themePreference: DEFAULT_THEME_PREFERENCE,
  uiFontFamily: DEFAULT_UI_FONT_FAMILY,
  uiFontSize: DEFAULT_UI_FONT_SIZE,
};

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

export function sanitizeAppearanceSettings(
  value?: Partial<AppearanceSettings> | null,
): AppearanceSettings {
  return {
    themePreference:
      value?.themePreference &&
      THEME_PREFERENCE_VALUES.includes(value.themePreference)
        ? value.themePreference
        : DEFAULT_THEME_PREFERENCE,
    uiFontFamily:
      typeof value?.uiFontFamily === "string" && value.uiFontFamily.trim()
        ? value.uiFontFamily.trim()
        : DEFAULT_UI_FONT_FAMILY,
    codeFontFamily:
      typeof value?.codeFontFamily === "string" && value.codeFontFamily.trim()
        ? value.codeFontFamily.trim()
        : DEFAULT_CODE_FONT_FAMILY,
    codeTheme:
      value?.codeTheme && CODE_THEME_VALUES.includes(value.codeTheme)
        ? value.codeTheme
        : DEFAULT_CODE_THEME,
    uiFontSize:
      typeof value?.uiFontSize === "number" &&
      Number.isFinite(value.uiFontSize) &&
      value.uiFontSize >= MIN_UI_FONT_SIZE &&
      value.uiFontSize <= MAX_UI_FONT_SIZE
        ? value.uiFontSize
        : DEFAULT_UI_FONT_SIZE,
    codeFontSize:
      typeof value?.codeFontSize === "number" &&
      Number.isFinite(value.codeFontSize) &&
      value.codeFontSize >= MIN_CODE_FONT_SIZE &&
      value.codeFontSize <= MAX_CODE_FONT_SIZE
        ? value.codeFontSize
        : DEFAULT_CODE_FONT_SIZE,
  };
}

export function readStoredAppearanceSettings(): AppearanceSettings {
  if (typeof window === "undefined") {
    return DEFAULT_APPEARANCE_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_APPEARANCE_SETTINGS;
    }

    return sanitizeAppearanceSettings(JSON.parse(raw) as AppearanceSettings);
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

export function applyAppearanceSettings(settings: AppearanceSettings) {
  const nextSettings = sanitizeAppearanceSettings(settings);
  const resolvedTheme = resolveThemePreference(nextSettings.themePreference);

  if (typeof document === "undefined") {
    return { resolvedTheme, settings: nextSettings };
  }

  const root = document.documentElement;
  (
    window as typeof window & {
      __sentinelAppearance?: AppearanceSettings;
      __sentinelThemePreference?: ThemePreference;
    }
  ).__sentinelAppearance = nextSettings;
  (
    window as typeof window & {
      __sentinelThemePreference?: ThemePreference;
    }
  ).__sentinelThemePreference = nextSettings.themePreference;

  try {
    window.localStorage.setItem(
      THEME_PREFERENCE_STORAGE_KEY,
      nextSettings.themePreference,
    );
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(nextSettings),
    );
  } catch {
    // Ignore local storage failures and still apply the appearance.
  }

  root.setAttribute("data-theme", resolvedTheme);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.setProperty("--app-font-sans", nextSettings.uiFontFamily);
  root.style.setProperty("--app-font-display", nextSettings.uiFontFamily);
  root.style.setProperty("--app-font-mono", nextSettings.codeFontFamily);
  root.style.setProperty("--app-ui-font-size", `${nextSettings.uiFontSize}px`);
  root.style.setProperty(
    "--app-code-font-size",
    `${nextSettings.codeFontSize}px`,
  );
  root.setAttribute("data-code-theme", nextSettings.codeTheme);

  const codeThemePalette = getCodeThemePalette(
    nextSettings.codeTheme,
    resolvedTheme,
  );
  for (const [token, value] of Object.entries(codeThemePalette)) {
    root.style.setProperty(`--syntax-${token}`, value);
  }

  return { resolvedTheme, settings: nextSettings };
}

export function applyThemePreference(preference: ThemePreference) {
  const current =
    typeof window === "undefined"
      ? DEFAULT_APPEARANCE_SETTINGS
      : readStoredAppearanceSettings();

  return applyAppearanceSettings({
    ...current,
    themePreference: preference,
  }).resolvedTheme;
}

export function getAppearanceInitScript() {
  return `(function(){var tk=${JSON.stringify(
    THEME_PREFERENCE_STORAGE_KEY,
  )};var ak=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var d=${JSON.stringify(
    DEFAULT_APPEARANCE_SETTINGS,
  )};var p=${JSON.stringify(CODE_THEME_PALETTES)};var a=d;try{var raw=window.localStorage.getItem(ak);if(raw){a=Object.assign({},d,JSON.parse(raw));}}catch{}try{var tp=window.localStorage.getItem(tk);if(tp==="light"||tp==="dark"||tp==="system"){a.themePreference=tp;}}catch{}var root=document.documentElement;var theme=a.themePreference==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):a.themePreference;var codeTheme=(a.codeTheme&&p[a.codeTheme])?a.codeTheme:d.codeTheme;var palette=p[codeTheme][theme]||p[d.codeTheme][theme];root.setAttribute("data-theme",theme);root.classList.toggle("dark",theme==="dark");root.setAttribute("data-code-theme",codeTheme);root.style.setProperty("--app-font-sans",a.uiFontFamily||d.uiFontFamily);root.style.setProperty("--app-font-display",a.uiFontFamily||d.uiFontFamily);root.style.setProperty("--app-font-mono",a.codeFontFamily||d.codeFontFamily);root.style.setProperty("--app-ui-font-size",(a.uiFontSize||d.uiFontSize)+"px");root.style.setProperty("--app-code-font-size",(a.codeFontSize||d.codeFontSize)+"px");for(var key in palette){root.style.setProperty("--syntax-"+key,palette[key]);}window.__sentinelThemePreference=a.themePreference||d.themePreference;window.__sentinelAppearance=Object.assign({},a,{codeTheme:codeTheme});})();`;
}

export function getCodeThemePalette(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return CODE_THEME_PALETTES[codeTheme][resolvedTheme];
}
