import { z } from "zod";

import type { AIProvider } from "@/../generated/prisma";

const apiKeyProvider = z.object({
	apiKey: z.string().min(1, "API key is required"),
	baseURL: z.string().url().optional(),
});

export const PROVIDER_CONFIG_SCHEMAS: Record<AIProvider, z.ZodType> = {
	openai: apiKeyProvider,
	anthropic: apiKeyProvider,
	google: apiKeyProvider,
};

export function validateProviderConfig(provider: AIProvider, config: unknown) {
	return PROVIDER_CONFIG_SCHEMAS[provider].parse(config);
}
