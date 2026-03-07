import { z } from "zod";

import { THEME_PREFERENCE_VALUES } from "@/lib/theme";

export const themePreferenceSchema = z.enum(THEME_PREFERENCE_VALUES);

export const appearanceFormSchema = z.object({
  themePreference: themePreferenceSchema,
});

export type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;
