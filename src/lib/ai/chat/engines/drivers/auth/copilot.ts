import "server-only";

import { withTimeout } from "@/lib/runtime/process/with-timeout";

import type { ResolvedEngineInstance } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthController,
} from "../../platform/auth/controller";
import { getInstanceHomeDirectory } from "../../platform/instance-homes";
import {
  API_KEY_METHOD_ID,
  cliTerminalCommand,
  LOGIN_METHOD_ID,
  loginWithInstanceSecret,
} from "./shared";

// GitHub Copilot runs on the runtime bundled with @github/copilot-sdk 1.0.16,
// which serves the SDK only and cannot sign in interactively (its account
// RPCs take a token, and its browser login is per session and experimental).
// So:
// - with the user's Copilot CLI installed: `copilot login` (browser or
//   device flow), into the instance's home (COPILOT_HOME, --config-dir),
//   where the bundled runtime reads it;
// - always: a GitHub token stored as the instance's COPILOT_GITHUB_TOKEN,
//   which the runtime prefers over GH_TOKEN and GITHUB_TOKEN.
// Signing out removes those variables and asks the runtime to forget the
// stored login (account.logout). The SDK loads on first use: this module
// adds nothing to what the driver itself imports.

export const COPILOT_TOKEN_VARIABLE = "COPILOT_GITHUB_TOKEN";
const TOKEN_VARIABLES = [COPILOT_TOKEN_VARIABLE, "GH_TOKEN", "GITHUB_TOKEN"];
const LOGOUT_TIMEOUT_MS = 15_000;

/** Classic PATs are refused by Copilot; say so before storing one. */
export function validateCopilotToken(value: string) {
  return value.startsWith("ghp_")
    ? "Classic personal access tokens (ghp_) do not work with Copilot. Use a fine-grained token with the Copilot Requests permission."
    : null;
}

async function loadCopilotSdk() {
  return await import("@/lib/ai/chat/engines/copilot-sdk");
}

/** Restarts the instance's runtime so it reads the new sign-in. */
async function restartRuntime(instance: ResolvedEngineInstance) {
  const { getCopilotClientManager } = await loadCopilotSdk();
  await getCopilotClientManager(instance)
    .dispose()
    .catch(() => undefined);
}

export const copilotAuth: EngineAuthController = {
  async methods(instance) {
    const { resolveCopilotLoginCli } = await loadCopilotSdk();
    const cli = await resolveCopilotLoginCli({ instance });
    return [
      ...(cli
        ? [
            {
              description:
                "Runs `copilot login`: approve the sign-in on GitHub in your browser.",
              id: LOGIN_METHOD_ID,
              label: "Sign in with GitHub",
              type: "terminal-command" as const,
            },
          ]
        : []),
      {
        description: `A fine-grained token with the Copilot Requests permission, stored encrypted as ${COPILOT_TOKEN_VARIABLE} for this instance.`,
        id: API_KEY_METHOD_ID,
        label: "Use a GitHub token",
        type: "credentials" as const,
      },
    ];
  },

  async login(instance, methodId, context) {
    if (methodId === API_KEY_METHOD_ID) {
      await loginWithInstanceSecret(
        context,
        { label: "GitHub token", name: COPILOT_TOKEN_VARIABLE, secret: true },
        { validate: validateCopilotToken },
      );
      return;
    }

    const { resolveCopilotLoginCli } = await loadCopilotSdk();
    const cli = await resolveCopilotLoginCli({ instance });
    if (!cli) {
      throw new EngineAuthError(
        "Install the GitHub Copilot CLI to sign in with your browser, or use a token.",
      );
    }

    const home = getInstanceHomeDirectory(instance);
    await context.runTerminalCommand(
      cliTerminalCommand({
        args: ["login", ...(home ? ["--config-dir", home] : [])],
        cliPath: cli.cliPath,
        nodeScript: cli.nodeScript,
        path: cli.env.PATH ?? null,
        title: "GitHub Copilot sign-in",
      }),
    );
    await restartRuntime(instance);
  },

  async logout(instance, context) {
    let signedOut = false;
    try {
      const { getCopilotClientManager } = await loadCopilotSdk();
      const client = await getCopilotClientManager(instance).getClient();
      const result = await withTimeout(
        client.rpc.account.logout({}),
        LOGOUT_TIMEOUT_MS,
        { signal: context.signal },
      );
      signedOut = result !== null;
    } catch {
      // Nothing stored, or an older runtime: the token variables may still
      // be what signs it in.
    }

    const cleared = await context.clearInstanceSecrets(TOKEN_VARIABLES);
    await restartRuntime(instance);

    if (!signedOut && cleared.length === 0) {
      throw new EngineAuthError(
        "Copilot could not sign out here. Run `copilot`, then /logout.",
      );
    }
    return cleared.length > 0
      ? { message: "Signed out and removed this instance's GitHub token." }
      : undefined;
  },
};
