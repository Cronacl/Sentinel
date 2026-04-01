export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;
export const CODE_THEME_VALUES = [
  "default",
  "github",
  "cursor",
  "vercel",
  "nord",
  "dracula",
  "rose-pine",
  "night-owl",
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
    description: "The minimal, precision-focused Cursor editor palette.",
    label: "Cursor",
    value: "cursor",
  },
  {
    description: "Vercel's clean, monochrome-accented design language.",
    label: "Vercel",
    value: "vercel",
  },
  {
    description: "Arctic, north-bluish palette inspired by polar landscapes.",
    label: "Nord",
    value: "nord",
  },
  {
    description: "The iconic dark palette with vibrant pastel accents.",
    label: "Dracula",
    value: "dracula",
  },
  {
    description: "Soft, muted tones inspired by pine and dawn.",
    label: "Rosé Pine",
    value: "rose-pine",
  },
  {
    description: "A theme fine-tuned for late-night coding sessions.",
    label: "Night Owl",
    value: "night-owl",
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
  cursor: {
    dark: {
      background: "#1e1e1e",
      foreground: "#cccccc",
      "token-changed": "#4fc1ff",
      "token-comment": "#6a9955",
      "token-constant": "#4fc1ff",
      "token-deleted": "#f44747",
      "token-function": "#dcdcaa",
      "token-inserted": "#b5cea8",
      "token-keyword": "#c586c0",
      "token-link": "#4fc1ff",
      "token-parameter": "#9cdcfe",
      "token-punctuation": "#d4d4d4",
      "token-string": "#ce9178",
      "token-string-expression": "#d7ba7d",
    },
    light: {
      background: "#ffffff",
      foreground: "#333333",
      "token-changed": "#0451a5",
      "token-comment": "#008000",
      "token-constant": "#0000ff",
      "token-deleted": "#a31515",
      "token-function": "#795e26",
      "token-inserted": "#098658",
      "token-keyword": "#af00db",
      "token-link": "#0451a5",
      "token-parameter": "#001080",
      "token-punctuation": "#393a34",
      "token-string": "#a31515",
      "token-string-expression": "#811f3f",
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
  dracula: {
    dark: {
      background: "#282a36",
      foreground: "#f8f8f2",
      "token-changed": "#8be9fd",
      "token-comment": "#6272a4",
      "token-constant": "#bd93f9",
      "token-deleted": "#ff5555",
      "token-function": "#50fa7b",
      "token-inserted": "#50fa7b",
      "token-keyword": "#ff79c6",
      "token-link": "#8be9fd",
      "token-parameter": "#ffb86c",
      "token-punctuation": "#f8f8f2",
      "token-string": "#f1fa8c",
      "token-string-expression": "#50fa7b",
    },
    light: {
      background: "#f8f8f2",
      foreground: "#282a36",
      "token-changed": "#0e7fc0",
      "token-comment": "#9ea8c7",
      "token-constant": "#7c3aed",
      "token-deleted": "#dc2626",
      "token-function": "#16803c",
      "token-inserted": "#16803c",
      "token-keyword": "#d946a8",
      "token-link": "#0e7fc0",
      "token-parameter": "#c2590a",
      "token-punctuation": "#44475a",
      "token-string": "#8b7500",
      "token-string-expression": "#16803c",
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
  "night-owl": {
    dark: {
      background: "#011627",
      foreground: "#d6deeb",
      "token-changed": "#80cbc4",
      "token-comment": "#637777",
      "token-constant": "#82aaff",
      "token-deleted": "#ef5350",
      "token-function": "#82aaff",
      "token-inserted": "#addb67",
      "token-keyword": "#c792ea",
      "token-link": "#80cbc4",
      "token-parameter": "#d7dbe0",
      "token-punctuation": "#7fdbca",
      "token-string": "#ecc48d",
      "token-string-expression": "#addb67",
    },
    light: {
      background: "#fbfbfb",
      foreground: "#403f53",
      "token-changed": "#2aa298",
      "token-comment": "#989fb1",
      "token-constant": "#4876d6",
      "token-deleted": "#bc3f3c",
      "token-function": "#4876d6",
      "token-inserted": "#4876d6",
      "token-keyword": "#994cc3",
      "token-link": "#2aa298",
      "token-parameter": "#403f53",
      "token-punctuation": "#0c969b",
      "token-string": "#c96765",
      "token-string-expression": "#4876d6",
    },
  },
  nord: {
    dark: {
      background: "#2e3440",
      foreground: "#d8dee9",
      "token-changed": "#ebcb8b",
      "token-comment": "#616e88",
      "token-constant": "#b48ead",
      "token-deleted": "#bf616a",
      "token-function": "#88c0d0",
      "token-inserted": "#a3be8c",
      "token-keyword": "#81a1c1",
      "token-link": "#88c0d0",
      "token-parameter": "#d8dee9",
      "token-punctuation": "#eceff4",
      "token-string": "#a3be8c",
      "token-string-expression": "#8fbcbb",
    },
    light: {
      background: "#eceff4",
      foreground: "#2e3440",
      "token-changed": "#b58900",
      "token-comment": "#8c96a4",
      "token-constant": "#9b4dca",
      "token-deleted": "#bf616a",
      "token-function": "#2e7d9f",
      "token-inserted": "#637832",
      "token-keyword": "#5e81ac",
      "token-link": "#2e7d9f",
      "token-parameter": "#3b4252",
      "token-punctuation": "#4c566a",
      "token-string": "#637832",
      "token-string-expression": "#2e8b7a",
    },
  },
  "rose-pine": {
    dark: {
      background: "#191724",
      foreground: "#e0def4",
      "token-changed": "#f6c177",
      "token-comment": "#6e6a86",
      "token-constant": "#c4a7e7",
      "token-deleted": "#eb6f92",
      "token-function": "#9ccfd8",
      "token-inserted": "#31748f",
      "token-keyword": "#eb6f92",
      "token-link": "#9ccfd8",
      "token-parameter": "#f6c177",
      "token-punctuation": "#908caa",
      "token-string": "#f6c177",
      "token-string-expression": "#31748f",
    },
    light: {
      background: "#faf4ed",
      foreground: "#575279",
      "token-changed": "#ea9d34",
      "token-comment": "#9893a5",
      "token-constant": "#907aa9",
      "token-deleted": "#b4637a",
      "token-function": "#56949f",
      "token-inserted": "#286983",
      "token-keyword": "#b4637a",
      "token-link": "#56949f",
      "token-parameter": "#ea9d34",
      "token-punctuation": "#797593",
      "token-string": "#ea9d34",
      "token-string-expression": "#286983",
    },
  },
  vercel: {
    dark: {
      background: "#111111",
      foreground: "#ededed",
      "token-changed": "#52a8ff",
      "token-comment": "#666666",
      "token-constant": "#52a8ff",
      "token-deleted": "#ee5d5d",
      "token-function": "#ededed",
      "token-inserted": "#42b883",
      "token-keyword": "#ee5d5d",
      "token-link": "#52a8ff",
      "token-parameter": "#cba6f7",
      "token-punctuation": "#888888",
      "token-string": "#42b883",
      "token-string-expression": "#52a8ff",
    },
    light: {
      background: "#fafafa",
      foreground: "#171717",
      "token-changed": "#0070f3",
      "token-comment": "#999999",
      "token-constant": "#0070f3",
      "token-deleted": "#e00",
      "token-function": "#171717",
      "token-inserted": "#067a46",
      "token-keyword": "#e00",
      "token-link": "#0070f3",
      "token-parameter": "#7928ca",
      "token-punctuation": "#666666",
      "token-string": "#067a46",
      "token-string-expression": "#0070f3",
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
