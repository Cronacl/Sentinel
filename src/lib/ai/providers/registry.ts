import type { AIProvider } from "@/server/db/enums";

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
    displayName: "Google AI Studio",
    description: "Gemini models via Google AI Studio API keys",
  },
  google_vertex: {
    id: "google_vertex",
    displayName: "Google Vertex AI",
    description: "Gemini models via Google Cloud Vertex AI",
  },
  vercel: {
    id: "vercel",
    displayName: "Vercel AI Gateway",
    description: "Access multiple providers through a single gateway",
  },
  xai: {
    id: "xai",
    displayName: "xAI",
    description: "Grok model family",
  },
  azure: {
    id: "azure",
    displayName: "Azure OpenAI",
    description: "OpenAI models via Azure deployments",
  },
  amazon_bedrock: {
    id: "amazon_bedrock",
    displayName: "Amazon Bedrock",
    description: "Multi-provider models via AWS Bedrock",
  },
  groq: {
    id: "groq",
    displayName: "Groq",
    description: "Ultra-fast inference for open models",
  },
  cohere: {
    id: "cohere",
    displayName: "Cohere",
    description: "Command model family",
  },
  moonshotai: {
    id: "moonshotai",
    displayName: "Moonshot AI",
    description: "Kimi model family",
  },
  mistral: {
    id: "mistral",
    displayName: "Mistral AI",
    description: "Mistral and Mixtral model family",
  },
  ollama: {
    id: "ollama",
    displayName: "Ollama",
    description: "Local models via Ollama",
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    description: "Unified gateway for hundreds of models",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
