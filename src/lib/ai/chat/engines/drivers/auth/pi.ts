import "server-only";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
} from "../../platform/auth/controller";
import {
  cliTerminalCommand,
  LOGIN_METHOD_ID,
  loginWithInstanceSecret,
} from "./shared";

// Pi signs in per model provider: `/login` inside `pi` (OAuth subscriptions,
// stored in ~/.pi/agent/auth.json) or a provider's API key in the
// environment. Sentinel opens `pi` in the terminal for the first and stores
// keys as encrypted instance variables for the second. Pi counts as signed
// in once it lists a model (probe.ts).

export const PI_API_KEY_PROVIDERS = [
  { id: "anthropic", label: "Anthropic", variable: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", variable: "OPENAI_API_KEY" },
  { id: "google", label: "Google Gemini", variable: "GEMINI_API_KEY" },
  { id: "openrouter", label: "OpenRouter", variable: "OPENROUTER_API_KEY" },
] as const;

const API_KEY_PREFIX = "api-key:";

// Engine modules load on first use: this module adds nothing to what the
// driver itself imports.
async function resolvePiCli(instance: ResolvedEngineInstance) {
  const { resolvePiBinary } = await import("@/lib/ai/chat/engines/pi/binary");
  const { binary } = await resolvePiBinary(instance);
  return binary ? { cliPath: binary.path, env: binary.env } : null;
}

export const piAuth: EngineAuthController = {
  async methods(instance) {
    const runtime = await resolvePiCli(instance);
    return [
      ...(runtime
        ? [
            {
              description:
                "Opens Pi in the terminal: type /login and pick a provider.",
              id: LOGIN_METHOD_ID,
              label: "Sign in from Pi",
              type: "terminal-command" as const,
            },
          ]
        : []),
      ...PI_API_KEY_PROVIDERS.map((provider) => ({
        description: `Stored encrypted as ${provider.variable} for this instance.`,
        id: `${API_KEY_PREFIX}${provider.id}`,
        label: `Use a ${provider.label} API key`,
        type: "credentials" as const,
      })),
    ];
  },

  async login(instance, methodId, context) {
    if (methodId.startsWith(API_KEY_PREFIX)) {
      const provider = PI_API_KEY_PROVIDERS.find(
        (entry) => `${API_KEY_PREFIX}${entry.id}` === methodId,
      );
      if (!provider) {
        throw new EngineAuthError("Unknown Pi sign-in method.");
      }
      await loginWithInstanceSecret(context, {
        label: `${provider.label} API key`,
        name: provider.variable,
        secret: true,
      });
      return;
    }
    if (methodId !== LOGIN_METHOD_ID) {
      throw new EngineAuthError("Unknown Pi sign-in method.");
    }
    const runtime = await resolvePiCli(instance);
    if (!runtime) {
      throw new EngineAuthError(
        "Pi was not found. Install it, then try again.",
      );
    }
    await context.runTerminalCommand(
      cliTerminalCommand({
        args: [],
        cliPath: runtime.cliPath,
        path: runtime.env.PATH ?? null,
        title: "Pi sign-in: type /login",
      }),
    );
  },

  async logout(instance, context) {
    const cleared = await context.clearInstanceSecrets(
      PI_API_KEY_PROVIDERS.map((provider) => provider.variable),
    );
    if (cleared.length > 0) {
      return { message: "Removed this instance's provider API keys." };
    }
    // Subscription logins live in Pi's own store: `/logout` inside Pi.
    const runtime = await resolvePiCli(instance);
    if (!runtime || !context.client.terminal) {
      throw new EngineAuthError(
        "Pi keeps its logins itself: run `pi` in a terminal and use /logout.",
      );
    }
    await context.runTerminalCommand(
      cliTerminalCommand({
        args: [],
        cliPath: runtime.cliPath,
        path: runtime.env.PATH ?? null,
        title: "Pi sign-out: type /logout",
      }),
    );
    return { message: "Removed the provider login you chose." };
  },

  logoutNotice: () =>
    "Pi keeps provider logins per user (~/.pi/agent): signing out in Pi signs out the Pi CLI and every Pi instance that uses those logins.",
};
