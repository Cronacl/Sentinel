import {
  readArray,
  readNonEmptyString,
  readRecord,
  readString,
} from "../acp/schema";
import type { EngineSkill, EngineSlashCommand } from "../contract";

// Pi's slash commands and skills (t3code packages/provider-pi/src/server/
// commands.ts, MIT). `get_commands` lists extension commands, prompt
// templates and skills (`skill:<name>`), all of which Pi expands itself when
// the prompt starts with `/name`; it omits the TUI built-ins, so `/compact`
// is added here and run through the RPC `compact` command. Pure.

/** Registered by Sentinel's Pi extension (extension.ts); never listed. */
export const PI_GATE_COMMAND = "sentinel-permission-gate";

export const PI_COMPACT_COMMAND: EngineSlashCommand = {
  description: "Summarize the conversation to free up context",
  inputHint: "Optional instructions",
  name: "compact",
  source: "native",
};

/** `/compact [instructions]` as the RPC compact command's input. */
export function parsePiCompactCommand(
  text: string,
): { customInstructions?: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/compact")) {
    return null;
  }
  const rest = trimmed.slice("/compact".length);
  if (rest && !/^\s/.test(rest)) {
    return null;
  }
  const customInstructions = rest.trim();
  return customInstructions ? { customInstructions } : {};
}

export type PiCommands = {
  /** Sentinel's permission extension is loaded in this process. */
  gateLoaded: boolean;
  skills: EngineSkill[];
  slashCommands: EngineSlashCommand[];
};

export function readPiCommands(data: unknown): PiCommands {
  const slashCommands: EngineSlashCommand[] = [PI_COMPACT_COMMAND];
  const skills: EngineSkill[] = [];
  let gateLoaded = false;
  const names = new Set<string>([PI_COMPACT_COMMAND.name]);

  for (const command of readArray(data, "commands") ?? []) {
    const name = readNonEmptyString(command, "name");
    if (!name) {
      continue;
    }
    if (name === PI_GATE_COMMAND) {
      gateLoaded = true;
      continue;
    }
    if (names.has(name)) {
      continue;
    }
    names.add(name);
    const description = readNonEmptyString(command, "description");
    const sourceInfo = readRecord(command, "sourceInfo");
    if (readString(command, "source") === "skill") {
      const skillName = name.startsWith("skill:")
        ? name.slice("skill:".length)
        : name;
      if (skillName) {
        const scope = readString(sourceInfo, "scope");
        skills.push({
          ...(description ? { description } : {}),
          enabled: true,
          name: skillName,
          path: readString(sourceInfo, "path") ?? `pi:skill:${skillName}`,
          ...(scope ? { scope } : {}),
          userInvocable: true,
        });
      }
    }
    slashCommands.push({
      ...(description ? { description } : {}),
      name,
      source: "native",
    });
  }
  return { gateLoaded, skills, slashCommands };
}
