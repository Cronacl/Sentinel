import "server-only";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { createGateway } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { AIProvider } from "@/server/db/enums";

type ApiKeyConfig = {
  apiKey: string;
  baseURL?: string;
};

type VertexConfig = {
  location: string;
  project: string;
  googleAuthOptions: {
    credentials: {
      client_email: string;
      private_key: string;
    };
  };
};

type BedrockConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

type OllamaConfig = {
  baseURL: string;
};

export function createProviderInstance(
  provider: AIProvider,
  config: Record<string, unknown>,
) {
  switch (provider) {
    case "openai": {
      const c = config as ApiKeyConfig;
      return createOpenAI({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "anthropic": {
      const c = config as ApiKeyConfig;
      return createAnthropic({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "google": {
      const c = config as ApiKeyConfig;
      return createGoogleGenerativeAI({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "google_vertex": {
      const c = config as VertexConfig;
      return createVertex({
        location: c.location,
        project: c.project,
        googleAuthOptions: c.googleAuthOptions,
      });
    }
    case "vercel": {
      const c = config as ApiKeyConfig;
      return createGateway({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "xai": {
      const c = config as ApiKeyConfig;
      return createXai({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "azure": {
      const c = config as ApiKeyConfig;
      return createAzure({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "amazon_bedrock": {
      const c = config as BedrockConfig;
      return createAmazonBedrock({
        region: c.region,
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      });
    }
    case "groq": {
      const c = config as ApiKeyConfig;
      return createGroq({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "cohere": {
      const c = config as ApiKeyConfig;
      return createCohere({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "moonshotai": {
      const c = config as ApiKeyConfig;
      return createMoonshotAI({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "mistral": {
      const c = config as ApiKeyConfig;
      return createMistral({
        apiKey: c.apiKey,
        ...(c.baseURL && { baseURL: c.baseURL }),
      });
    }
    case "ollama": {
      const c = config as OllamaConfig;
      return createOpenAI({
        apiKey: "ollama",
        baseURL: c.baseURL || "http://localhost:11434/v1",
      });
    }
    case "openrouter": {
      const c = config as ApiKeyConfig;
      return createOpenRouter({
        apiKey: c.apiKey,
      });
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}
