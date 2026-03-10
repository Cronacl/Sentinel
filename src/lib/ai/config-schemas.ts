import { z } from "zod";

import type { AIProvider } from "@/server/db/enums";

const normalizePrivateKey = (key?: string | null) =>
  key ? key.replace(/\\n/g, "\n").replace(/\r/g, "") : key;

const apiKeyProvider = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseURL: z.string().url().optional(),
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

export const PROVIDER_CONFIG_SCHEMAS: Record<AIProvider, z.ZodType> = {
  openai: apiKeyProvider,
  anthropic: apiKeyProvider,
  google: apiKeyProvider,
  google_vertex: googleVertexAIProvider,
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

  return parsed;
}
