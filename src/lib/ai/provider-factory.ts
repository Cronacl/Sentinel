import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";

import type { AIProvider } from "@/../generated/prisma";

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
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}
