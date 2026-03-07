import type { AIProvider } from "@/../generated/prisma";

export type ProviderMeta = {
	id: AIProvider;
	displayName: string;
	description: string;
};

export const PROVIDERS: Record<AIProvider, ProviderMeta> = {
	openai: {
		id: "openai",
		displayName: "OpenAI",
		description: "GPT and o-series models",
	},
	anthropic: {
		id: "anthropic",
		displayName: "Anthropic",
		description: "Claude model family",
	},
	google: {
		id: "google",
		displayName: "Google AI",
		description: "Gemini models via Google AI Studio",
	},
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
