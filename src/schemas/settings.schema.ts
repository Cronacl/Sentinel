import { z } from "zod";

export const aiProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "google_vertex",
  "vercel",
  "xai",
  "black_forest_labs",
  "klingai",
  "bytedance",
  "fal",
  "replicate",
  "azure",
  "amazon_bedrock",
  "groq",
  "cohere",
  "moonshotai",
  "mistral",
  "ollama",
  "openrouter",
  "deepseek",
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

export const apiTokenProviderConfigFormSchema = z.object({
  apiToken: z.string().trim().min(1, "API token is required."),
  baseURL: optionalUrlString,
  isEnabled: z.boolean(),
});

export const accessKeySecretKeyProviderConfigFormSchema = z.object({
  accessKey: z.string().trim().min(1, "Access key is required."),
  secretKey: z.string().trim().min(1, "Secret key is required."),
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

export const bedrockProviderConfigFormSchema = z.object({
  accessKeyId: z.string().trim().min(1, "Access key ID is required."),
  secretAccessKey: z.string().trim().min(1, "Secret access key is required."),
  region: z.string().trim().min(1, "AWS region is required."),
  isEnabled: z.boolean(),
});

export const ollamaProviderConfigFormSchema = z.object({
  baseURL: z
    .string()
    .trim()
    .min(1, "Base URL is required.")
    .default("http://localhost:11434/v1"),
  isEnabled: z.boolean(),
});

export const providerConfigFormSchema = apiKeyProviderConfigFormSchema.extend({
  accessKey: z.string().trim().optional().default(""),
  accessKeyId: z.string().trim().optional().default(""),
  apiToken: z.string().trim().optional().default(""),
  clientEmail: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  privateKey: z.string().optional().default(""),
  project: z.string().trim().optional().default(""),
  region: z.string().trim().optional().default(""),
  secretAccessKey: z.string().trim().optional().default(""),
  secretKey: z.string().trim().optional().default(""),
});

export const customModelFormSchema = z.object({
  provider: aiProviderSchema,
  modelId: z.string().trim().min(1, "Model ID is required."),
});

export type APIKeyProviderConfigFormValues = z.infer<
  typeof apiKeyProviderConfigFormSchema
>;
export type APITokenProviderConfigFormValues = z.infer<
  typeof apiTokenProviderConfigFormSchema
>;
export type AccessKeySecretKeyProviderConfigFormValues = z.infer<
  typeof accessKeySecretKeyProviderConfigFormSchema
>;
export type GoogleVertexProviderConfigFormValues = z.infer<
  typeof googleVertexProviderConfigFormSchema
>;
export type BedrockProviderConfigFormValues = z.infer<
  typeof bedrockProviderConfigFormSchema
>;
export type OllamaProviderConfigFormValues = z.infer<
  typeof ollamaProviderConfigFormSchema
>;
export type ProviderConfigFormValues = z.infer<typeof providerConfigFormSchema>;
export type CustomModelFormValues = z.infer<typeof customModelFormSchema>;
