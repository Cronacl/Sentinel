import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";

const normalizePrivateKey = (key?: string | null) =>
  key ? key.replace(/\\n/g, "\n").replace(/\r/g, "") : key;

const apiKeyProvider = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseURL: z.string().url().optional(),
});

const apiTokenProvider = z.object({
  apiToken: z.string().min(1, "API token is required"),
  baseURL: z.string().url().optional(),
});

const accessKeySecretKeyProvider = z.object({
  accessKey: z.string().min(1, "Access key is required"),
  baseURL: z.string().url().optional(),
  secretKey: z.string().min(1, "Secret key is required"),
});

const googleVertexAIProvider = z.object({
  location: z.string().min(1, "Location is required"),
  project: z.string().min(1, "Project ID is required"),
  googleAuthOptions: z.object({
    credentials: z.object({
      client_email: z.string().min(1, "Service account email is required"),
      private_key: z.string().min(1, "Private key is required"),
    }),
  }),
});

const bedrockProvider = z.object({
  accessKeyId: z.string().min(1, "Access key ID is required"),
  secretAccessKey: z.string().min(1, "Secret access key is required"),
  region: z.string().min(1, "AWS region is required"),
});

const ollamaProvider = z.object({
  baseURL: z
    .string()
    .url("Base URL is required")
    .default("http://localhost:11434/v1"),
});

export const PROVIDER_CONFIG_SCHEMAS: Record<AIProvider, z.ZodType> = {
  openai: apiKeyProvider,
  anthropic: apiKeyProvider,
  google: apiKeyProvider,
  google_vertex: googleVertexAIProvider,
  vercel: apiKeyProvider,
  xai: apiKeyProvider,
  black_forest_labs: apiKeyProvider,
  klingai: accessKeySecretKeyProvider,
  bytedance: apiKeyProvider,
  fal: apiKeyProvider,
  replicate: apiTokenProvider,
  azure: apiKeyProvider,
  amazon_bedrock: bedrockProvider,
  groq: apiKeyProvider,
  cohere: apiKeyProvider,
  moonshotai: apiKeyProvider,
  mistral: apiKeyProvider,
  ollama: ollamaProvider,
  openrouter: apiKeyProvider,
  deepseek: apiKeyProvider,
};

export function validateProviderConfig(provider: AIProvider, config: unknown) {
  const parsed = PROVIDER_CONFIG_SCHEMAS[provider].parse(config);

  if (
    provider === "google_vertex" &&
    typeof parsed === "object" &&
    parsed &&
    "googleAuthOptions" in parsed
  ) {
    const vertexConfig = parsed as z.infer<typeof googleVertexAIProvider>;

    return {
      ...vertexConfig,
      googleAuthOptions: {
        ...vertexConfig.googleAuthOptions,
        credentials: {
          ...vertexConfig.googleAuthOptions.credentials,
          private_key:
            normalizePrivateKey(
              vertexConfig.googleAuthOptions.credentials.private_key,
            ) ?? "",
        },
      },
    };
  }

  if (provider === "ollama") {
    const ollamaConfig = parsed as z.infer<typeof ollamaProvider>;
    return {
      baseURL: ollamaConfig.baseURL || "http://localhost:11434/v1",
    };
  }

  return parsed;
}
