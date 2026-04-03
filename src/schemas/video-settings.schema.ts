import { z } from "zod";

import { aiProviderSchema } from "@/schemas/settings.schema";

export const videoGenerationSettingsFormSchema = z.object({
  defaultProvider: aiProviderSchema.nullable(),
});

export const videoGenerationProviderFormSchema = z.object({
  isCustom: z.boolean(),
  isEnabled: z.boolean(),
  modelId: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value ?? null),
  provider: aiProviderSchema,
});

export type VideoGenerationSettingsFormValues = z.infer<
  typeof videoGenerationSettingsFormSchema
>;
export type VideoGenerationProviderFormValues = z.infer<
  typeof videoGenerationProviderFormSchema
>;
