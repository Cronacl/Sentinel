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
} from "./shared";

// Cursor Agent signs in with `agent login` (browser) and out with
// `agent logout`; CURSOR_API_KEY is the alternative, stored as an instance
// secret. Cursor keeps its login per OS user, so instances share it unless
// they use a key of their own.

const API_KEY_VARIABLE = "CURSOR_API_KEY";

// Engine modules load on first use: this module adds nothing to what the
// driver itself imports.
async function resolveCursorCli(instance: ResolvedEngineInstance) {
  const { resolveCursorRuntime } =
    await import("@/lib/ai/chat/engines/cursor-acp");
  const runtime = await resolveCursorRuntime({ instance });
  return runtime.cliDetected && runtime.cliPath ? runtime : null;
}

export const cursorAuth: EngineAuthController = {
  async methods(instance) {
    const runtime = await resolveCursorCli(instance);
    return [
      ...(runtime
        ? [
            {
              description:
                "Runs `agent login`: approve the sign-in in your browser.",
              id: LOGIN_METHOD_ID,
              label: "Sign in with Cursor",
              type: "terminal-command" as const,
            },
          ]
        : []),
      {
        description: `Stored encrypted as ${API_KEY_VARIABLE} for this instance.`,
        id: API_KEY_METHOD_ID,
        label: "Use an API key",
        type: "credentials" as const,
      },
    ];
  },

  async login(instance, methodId, context) {
    if (methodId === API_KEY_METHOD_ID) {
      await loginWithInstanceSecret(context, {
        label: "Cursor API key",
        name: API_KEY_VARIABLE,
        secret: true,
      });
      return;
    }

    const runtime = await resolveCursorCli(instance);
    if (!runtime?.cliPath) {
      throw new EngineAuthError(
        "Cursor Agent was not found. Install it, then try again.",
      );
    }
    await context.runTerminalCommand(
      cliTerminalCommand({
        args: ["login"],
        cliPath: runtime.cliPath,
        path: runtime.env.PATH ?? null,
        title: "Cursor sign-in",
      }),
    );
  },

  async logout(instance, context) {
    const cleared = await context.clearInstanceSecrets([API_KEY_VARIABLE]);
    const runtime = await resolveCursorCli(instance);

    if (runtime?.cliPath) {
      const { exitCode } = await context.runBackgroundCommand({
        args: ["logout"],
        command: runtime.cliPath,
        ...(runtime.env.PATH ? { env: { PATH: runtime.env.PATH } } : {}),
      });
      if (exitCode !== 0 && cleared.length === 0) {
        throw new EngineAuthError(
          `\`agent logout\` did not finish (exit code ${exitCode ?? "unknown"}).`,
        );
      }
    } else if (cleared.length === 0) {
      throw new EngineAuthError(
        "Cursor Agent was not found, so Sentinel cannot sign it out.",
      );
    }

    return cleared.length > 0
      ? { message: "Signed out and removed this instance's API key." }
      : undefined;
  },

  logoutNotice: () =>
    "Cursor keeps one sign-in per user: this also signs out the Cursor CLI and every Cursor instance in Sentinel.",
};
