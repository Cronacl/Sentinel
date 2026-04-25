import ayuDarkTheme from "@shikijs/themes/ayu-dark";
import ayuLightTheme from "@shikijs/themes/ayu-light";
import catppuccinLatteTheme from "@shikijs/themes/catppuccin-latte";
import catppuccinMochaTheme from "@shikijs/themes/catppuccin-mocha";
import everforestDarkTheme from "@shikijs/themes/everforest-dark";
import everforestLightTheme from "@shikijs/themes/everforest-light";
import githubDarkTheme from "@shikijs/themes/github-dark";
import githubLightTheme from "@shikijs/themes/github-light";
import gruvboxDarkTheme from "@shikijs/themes/gruvbox-dark-medium";
import gruvboxLightTheme from "@shikijs/themes/gruvbox-light-medium";
import kanagawaWaveTheme from "@shikijs/themes/kanagawa-wave";
import kanagawaLotusTheme from "@shikijs/themes/kanagawa-lotus";
import materialDarkTheme from "@shikijs/themes/material-theme-ocean";
import materialLightTheme from "@shikijs/themes/material-theme-lighter";
import minDarkTheme from "@shikijs/themes/min-dark";
import minLightTheme from "@shikijs/themes/min-light";
import nightOwlTheme from "@shikijs/themes/night-owl";
import nightOwlLightTheme from "@shikijs/themes/night-owl-light";
import oneDarkTheme from "@shikijs/themes/one-dark-pro";
import oneLightTheme from "@shikijs/themes/one-light";
import rosePineDarkTheme from "@shikijs/themes/rose-pine";
import rosePineLightTheme from "@shikijs/themes/rose-pine-dawn";
import solarizedDarkTheme from "@shikijs/themes/solarized-dark";
import solarizedLightTheme from "@shikijs/themes/solarized-light";
import vitesseDarkTheme from "@shikijs/themes/vitesse-dark";
import vitesseLightTheme from "@shikijs/themes/vitesse-light";
import type { ThemeRegistration } from "shiki";

export const THEME_PREFERENCE_VALUES = ["light", "dark", "system"] as const;
export const CODE_THEME_VALUES = [
  "github",
  "ayu",
  "catppuccin",
  "everforest",
  "gruvbox",
  "kanagawa",
  "material",
  "min",
  "night-owl",
  "one",
  "rose-pine",
  "solarized",
  "vitesse",
] as const;

