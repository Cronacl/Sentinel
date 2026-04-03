import { z } from "zod";

import { aiProviderSchema } from "@/schemas/settings.schema";

export const imageGenerationSettingsFormSchema = z.object({
  defaultProvider: aiProviderSchema.nullable(),
});

export const imageGenerationProviderFormSchema = z.object({
  isCustom: z.boolean(),
  isEnabled: z.boolean(),
  modelId: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value ?? null),
  provider: aiProviderSchema,
});

export type ImageGenerationSettingsFormValues = z.infer<
  typeof imageGenerationSettingsFormSchema
>;
export type ImageGenerationProviderFormValues = z.infer<
  typeof imageGenerationProviderFormSchema
>;
