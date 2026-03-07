import { z } from "zod";

export const aiProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "google_vertex",
]);

const optionalUrlString = z
  .string()
  .trim()
  .refine(
    (value) => !value || z.string().url().safeParse(value).success,
    "Enter a valid URL.",
  );

export const apiKeyProviderConfigFormSchema = z.object({
  apiKey: z.string().trim().min(1, "API key is required."),
  baseURL: optionalUrlString,
  isEnabled: z.boolean(),
});

export const googleVertexProviderConfigFormSchema = z.object({
  clientEmail: z.string().trim().min(1, "Service account email is required."),
  isEnabled: z.boolean(),
  location: z.string().trim().min(1, "Location is required."),
  privateKey: z.string().trim().min(1, "Private key is required."),
  project: z.string().trim().min(1, "Project ID is required."),
});

export const providerConfigFormSchema = apiKeyProviderConfigFormSchema.extend({
  clientEmail: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  privateKey: z.string().optional().default(""),
  project: z.string().trim().optional().default(""),
});

export const customModelFormSchema = z.object({
  provider: aiProviderSchema,
  modelId: z.string().trim().min(1, "Model ID is required."),
});

export type APIKeyProviderConfigFormValues = z.infer<
  typeof apiKeyProviderConfigFormSchema
>;
export type GoogleVertexProviderConfigFormValues = z.infer<
  typeof googleVertexProviderConfigFormSchema
>;
export type ProviderConfigFormValues = z.infer<typeof providerConfigFormSchema>;
export type CustomModelFormValues = z.infer<typeof customModelFormSchema>;