export type ThemePreference = (typeof THEME_PREFERENCE_VALUES)[number];
export type CodeThemeName = (typeof CODE_THEME_VALUES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

type ThemeTokenSetting = {
  scope?: string | string[];
  settings?: {
    background?: string;
    foreground?: string;
  };
};

type ShikiThemeSource = ThemeRegistration & {
  colors?: Record<string, string | string[] | undefined>;
  tokenColors?: ThemeTokenSetting[];
};

export type CodeThemePalette = {
  background: string;
  foreground: string;
  "ansi-black": string;
  "ansi-red": string;
  "ansi-green": string;
  "ansi-yellow": string;
  "ansi-blue": string;
  "ansi-magenta": string;
  "ansi-cyan": string;
  "ansi-white": string;
  "ansi-bright-black": string;
  "ansi-bright-red": string;
  "ansi-bright-green": string;
  "ansi-bright-yellow": string;
  "ansi-bright-blue": string;
  "ansi-bright-magenta": string;
  "ansi-bright-cyan": string;
  "ansi-bright-white": string;
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

type CodeThemeFamily = {
  dark: {
    id: string;
    theme: ShikiThemeSource;
  };
  description: string;
  label: string;
  light: {
    id: string;
    theme: ShikiThemeSource;
  };
};

type CodeThemeDefinition = Record<ResolvedTheme, CodeThemePalette>;

const FIXED_CODE_THEME_BACKGROUNDS: Record<ResolvedTheme, string> = {
  dark: "#0d0d0d",
  light: "#f5f5f5",
};

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
export const DEFAULT_CODE_THEME: CodeThemeName = "github";

export const CODE_THEME_FAMILIES: Record<CodeThemeName, CodeThemeFamily> = {
  ayu: {
    dark: {
      id: "ayu-dark",
      theme: ayuDarkTheme as ShikiThemeSource,
    },
    description: "Warm contrast with crisp editor colors from Ayu.",
    label: "Ayu",
    light: {
      id: "ayu-light",
      theme: ayuLightTheme as ShikiThemeSource,
    },
  },
  catppuccin: {
    dark: {
      id: "catppuccin-mocha",
      theme: catppuccinMochaTheme as ShikiThemeSource,
    },
    description: "Creamy, pastel-rich Catppuccin pairing for day and night.",
    label: "Catppuccin",
    light: {
      id: "catppuccin-latte",
      theme: catppuccinLatteTheme as ShikiThemeSource,
    },
  },
  everforest: {
    dark: {
      id: "everforest-dark",
      theme: everforestDarkTheme as ShikiThemeSource,
    },
    description:
      "Muted woodland tones with soft contrast and calm diff colors.",
    label: "Everforest",
    light: {
      id: "everforest-light",
      theme: everforestLightTheme as ShikiThemeSource,
    },
  },
  github: {
    dark: {
      id: "github-dark",
      theme: githubDarkTheme as ShikiThemeSource,
    },
    description:
      "GitHub's classic code colors with familiar light and dark variants.",
    label: "GitHub",
    light: {
      id: "github-light",
      theme: githubLightTheme as ShikiThemeSource,
    },
  },
  gruvbox: {
    dark: {
      id: "gruvbox-dark-medium",
      theme: gruvboxDarkTheme as ShikiThemeSource,
    },
    description:
      "Retro-groove warm tones inspired by classic terminal palettes.",
    label: "Gruvbox",
    light: {
      id: "gruvbox-light-medium",
      theme: gruvboxLightTheme as ShikiThemeSource,
    },
  },
  kanagawa: {
    dark: {
      id: "kanagawa-wave",
      theme: kanagawaWaveTheme as ShikiThemeSource,
    },
    description:
      "Inspired by Katsushika Hokusai's iconic wave painting palette.",
    label: "Kanagawa",
    light: {
      id: "kanagawa-lotus",
      theme: kanagawaLotusTheme as ShikiThemeSource,
    },
  },
  material: {
    dark: {
      id: "material-theme-ocean",
      theme: materialDarkTheme as ShikiThemeSource,
    },
    description:
      "Material Design–inspired ocean blues and softer lighter tones.",
    label: "Material",
    light: {
      id: "material-theme-lighter",
      theme: materialLightTheme as ShikiThemeSource,
    },
  },
  min: {
    dark: {
      id: "min-dark",
      theme: minDarkTheme as ShikiThemeSource,
    },
    description: "Stripped-back minimal syntax with quiet, restrained colors.",
    label: "Min",
    light: {
      id: "min-light",
      theme: minLightTheme as ShikiThemeSource,
    },
  },
  "night-owl": {
    dark: {
      id: "night-owl",
      theme: nightOwlTheme as ShikiThemeSource,
    },
    description:
      "High-contrast nocturnal palette tuned for long coding sessions.",
    label: "Night Owl",
    light: {
      id: "night-owl-light",
      theme: nightOwlLightTheme as ShikiThemeSource,
    },
  },
  one: {
    dark: {
      id: "one-dark-pro",
      theme: oneDarkTheme as ShikiThemeSource,
    },
    description: "Atom's classic One Dark and One Light color families.",
    label: "One",
    light: {
      id: "one-light",
      theme: oneLightTheme as ShikiThemeSource,
    },
  },
  "rose-pine": {
    dark: {
      id: "rose-pine",
      theme: rosePineDarkTheme as ShikiThemeSource,
    },
    description: "Soho vibes with muted pastels for all-day readability.",
    label: "Rosé Pine",
    light: {
      id: "rose-pine-dawn",
      theme: rosePineLightTheme as ShikiThemeSource,
    },
  },
  solarized: {
    dark: {
      id: "solarized-dark",
      theme: solarizedDarkTheme as ShikiThemeSource,
    },
    description:
      "The iconic Solarized balance with gentle light and dark pairings.",
    label: "Solarized",
    light: {
      id: "solarized-light",
      theme: solarizedLightTheme as ShikiThemeSource,
    },
  },
  vitesse: {
    dark: {
      id: "vitesse-dark",
      theme: vitesseDarkTheme as ShikiThemeSource,
    },
    description:
      "A modern Vitesse pairing with vibrant accents and sharp contrast.",
    label: "Vitesse",
    light: {
      id: "vitesse-light",
      theme: vitesseLightTheme as ShikiThemeSource,
    },
  },
};

export const CODE_THEME_OPTIONS = CODE_THEME_VALUES.map((value) => ({
  description: CODE_THEME_FAMILIES[value].description,
  label: CODE_THEME_FAMILIES[value].label,
  value,
})) as ReadonlyArray<{
  description: string;
  label: string;
  value: CodeThemeName;
}>;

const LEGACY_CODE_THEME_ALIASES: Record<string, CodeThemeName> = {
  ayu: "ayu",
  catppuccin: "catppuccin",
  cursor: "vitesse",
  default: "github",
  dracula: "rose-pine",
  everforest: "everforest",
  github: "github",
  gruvbox: "gruvbox",
  kanagawa: "kanagawa",
  material: "material",
  min: "min",
  "night-owl": "night-owl",
  nord: "gruvbox",
  one: "one",
  "one-dark": "one",
  "rose-pine": "rose-pine",
  solarized: "solarized",
  vercel: "vitesse",
  vitesse: "vitesse",
};

const DEFAULT_CODE_THEME_PALETTES: Record<ResolvedTheme, CodeThemePalette> = {
  dark: {
    background: FIXED_CODE_THEME_BACKGROUNDS.dark,
    foreground: "#e1e4e8",
    "ansi-black": "#586069",
    "ansi-red": "#ea4a5a",
    "ansi-green": "#34d058",
    "ansi-yellow": "#ffea7f",
    "ansi-blue": "#2188ff",
    "ansi-magenta": "#b392f0",
    "ansi-cyan": "#39c5cf",
    "ansi-white": "#d1d5da",
    "ansi-bright-black": "#959da5",
    "ansi-bright-red": "#f97583",
    "ansi-bright-green": "#85e89d",
    "ansi-bright-yellow": "#ffea7f",
    "ansi-bright-blue": "#79b8ff",
    "ansi-bright-magenta": "#b392f0",
    "ansi-bright-cyan": "#56d4dd",
    "ansi-bright-white": "#fafbfc",
    "token-changed": "#2188ff",
    "token-comment": "#6a737d",
    "token-constant": "#79b8ff",
    "token-deleted": "#ea4a5a",
    "token-function": "#b392f0",
    "token-inserted": "#34d058",
    "token-keyword": "#f97583",
    "token-link": "#2188ff",
    "token-parameter": "#e1e4e8",
    "token-punctuation": "#e1e4e8",
    "token-string": "#9ecbff",
    "token-string-expression": "#79b8ff",
  },
  light: {
    background: FIXED_CODE_THEME_BACKGROUNDS.light,
    foreground: "#24292e",
    "ansi-black": "#24292e",
    "ansi-red": "#d73a49",
    "ansi-green": "#28a745",
    "ansi-yellow": "#dbab09",
    "ansi-blue": "#0366d6",
    "ansi-magenta": "#6f42c1",
    "ansi-cyan": "#1b7c83",
    "ansi-white": "#6a737d",
    "ansi-bright-black": "#586069",
    "ansi-bright-red": "#cb2431",
    "ansi-bright-green": "#22863a",
    "ansi-bright-yellow": "#b08800",
    "ansi-bright-blue": "#005cc5",
    "ansi-bright-magenta": "#5a32a3",
    "ansi-bright-cyan": "#176f7a",
    "ansi-bright-white": "#1b1f23",
    "token-changed": "#0366d6",
    "token-comment": "#6a737d",
    "token-constant": "#005cc5",
    "token-deleted": "#d73a49",
    "token-function": "#6f42c1",
    "token-inserted": "#22863a",
    "token-keyword": "#d73a49",
    "token-link": "#0366d6",
    "token-parameter": "#24292e",
    "token-punctuation": "#24292e",
    "token-string": "#032f62",
    "token-string-expression": "#005cc5",
  },
};

const TOKEN_SCOPE_MATCHERS = {
  "token-changed": [
    "markup.changed",
    "punctuation.definition.changed",
    "meta.diff.header",
  ],
  "token-comment": ["comment"],
  "token-constant": [
    "entity.name.constant",
    "variable.other.constant",
    "variable.other.enummember",
    "variable.language",
    "constant",
  ],
  "token-deleted": ["markup.deleted", "punctuation.definition.deleted"],
  "token-function": [
    "entity.name.function",
    "support.function",
    "meta.function-call",
  ],
  "token-inserted": ["markup.inserted", "punctuation.definition.inserted"],
  "token-keyword": ["keyword", "storage"],
  "token-link": [
    "constant.other.reference.link",
    "string.other.link",
    "markup.link",
  ],
  "token-parameter": ["variable.parameter"],
  "token-punctuation": ["punctuation", "delimiter", "meta.separator"],
  "token-string": ["string"],
  "token-string-expression": [
    "string variable",
    "meta.interpolation",
    "variable.interpolation",
    "punctuation.definition.template-expression",
  ],
} as const satisfies Record<
  Exclude<
    keyof CodeThemePalette,
    | "background"
    | "foreground"
    | "ansi-black"
    | "ansi-red"
    | "ansi-green"
    | "ansi-yellow"
    | "ansi-blue"
    | "ansi-magenta"
    | "ansi-cyan"
    | "ansi-white"
    | "ansi-bright-black"
    | "ansi-bright-red"
    | "ansi-bright-green"
    | "ansi-bright-yellow"
    | "ansi-bright-blue"
    | "ansi-bright-magenta"
    | "ansi-bright-cyan"
    | "ansi-bright-white"
  >,
  readonly string[]
>;

function pickThemeColor(
  theme: ShikiThemeSource,
  key: string,
): string | undefined {
  const value = theme.colors?.[key];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );
  }

  return undefined;
}

