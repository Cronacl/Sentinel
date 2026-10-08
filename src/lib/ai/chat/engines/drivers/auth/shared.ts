import "server-only";

import type { EngineAuthCredentialField } from "../../contract";
import {
  EngineAuthError,
  type EngineAuthFlowContext,
  type EngineAuthTerminalCommand,
} from "../../platform/auth/controller";
import { toAuthTerminalInvocation } from "../../platform/auth/terminal-command";

// Building blocks the drivers' auth controllers share: running a CLI's own
// sign-in in a terminal, and API keys stored as instance secrets.

export const LOGIN_METHOD_ID = "cli-login";
export const API_KEY_METHOD_ID = "api-key";

function stringEnv(env: Record<string, string | undefined> | undefined) {
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * A CLI subcommand as the embedded terminal runs it. A JavaScript CLI runs
 * under the server's Node runtime (Electron as Node in the packaged app, as
 * the engines themselves do), Windows shims through cmd.exe; the user is
 * shown the CLI itself either way. `path` is the PATH the CLI was found
 * with.
 */
export function cliTerminalCommand(input: {
  args: string[];
  cliPath: string;
  nodeScript?: boolean;
  path?: string | null;
  platform?: NodeJS.Platform;
  title: string;
}): EngineAuthTerminalCommand {
  const display = { args: input.args, command: input.cliPath };
  const env = input.path ? { PATH: input.path } : undefined;

  if (input.nodeScript) {
    return {
      args: [input.cliPath, ...input.args],
      command: process.execPath,
      display,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      title: input.title,
    };
  }

  const invocation = toAuthTerminalInvocation(input.cliPath, input.args, {
    platform: input.platform,
  });
  return {
    ...invocation,
    ...(invocation.command !== input.cliPath ? { display } : {}),
    ...(env ? { env } : {}),
    title: input.title,
  };
}

/** A launch the Claude helpers built (env may hold unset entries). */
export function launchTerminalCommand(input: {
  display: { args: string[]; command: string };
  launch: {
    args: string[];
    command: string;
    env: Record<string, string | undefined>;
  };
  path?: string | null;
  title: string;
}): EngineAuthTerminalCommand {
  const env = {
    ...(input.path ? { PATH: input.path } : {}),
    ...stringEnv(input.launch.env),
  };
  const invocation =
    input.launch.command === input.display.command
      ? toAuthTerminalInvocation(input.launch.command, input.launch.args)
      : { args: input.launch.args, command: input.launch.command };
  return {
    ...invocation,
    display: input.display,
    ...(Object.keys(env).length > 0 ? { env } : {}),
    title: input.title,
  };
}

/**
 * Asks for one secret and stores it as the instance's (encrypted) variable
 * of that name. `validate` returns a message for a value to refuse.
 */
export async function loginWithInstanceSecret(
  context: EngineAuthFlowContext,
  field: EngineAuthCredentialField,
  options: {
    description?: string;
    validate?: (value: string) => string | null;
  } = {},
) {
  const values = await context.requestCredentials([field], {
    ...(options.description ? { description: options.description } : {}),
  });
  const value = values[field.name];
  if (!value) {
    throw new EngineAuthError(`${field.label} is required.`);
  }
  const problem = options.validate?.(value) ?? null;
  if (problem) {
    throw new EngineAuthError(problem);
  }
  await context.saveInstanceSecrets({ [field.name]: value });
}

export { stringEnv };
