import "server-only";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
  type EngineAuthFlowContext,
} from "../../platform/auth/controller";
import { cliTerminalCommand, LOGIN_METHOD_ID } from "./shared";

// OpenCode signs in per model provider, interactively: `opencode auth login`
// asks which provider and how, `opencode auth logout` which login to remove.
// Both run in the terminal; credentials stay in OpenCode's own store
// (XDG_DATA_HOME, which an instance can set).

// Engine modules load on first use: this module adds nothing to what the
// driver itself imports.
async function resolveOpenCodeCli(instance: ResolvedEngineInstance) {
  const { resolveOpenCodeRuntime } =
    await import("@/lib/ai/chat/engines/opencode-sdk");
  const runtime = await resolveOpenCodeRuntime({ instance });
  return runtime.cliDetected && runtime.cliPath ? runtime : null;
}

async function runAuthSubcommand(
  instance: ResolvedEngineInstance,
  context: EngineAuthFlowContext,
  subcommand: "login" | "logout",
) {
  const runtime = await resolveOpenCodeCli(instance);
  if (!runtime?.cliPath) {
    throw new EngineAuthError(
      "OpenCode was not found. Install it, then try again.",
    );
  }
  return await context.runTerminalCommand(
    cliTerminalCommand({
      args: ["auth", subcommand],
      cliPath: runtime.cliPath,
      path: runtime.env.PATH ?? null,
      title: subcommand === "login" ? "OpenCode sign-in" : "OpenCode sign-out",
    }),
  );
}

export const openCodeAuth: EngineAuthController = {
  async methods(instance) {
    return (await resolveOpenCodeCli(instance))
      ? [
          {
            description:
              "Runs `opencode auth login` to sign in to a model provider.",
            id: LOGIN_METHOD_ID,
            label: "Add a provider login",
            type: "terminal-command",
          },
        ]
      : [];
  },

  async login(instance, _methodId, context) {
    await runAuthSubcommand(instance, context, "login");
  },

  async logout(instance, context) {
    const { exitCode } = await runAuthSubcommand(instance, context, "logout");
    // Other providers may still be signed in: the outcome is the login the
    // user removed, not the instance's overall state.
    return exitCode === 0 || exitCode === null
      ? { message: "Removed the provider login you chose." }
      : undefined;
  },
};
