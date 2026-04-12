import { describe, expect, it } from "bun:test";

import {
  CODE_THEME_VALUES,
  DEFAULT_CODE_THEME,
  getCodeThemePalette,
  getCodeThemeThemeId,
  sanitizeAppearanceSettings,
  type CodeThemeName,
} from "@/lib/appearance";

describe("sanitizeAppearanceSettings", () => {
  it("normalizes legacy code theme values to curated shiki families", () => {
    expect(
      sanitizeAppearanceSettings({ codeTheme: "default" as never }).codeTheme,
    ).toBe("github");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "cursor" as never }).codeTheme,
    ).toBe("vitesse");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "vercel" as never }).codeTheme,
    ).toBe("vitesse");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "dracula" as never }).codeTheme,
    ).toBe("rose-pine");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "rose-pine" as never }).codeTheme,
    ).toBe("rose-pine");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "nord" as never }).codeTheme,
    ).toBe("gruvbox");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "one-dark" as never }).codeTheme,
    ).toBe("one");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "unknown-theme" as never })
        .codeTheme,
    ).toBe(DEFAULT_CODE_THEME);
  });
});

describe("code theme shiki mappings", () => {
  it("resolves the correct shiki theme ids for light and dark variants", () => {
    expect(getCodeThemeThemeId("github", "light")).toBe("github-light");
    expect(getCodeThemeThemeId("github", "dark")).toBe("github-dark");
    expect(getCodeThemeThemeId("night-owl", "light")).toBe("night-owl-light");
    expect(getCodeThemeThemeId("night-owl", "dark")).toBe("night-owl");
    expect(getCodeThemeThemeId("catppuccin", "light")).toBe("catppuccin-latte");
    expect(getCodeThemeThemeId("catppuccin", "dark")).toBe("catppuccin-mocha");
    expect(getCodeThemeThemeId("gruvbox", "light")).toBe(
      "gruvbox-light-medium",
    );
    expect(getCodeThemeThemeId("gruvbox", "dark")).toBe("gruvbox-dark-medium");
    expect(getCodeThemeThemeId("rose-pine", "light")).toBe("rose-pine-dawn");
    expect(getCodeThemeThemeId("rose-pine", "dark")).toBe("rose-pine");
    expect(getCodeThemeThemeId("one", "light")).toBe("one-light");
    expect(getCodeThemeThemeId("one", "dark")).toBe("one-dark-pro");
    expect(getCodeThemeThemeId("material", "light")).toBe(
      "material-theme-lighter",
    );
    expect(getCodeThemeThemeId("material", "dark")).toBe(
      "material-theme-ocean",
    );
    expect(getCodeThemeThemeId("kanagawa", "light")).toBe("kanagawa-lotus");
    expect(getCodeThemeThemeId("kanagawa", "dark")).toBe("kanagawa-wave");
    expect(getCodeThemeThemeId("min", "light")).toBe("min-light");
    expect(getCodeThemeThemeId("min", "dark")).toBe("min-dark");
  });

  it("uses fixed backgrounds for all themes instead of theme-native ones", () => {
    for (const theme of CODE_THEME_VALUES) {
      const dark = getCodeThemePalette(theme as CodeThemeName, "dark");
      const light = getCodeThemePalette(theme as CodeThemeName, "light");

      expect(dark.background).toBe("#0d0d0d");
      expect(light.background).toBe("#f5f5f5");
    }
  });

  it("extracts theme-specific token colors from bundled shiki themes", () => {
    const githubLight = getCodeThemePalette("github", "light");
    const githubDark = getCodeThemePalette("github", "dark");
    const nightOwlDark = getCodeThemePalette("night-owl", "dark");

    expect(githubLight.foreground).toBe("#24292e");
    expect(githubLight["ansi-blue"]).toBe("#0366d6");
    expect(githubLight["token-comment"]).toBe("#6a737d");
    expect(githubLight["token-constant"]).toBe("#005cc5");

    expect(githubDark.foreground).toBe("#e1e4e8");
    expect(githubDark["ansi-green"]).toBe("#34d058");
    expect(githubDark["token-function"]).toBe("#b392f0");
    expect(githubDark["token-keyword"]).toBe("#f97583");

    expect(nightOwlDark.foreground).toBe("#d6deeb");
    expect(nightOwlDark["ansi-red"]).toBe("#EF5350");
    expect(nightOwlDark["token-inserted"]).toBe("#c5e478ff");
    expect(nightOwlDark["token-deleted"]).toBe("#EF535090");
  });

  it("extracts foreground and token colors for all new themes", () => {
    const gruvboxDark = getCodeThemePalette("gruvbox", "dark");
    const gruvboxLight = getCodeThemePalette("gruvbox", "light");
    expect(gruvboxDark.foreground).toBeTruthy();
    expect(gruvboxLight.foreground).toBeTruthy();
    expect(gruvboxDark["token-keyword"]).toBeTruthy();
    expect(gruvboxLight["token-keyword"]).toBeTruthy();

    const rosePineDark = getCodeThemePalette("rose-pine", "dark");
    const rosePineLight = getCodeThemePalette("rose-pine", "light");
    expect(rosePineDark.foreground).toBeTruthy();
    expect(rosePineLight.foreground).toBeTruthy();

    const oneDark = getCodeThemePalette("one", "dark");
    const oneLight = getCodeThemePalette("one", "light");
    expect(oneDark.foreground).toBeTruthy();
    expect(oneLight.foreground).toBeTruthy();

    const materialDark = getCodeThemePalette("material", "dark");
    const materialLight = getCodeThemePalette("material", "light");
    expect(materialDark.foreground).toBeTruthy();
    expect(materialLight.foreground).toBeTruthy();

    const kanagawaDark = getCodeThemePalette("kanagawa", "dark");
    const kanagawaLight = getCodeThemePalette("kanagawa", "light");
    expect(kanagawaDark.foreground).toBeTruthy();
    expect(kanagawaLight.foreground).toBeTruthy();

    const minDark = getCodeThemePalette("min", "dark");
    const minLight = getCodeThemePalette("min", "light");
    expect(minDark.foreground).toBeTruthy();
    expect(minLight.foreground).toBeTruthy();
  });
});
