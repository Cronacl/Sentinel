import { describe, expect, it } from "bun:test";

import { appearanceFormSchema } from "./appearance.schema";

const validValues = {
  accentColor: null,
  codeFontFamily: "monospace",
  codeFontSize: 13.5,
  codeTheme: "github",
  sidebarGlassEnabled: false,
  themePreference: "system",
  uiFontFamily: "sans-serif",
  uiFontSize: 16,
};

function getFontSizeMessages(uiFontSize: unknown) {
  const result = appearanceFormSchema.safeParse({
    ...validValues,
    uiFontSize,
  });

  return result.success
    ? []
    : result.error.issues
        .filter((issue) => issue.path[0] === "uiFontSize")
        .map((issue) => issue.message);
}

describe("appearanceFormSchema font sizes", () => {
  it("accepts sizes on the half-point grid", () => {
    expect(appearanceFormSchema.safeParse(validValues).success).toBe(true);
    expect(getFontSizeMessages(14.5)).toEqual([]);
  });

  it("reports a missing font size as required", () => {
    expect(getFontSizeMessages(undefined)).toEqual(["Font size is required."]);
  });

  it("reports non-numeric font sizes as invalid", () => {
    expect(getFontSizeMessages("16")).toEqual(["Enter a valid font size."]);
    expect(getFontSizeMessages(Number.NaN)).toEqual([
      "Enter a valid font size.",
    ]);
  });

  it("keeps the range and step messages", () => {
    expect(getFontSizeMessages(20)).toEqual(["Font size must be at most 18."]);
    expect(getFontSizeMessages(15.25)).toEqual([
      "Font size must use 0.5-point increments.",
    ]);
  });
});
