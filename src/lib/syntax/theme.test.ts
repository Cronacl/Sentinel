import { describe, expect, it } from "bun:test";

import { getSentinelCodeThemeRegistrationName } from "@/lib/appearance";

import {
  getSentinelCodeThemeName,
  getSentinelCodeThemeRegistration,
} from "./theme";

describe("syntax theme registration", () => {
  it("uses stable registration names for each code theme family and mode", () => {
    expect(getSentinelCodeThemeName("github", "light")).toBe(
      getSentinelCodeThemeRegistrationName("github", "light"),
    );
    expect(getSentinelCodeThemeName("github", "dark")).toBe(
      getSentinelCodeThemeRegistrationName("github", "dark"),
    );
    expect(getSentinelCodeThemeName("solarized", "light")).toBe(
      "sentinel-code-solarized-light",
    );
  });

  it("returns a shiki registration with the stable sentinel name", () => {
    const registration = getSentinelCodeThemeRegistration("night-owl", "dark");

    expect(registration.name).toBe("sentinel-code-night-owl-dark");
    expect(registration.bg).toBe("#0d0d0d");
    expect(registration.fg).toBe("#d6deeb");
    expect(registration.colors?.["editor.background"]).toBe("#0d0d0d");
    expect(registration.colors?.["editor.foreground"]).toBe("#d6deeb");
  });
});
