// Client-safe slash commands per engine instance. Snapshots carry what each
// runtime reports (`EngineSnapshot.slashCommands`): "native" commands go
// to the runtime as the prompt's text (`/name args`), "sentinel" ones are
// run by Sentinel itself through a driver action (Codex compact, review,
// rollback through its app-server). The composer's slash menu is built
// from them; before an instance reports any, the commands the composer
// always offered for its driver stand in.
import type { EngineSlashCommand } from "./contract";

const SLASH_COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/;
const MAX_SLASH_COMMANDS = 200;

/** Run by Sentinel through the Codex app-server of the thread's instance. */
export const CODEX_SLASH_COMMANDS: readonly EngineSlashCommand[] = [
  {
    description: "Compact Codex context",
    name: "compact",
    source: "sentinel",
  },
  {
    description: "Start Codex review mode",
    name: "review",
    source: "sentinel",
  },
  {
    description: "Undo the last Codex turn",
    name: "rollback",
    source: "sentinel",
  },
];

/** What the composer offered before instances reported their commands. */
const FALLBACK_SLASH_COMMANDS: Partial<
  Record<string, readonly EngineSlashCommand[]>
> = {
  claude: [
    "clear",
    "compact",
    "config",
    "cost",
    "doctor",
    "help",
    "init",
    "login",
    "logout",
    "memory",
    "model",
    "permissions",
    "resume",
    "status",
  ].map((name) => ({
    description: `Run Claude /${name}`,
    name,
    source: "native" as const,
  })),
  codex: CODEX_SLASH_COMMANDS,
};

export type ComposerSlashCommand = {
  command: string;
  description: string;
  inputHint?: string;
  /** execute: Sentinel runs it; insert: `/name ` goes into the prompt. */
  mode: "execute" | "insert";
};

/**
 * Runtime-reported commands, cleaned for the menu: valid names only, the
 * first of each name, at most 200.
 */
export function normalizeEngineSlashCommands(
  commands: ReadonlyArray<{
    description?: string | null;
    inputHint?: string | null;
    name: string;
  }>,
  source: EngineSlashCommand["source"],
): EngineSlashCommand[] {
  const seen = new Set<string>();
  const normalized: EngineSlashCommand[] = [];
  for (const command of commands) {
    const name = command.name.trim().replace(/^\/+/, "");
    if (!SLASH_COMMAND_NAME.test(name) || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());
    const description = command.description?.trim();
    const inputHint = command.inputHint?.trim();
    normalized.push({
      ...(description ? { description } : {}),
      ...(inputHint ? { inputHint } : {}),
      name,
      source,
    });
    if (normalized.length >= MAX_SLASH_COMMANDS) {
      break;
    }
  }
  return normalized;
}

/**
 * The selected instance's commands for the composer menu: what its
 * snapshot reports, else its driver's long-standing defaults.
 */
export function resolveComposerSlashCommands(input: {
  driver: string;
  slashCommands?: readonly EngineSlashCommand[] | null;
}): ComposerSlashCommand[] {
  const commands =
    input.slashCommands && input.slashCommands.length > 0
      ? input.slashCommands
      : (FALLBACK_SLASH_COMMANDS[input.driver] ?? []);
  return commands.map((command) => ({
    command: command.name,
    description:
      command.description ??
      (command.source === "native" ? `Run /${command.name}` : command.name),
    ...(command.inputHint ? { inputHint: command.inputHint } : {}),
    mode: command.source === "sentinel" ? "execute" : "insert",
  }));
}

/**
 * The composer menu's commands: inserted ones always, Sentinel-run ones
 * only when the composer has an action for them and can run it here (a
 * thread that has the native session, canRunSentinelSlashCommands).
 */
export function getRunnableComposerSlashCommands(
  commands: readonly ComposerSlashCommand[],
  input: { actions: ReadonlySet<string>; canExecute: boolean },
): ComposerSlashCommand[] {
  return commands.filter(
    (command) =>
      command.mode === "insert" ||
      (input.canExecute && input.actions.has(command.command)),
  );
}

/**
 * Whether Sentinel can run a driver's "sentinel" commands on a thread: the
 * thread has the native session they act on (a Codex thread today).
 */
export function canRunSentinelSlashCommands(input: {
  driver: string | null | undefined;
  hasCodexThread: boolean;
}) {
  return input.driver === "codex" && input.hasCodexThread;
}
