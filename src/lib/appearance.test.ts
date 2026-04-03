import { describe, expect, it } from "bun:test";

import {
  DEFAULT_CODE_THEME,
  getCodeThemePalette,
  getCodeThemeThemeId,
  sanitizeAppearanceSettings,
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
    ).toBe("catppuccin");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "rose-pine" as never }).codeTheme,
    ).toBe("catppuccin");
    expect(
      sanitizeAppearanceSettings({ codeTheme: "nord" as never }).codeTheme,
    ).toBe("everforest");
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
  });

  it("extracts palette values from bundled shiki themes", () => {
    const githubLight = getCodeThemePalette("github", "light");
    const githubDark = getCodeThemePalette("github", "dark");
    const nightOwlDark = getCodeThemePalette("night-owl", "dark");

    expect(githubLight.background).toBe("#fff");
    expect(githubLight.foreground).toBe("#24292e");
    expect(githubLight["ansi-blue"]).toBe("#0366d6");
    expect(githubLight["token-comment"]).toBe("#6a737d");
    expect(githubLight["token-constant"]).toBe("#005cc5");

    expect(githubDark.background).toBe("#24292e");
    expect(githubDark.foreground).toBe("#e1e4e8");
    expect(githubDark["ansi-green"]).toBe("#34d058");
    expect(githubDark["token-function"]).toBe("#b392f0");
    expect(githubDark["token-keyword"]).toBe("#f97583");

    expect(nightOwlDark.background).toBe("#011627");
    expect(nightOwlDark.foreground).toBe("#d6deeb");
    expect(nightOwlDark["ansi-red"]).toBe("#EF5350");
    expect(nightOwlDark["token-inserted"]).toBe("#c5e478ff");
    expect(nightOwlDark["token-deleted"]).toBe("#EF535090");
  });
});
