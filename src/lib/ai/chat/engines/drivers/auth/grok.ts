import "server-only";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
} from "../../platform/auth/controller";
import {
  API_KEY_METHOD_ID,
  cliTerminalCommand,
  LOGIN_METHOD_ID,
  loginWithInstanceSecret,
  sharedLoginNotice,
} from "./shared";

// Grok Build signs in with `grok login` (grok.com, in a browser) into
// <GROK_HOME or ~/.grok>/auth.json; XAI_API_KEY is the alternative, stored as
// an instance secret (the agent then authenticates with `xai.api_key`).
// An instance with a GROK_HOME of its own keeps its own login.

const API_KEY_VARIABLE = "XAI_API_KEY";

async function resolveGrokCli(instance: ResolvedEngineInstance) {
  const { resolveGrokBinary } =
    await import("@/lib/ai/chat/engines/acp/agents/grok");
  const { binary } = await resolveGrokBinary(instance);
  return binary ? { cliPath: binary.path, env: binary.env } : null;
}

export const grokAuth: EngineAuthController = {
  async methods(instance) {
    const runtime = await resolveGrokCli(instance);
    return [
      ...(runtime
        ? [
            {
              description:
                "Runs `grok login`: approve the sign-in in your browser.",
              id: LOGIN_METHOD_ID,
              label: "Sign in with Grok",
              type: "terminal-command" as const,
            },
          ]
        : []),
      {
        description: `Stored encrypted as ${API_KEY_VARIABLE} for this instance.`,
        id: API_KEY_METHOD_ID,
        label: "Use an xAI API key",
        type: "credentials" as const,
      },
    ];
  },

  async login(instance, methodId, context) {
    if (methodId === API_KEY_METHOD_ID) {
      await loginWithInstanceSecret(context, {
        label: "xAI API key",
        name: API_KEY_VARIABLE,
        secret: true,
      });
      return;
    }

    const runtime = await resolveGrokCli(instance);
    if (!runtime?.cliPath) {
      throw new EngineAuthError(
        "Grok Build was not found. Install it, then try again.",
      );
    }
    await context.runTerminalCommand(
      cliTerminalCommand({
        args: ["login"],
        cliPath: runtime.cliPath,
        path: runtime.env.PATH ?? null,
        title: "Grok sign-in",
      }),
    );
  },

  async logout(instance, context) {
    const cleared = await context.clearInstanceSecrets([API_KEY_VARIABLE]);
    const runtime = await resolveGrokCli(instance);

    if (runtime?.cliPath) {
      const { exitCode } = await context.runBackgroundCommand({
        args: ["logout"],
        command: runtime.cliPath,
        ...(runtime.env.PATH ? { env: { PATH: runtime.env.PATH } } : {}),
      });
      if (exitCode !== 0 && cleared.length === 0) {
        throw new EngineAuthError(
          `\`grok logout\` did not finish (exit code ${exitCode ?? "unknown"}).`,
        );
      }
    } else if (cleared.length === 0) {
      throw new EngineAuthError(
        "Grok Build was not found, so Sentinel cannot sign it out.",
      );
    }

    return cleared.length > 0
      ? { message: "Signed out and removed this instance's API key." }
      : undefined;
  },

  logoutNotice: (instance) => sharedLoginNotice(instance, "the Grok CLI"),
};
