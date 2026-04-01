import { z } from "zod";

import {
  CODE_THEME_VALUES,
  FONT_SIZE_STEP,
  MAX_CODE_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  THEME_PREFERENCE_VALUES,
} from "@/lib/appearance";

export const themePreferenceSchema = z.enum(THEME_PREFERENCE_VALUES);
export const codeThemeSchema = z.enum(CODE_THEME_VALUES);

const fontFamilySchema = z.string().trim().min(1, "Font family is required.");

const fontSizeSchema = (minimum: number, maximum: number) =>
  z
    .number({
      invalid_type_error: "Enter a valid font size.",
      required_error: "Font size is required.",
    })
    .min(minimum, `Font size must be at least ${minimum}.`)
    .max(maximum, `Font size must be at most ${maximum}.`)
    .refine(
      (value) => Number.isInteger(value / FONT_SIZE_STEP),
      `Font size must use ${FONT_SIZE_STEP}-point increments.`,
    );

export const appearanceFormSchema = z.object({
  codeFontFamily: fontFamilySchema,
  codeFontSize: fontSizeSchema(MIN_CODE_FONT_SIZE, MAX_CODE_FONT_SIZE),
  codeTheme: codeThemeSchema,
  themePreference: themePreferenceSchema,
  uiFontFamily: fontFamilySchema,
  uiFontSize: fontSizeSchema(MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE),
});

export type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;