function normalizeTokenScopes(scope?: string | string[]) {
  if (!scope) {
    return [];
  }

  return Array.isArray(scope) ? scope : [scope];
}

function findTokenColor(
  theme: ShikiThemeSource,
  patterns: readonly string[],
): string | undefined {
  for (const token of theme.tokenColors ?? []) {
    const scopes = normalizeTokenScopes(token.scope);
    if (
      scopes.length > 0 &&
      scopes.some((scope) =>
        patterns.some(
          (pattern) => scope === pattern || scope.includes(pattern),
        ),
      )
    ) {
      const foreground = token.settings?.foreground;
      if (typeof foreground === "string" && foreground.trim()) {
        return foreground;
      }
    }
  }

  return undefined;
}

function withOpacity(color: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${alpha}`;
  }

  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}${alpha}`;
  }

  return color;
}

function extractCodeThemePalette(
  theme: ShikiThemeSource,
  resolvedTheme: ResolvedTheme,
): CodeThemePalette {
  const fallback = DEFAULT_CODE_THEME_PALETTES[resolvedTheme];
  const foreground =
    pickThemeColor(theme, "editor.foreground") ??
    pickThemeColor(theme, "foreground") ??
    fallback.foreground;
  // Keep token colors theme-specific, but pin the code block surface to the
  // app's neutral light/dark background instead of each theme's editor tint.
  const background = FIXED_CODE_THEME_BACKGROUNDS[resolvedTheme];

  const ansiBlack =
    pickThemeColor(theme, "terminal.ansiBlack") ?? fallback["ansi-black"];
  const ansiRed =
    pickThemeColor(theme, "terminal.ansiRed") ?? fallback["ansi-red"];
  const ansiGreen =
    pickThemeColor(theme, "terminal.ansiGreen") ?? fallback["ansi-green"];
  const ansiYellow =
    pickThemeColor(theme, "terminal.ansiYellow") ?? fallback["ansi-yellow"];
  const ansiBlue =
    pickThemeColor(theme, "terminal.ansiBlue") ?? fallback["ansi-blue"];
  const ansiMagenta =
    pickThemeColor(theme, "terminal.ansiMagenta") ?? fallback["ansi-magenta"];
  const ansiCyan =
    pickThemeColor(theme, "terminal.ansiCyan") ?? fallback["ansi-cyan"];
  const ansiWhite =
    pickThemeColor(theme, "terminal.ansiWhite") ??
    pickThemeColor(theme, "terminal.foreground") ??
    foreground;
  const ansiBrightBlack =
    pickThemeColor(theme, "terminal.ansiBrightBlack") ??
    fallback["ansi-bright-black"];
  const ansiBrightRed =
    pickThemeColor(theme, "terminal.ansiBrightRed") ??
    fallback["ansi-bright-red"];
  const ansiBrightGreen =
    pickThemeColor(theme, "terminal.ansiBrightGreen") ??
    fallback["ansi-bright-green"];
  const ansiBrightYellow =
    pickThemeColor(theme, "terminal.ansiBrightYellow") ??
    fallback["ansi-bright-yellow"];
  const ansiBrightBlue =
    pickThemeColor(theme, "terminal.ansiBrightBlue") ??
    fallback["ansi-bright-blue"];
  const ansiBrightMagenta =
    pickThemeColor(theme, "terminal.ansiBrightMagenta") ??
    fallback["ansi-bright-magenta"];
  const ansiBrightCyan =
    pickThemeColor(theme, "terminal.ansiBrightCyan") ??
    fallback["ansi-bright-cyan"];
  const ansiBrightWhite =
    pickThemeColor(theme, "terminal.ansiBrightWhite") ??
    foreground ??
    fallback["ansi-bright-white"];

  return {
    background,
    foreground,
    "ansi-black": ansiBlack,
    "ansi-red": ansiRed,
    "ansi-green": ansiGreen,
    "ansi-yellow": ansiYellow,
    "ansi-blue": ansiBlue,
    "ansi-magenta": ansiMagenta,
    "ansi-cyan": ansiCyan,
    "ansi-white": ansiWhite,
    "ansi-bright-black": ansiBrightBlack,
    "ansi-bright-red": ansiBrightRed,
    "ansi-bright-green": ansiBrightGreen,
    "ansi-bright-yellow": ansiBrightYellow,
    "ansi-bright-blue": ansiBrightBlue,
    "ansi-bright-magenta": ansiBrightMagenta,
    "ansi-bright-cyan": ansiBrightCyan,
    "ansi-bright-white": ansiBrightWhite,
    "token-changed":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-changed"]) ??
      pickThemeColor(theme, "gitDecoration.modifiedResourceForeground") ??
      ansiBlue,
    "token-comment":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-comment"]) ??
      fallback["token-comment"],
    "token-constant":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-constant"]) ??
      fallback["token-constant"],
    "token-deleted":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-deleted"]) ??
      pickThemeColor(theme, "gitDecoration.deletedResourceForeground") ??
      ansiRed,
    "token-function":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-function"]) ??
      fallback["token-function"],
    "token-inserted":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-inserted"]) ??
      pickThemeColor(theme, "gitDecoration.addedResourceForeground") ??
      ansiGreen,
    "token-keyword":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-keyword"]) ??
      fallback["token-keyword"],
    "token-link":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-link"]) ??
      pickThemeColor(theme, "textLink.foreground") ??
      ansiBlue,
    "token-parameter":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-parameter"]) ??
      foreground,
    "token-punctuation":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-punctuation"]) ??
      foreground,
    "token-string":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-string"]) ??
      fallback["token-string"],
    "token-string-expression":
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-string-expression"]) ??
      findTokenColor(theme, TOKEN_SCOPE_MATCHERS["token-string"]) ??
      fallback["token-string-expression"],
  };
}

