import "server-only";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
} from "../../platform/auth/controller";
import {
  API_KEY_METHOD_ID,
  launchTerminalCommand,
  LOGIN_METHOD_ID,
  loginWithInstanceSecret,
  stringEnv,
} from "./shared";

// Claude Code signs in with its own CLI: `claude auth login` opens claude.ai
// (or the Anthropic Console) in the browser and stores the credentials in
// the instance's CLAUDE_CONFIG_DIR. An API key is the alternative. The
// account (email, plan, how it authenticates) is read from the SDK's
// initializationResult by the status probe and shown with the snapshot.
//
// Engine modules load on first use: this module adds nothing to what the
// driver itself imports.

const API_KEY_VARIABLE = "ANTHROPIC_API_KEY";

async function resolveClaudeCli(instance: ResolvedEngineInstance) {
  const { resolveClaudeCodeRuntime } =
    await import("@/lib/ai/chat/engines/claude-sdk");
  const runtime = await resolveClaudeCodeRuntime({ instance });
  return runtime.binaryDetected && runtime.executablePath ? runtime : null;
}

async function claudeLaunch(executablePath: string, args: string[]) {
  const { buildClaudeCliLaunch } =
    await import("@/lib/ai/chat/engines/claude-sdk/executable");
  return buildClaudeCliLaunch({ args, command: executablePath, env: {} });
}

export const claudeAuth: EngineAuthController = {
  async methods(instance) {
    const runtime = await resolveClaudeCli(instance);
    return [
      ...(runtime
        ? [
            {
              description:
                "Runs `claude auth login`, which opens claude.ai or the Anthropic Console in your browser.",
              id: LOGIN_METHOD_ID,
              label: "Sign in with Claude",
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
        label: "Anthropic API key",
        name: API_KEY_VARIABLE,
        secret: true,
      });
      return;
    }

    const runtime = await resolveClaudeCli(instance);
    if (!runtime?.executablePath) {
      throw new EngineAuthError(
        "Claude Code was not found. Install it, then try again.",
      );
    }

    const args = ["auth", "login"];
    await context.runTerminalCommand(
      launchTerminalCommand({
        display: { args, command: runtime.executablePath },
        launch: await claudeLaunch(runtime.executablePath, args),
        path: runtime.env.PATH ?? null,
        title: "Claude Code sign-in",
      }),
    );
  },

  async logout(instance, context) {
    const cleared = await context.clearInstanceSecrets([API_KEY_VARIABLE]);
    const runtime = await resolveClaudeCli(instance);

    if (runtime?.executablePath) {
      const launch = await claudeLaunch(runtime.executablePath, [
        "auth",
        "logout",
      ]);
      const { exitCode } = await context.runBackgroundCommand({
        args: launch.args,
        command: launch.command,
        env: {
          ...(runtime.env.PATH ? { PATH: runtime.env.PATH } : {}),
          ...stringEnv(launch.env),
        },
      });
      if (exitCode !== 0 && cleared.length === 0) {
        throw new EngineAuthError(
          `\`claude auth logout\` did not finish (exit code ${exitCode ?? "unknown"}).`,
        );
      }
    } else if (cleared.length === 0) {
      throw new EngineAuthError(
        "Claude Code was not found, so Sentinel cannot sign it out.",
      );
    }

    return cleared.length > 0
      ? { message: "Signed out and removed this instance's API key." }
      : undefined;
  },
};
