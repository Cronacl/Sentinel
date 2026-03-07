import { z } from "zod";

import { PERSONALITY_PRESET_VALUES } from "@/lib/personalization";

export const personalityPresetSchema = z.enum(PERSONALITY_PRESET_VALUES);

const shortText = (max: number) => z.string().trim().max(max);

export const personalizationFormSchema = z.object({
  aboutUser: shortText(500),
  customInstructions: shortText(4000),
  nickname: shortText(80),
  occupation: shortText(120),
  personality: personalityPresetSchema,
});

export type PersonalizationFormValues = z.infer<
  typeof personalizationFormSchema
>;