const CODE_THEME_PALETTES: Record<CodeThemeName, CodeThemeDefinition> =
  Object.fromEntries(
    CODE_THEME_VALUES.map((value) => [
      value,
      {
        dark: extractCodeThemePalette(
          CODE_THEME_FAMILIES[value].dark.theme,
          "dark",
        ),
        light: extractCodeThemePalette(
          CODE_THEME_FAMILIES[value].light.theme,
          "light",
        ),
      },
    ]),
  ) as Record<CodeThemeName, CodeThemeDefinition>;

export type AppearanceSettings = {
  accentColor: number | null;
  codeFontFamily: string;
  codeFontSize: number;
  codeTheme: CodeThemeName;
  themePreference: ThemePreference;
  uiFontFamily: string;
  uiFontSize: number;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  accentColor: null,
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

export function resolveCodeThemeName(value?: string | null): CodeThemeName {
  if (!value) {
    return DEFAULT_CODE_THEME;
  }

  const normalized = LEGACY_CODE_THEME_ALIASES[value];
  if (normalized) {
    return normalized;
  }

  return CODE_THEME_VALUES.includes(value as CodeThemeName)
    ? (value as CodeThemeName)
    : DEFAULT_CODE_THEME;
}

export function getCodeThemeThemeId(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return CODE_THEME_FAMILIES[codeTheme][resolvedTheme].id;
}

export function getCodeThemeThemeSource(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return CODE_THEME_FAMILIES[codeTheme][resolvedTheme].theme;
}

export function getSentinelCodeThemeRegistrationName(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return `sentinel-code-${codeTheme}-${resolvedTheme}`;
}

export function getActiveCodeThemeName(): CodeThemeName {
  if (typeof document !== "undefined") {
    const codeTheme = document.documentElement.getAttribute("data-code-theme");
    if (codeTheme) {
      return resolveCodeThemeName(codeTheme);
    }
  }

  return readStoredAppearanceSettings().codeTheme;
}

export function getAccentColorTokens(
  accentColor: number | null,
  resolvedTheme: ResolvedTheme,
) {
  if (accentColor === null) {
    return resolvedTheme === "dark"
      ? {
          accent: "oklch(100% 0 0)",
          accentForeground: "oklch(0% 0 0)",
        }
      : {
          accent: "oklch(0% 0 0)",
          accentForeground: "oklch(100% 0 0)",
        };
  }

  return resolvedTheme === "dark"
    ? {
        accent: `oklch(75% 0.15 ${accentColor})`,
        accentForeground: "oklch(0% 0 0)",
      }
    : {
        accent: `oklch(45% 0.2 ${accentColor})`,
        accentForeground: "oklch(100% 0 0)",
      };
}

export function sanitizeAppearanceSettings(
  value?: Partial<AppearanceSettings> | null,
): AppearanceSettings {
  return {
    accentColor:
      typeof value?.accentColor === "number" &&
      Number.isInteger(value.accentColor) &&
      value.accentColor >= 0 &&
      value.accentColor <= 360
        ? value.accentColor
        : DEFAULT_APPEARANCE_SETTINGS.accentColor,
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
    codeTheme: resolveCodeThemeName(value?.codeTheme),
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
  const accentTokens = getAccentColorTokens(
    nextSettings.accentColor,
    resolvedTheme,
  );
  root.style.setProperty("--accent", accentTokens.accent);
  root.style.setProperty("--accent-foreground", accentTokens.accentForeground);
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
  )};var p=${JSON.stringify(CODE_THEME_PALETTES)};var m=${JSON.stringify(
    LEGACY_CODE_THEME_ALIASES,
  )};var a=d;try{var raw=window.localStorage.getItem(ak);if(raw){a=Object.assign({},d,JSON.parse(raw));}}catch{}try{var tp=window.localStorage.getItem(tk);if(tp==="light"||tp==="dark"||tp==="system"){a.themePreference=tp;}}catch{}var root=document.documentElement;var theme=a.themePreference==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):a.themePreference;var rawCodeTheme=typeof a.codeTheme==="string"?a.codeTheme:"";var normalizedCodeTheme=(m[rawCodeTheme]||rawCodeTheme);var codeTheme=p[normalizedCodeTheme]?normalizedCodeTheme:d.codeTheme;var palette=p[codeTheme][theme]||p[d.codeTheme][theme];var hue=typeof a.accentColor==="number"&&Number.isInteger(a.accentColor)&&a.accentColor>=0&&a.accentColor<=360?a.accentColor:null;var accent=hue===null?(theme==="dark"?"oklch(100% 0 0)":"oklch(0% 0 0)"):(theme==="dark"?"oklch(75% 0.15 "+hue+")":"oklch(45% 0.2 "+hue+")");var accentForeground=theme==="dark"?"oklch(0% 0 0)":"oklch(100% 0 0)";root.setAttribute("data-theme",theme);root.classList.toggle("dark",theme==="dark");root.setAttribute("data-code-theme",codeTheme);root.style.setProperty("--app-font-sans",a.uiFontFamily||d.uiFontFamily);root.style.setProperty("--app-font-display",a.uiFontFamily||d.uiFontFamily);root.style.setProperty("--app-font-mono",a.codeFontFamily||d.codeFontFamily);root.style.setProperty("--app-ui-font-size",(a.uiFontSize||d.uiFontSize)+"px");root.style.setProperty("--app-code-font-size",(a.codeFontSize||d.codeFontSize)+"px");root.style.setProperty("--accent",accent);root.style.setProperty("--accent-foreground",accentForeground);for(var key in palette){root.style.setProperty("--syntax-"+key,palette[key]);}window.__sentinelThemePreference=a.themePreference||d.themePreference;window.__sentinelAppearance=Object.assign({},a,{accentColor:hue,codeTheme:codeTheme});})();`;
}

export function getCodeThemePalette(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  return CODE_THEME_PALETTES[codeTheme][resolvedTheme];
}

export function getTerminalThemePalette(
  codeTheme: CodeThemeName,
  resolvedTheme: ResolvedTheme,
) {
  const palette = getCodeThemePalette(codeTheme, resolvedTheme);

  return {
    background: palette.background,
    brightBlack: palette["ansi-bright-black"],
    brightBlue: palette["ansi-bright-blue"],
    brightCyan: palette["ansi-bright-cyan"],
    brightGreen: palette["ansi-bright-green"],
    brightMagenta: palette["ansi-bright-magenta"],
    brightRed: palette["ansi-bright-red"],
    brightWhite: palette["ansi-bright-white"],
    brightYellow: palette["ansi-bright-yellow"],
    black: palette["ansi-black"],
    blue: palette["ansi-blue"],
    cursor: palette.foreground,
    cursorAccent: palette.background,
    cyan: palette["ansi-cyan"],
    foreground: palette.foreground,
    green: palette["ansi-green"],
    magenta: palette["ansi-magenta"],
    red: palette["ansi-red"],
    selectionBackground:
      resolvedTheme === "dark"
        ? withOpacity(palette.foreground, "1f")
        : withOpacity(palette.foreground, "24"),
    selectionForeground: palette.foreground,
    white: palette["ansi-white"],
    yellow: palette["ansi-yellow"],
  };
}
