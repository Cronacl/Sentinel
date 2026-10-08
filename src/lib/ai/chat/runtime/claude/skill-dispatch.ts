import os from "node:os";
import path from "node:path";

import type { ComposerContext } from "@/lib/composer-context/types";

// Turns `$skill` mentions in a Claude prompt into the slash invocation
// Claude Code runs. Ported from t3code
// apps/server/src/provider/Drivers/ClaudeSkillDispatch.ts (MIT).
//
// The composer inserts `$name` for every engine. Codex parses that itself;
// Claude Code treats it as prose. Its only user-side invocation is a text
// block whose first character is `/`: `/name args` expands into the
// SKILL.md body, with everything after the name (newlines included) as the
// arguments. In stream-json mode (the Agent SDK):
// - the check runs on the LAST text block of the message; earlier text
//   blocks are kept verbatim and image blocks may sit before it;
// - leading whitespace, or a `/name` on a later line, is literal text;
// - only one skill expands per message, so earlier mentions are rewritten
//   to `/name` inline (the model starts those through its Skill tool).
// One mention anywhere in the prompt therefore becomes a guaranteed
// invocation, with the user's text on both sides kept in order.

/**
 * The composer's mention token: a currency sign (the composer types `$`)
 * followed by a name with a letter in it, not an amount such as `$20k`.
 */
const SKILL_MENTION_PATTERN =
  /(^|\s)\p{Sc}(?![0-9][0-9_]*(?:[kKmMbBtT]|[eE][0-9]+)?(?:\s|$))(?=[a-zA-Z0-9:_-]*[a-zA-Z])([a-zA-Z0-9][a-zA-Z0-9:_-]*)(?=\s|$)/gu;

export type ClaudeSkillDispatch = {
  /** `/name` plus the trailing text: the message's last text block. */
  commandText: string;
  /** Text before the dispatched mention; undefined when it opens the prompt. */
  leadingText: string | undefined;
  skillName: string;
};

/**
 * Splits `prompt` around the last mention of a known skill, or returns
 * undefined when there is nothing to dispatch (the prompt then goes out
 * unchanged). Mentions of anything else stay literal: `$HOME` in prose
 * must not become a command.
 */
export function planClaudeSkillDispatch(
  prompt: string,
  skillNames: ReadonlySet<string>,
): ClaudeSkillDispatch | undefined {
  const mentions = [...prompt.matchAll(SKILL_MENTION_PATTERN)].flatMap(
    (match) => {
      const name = match[2] ?? "";
      if (!skillNames.has(name)) {
        return [];
      }
      const start = (match.index ?? 0) + (match[1]?.length ?? 0);
      return [{ end: (match.index ?? 0) + match[0].length, name, start }];
    },
  );
  const last = mentions.at(-1);
  if (!last) {
    return undefined;
  }

  const leading = prompt.slice(0, last.start);
  const trailing = prompt.slice(last.end);
  const leadingWithInlineSlashes = mentions
    .slice(0, -1)
    .reduceRight(
      (text, mention) =>
        `${text.slice(0, mention.start)}/${mention.name}${text.slice(mention.end)}`,
      leading,
    )
    .trimEnd();

  return {
    commandText: `/${last.name}${trailing}`.trimEnd(),
    leadingText:
      leadingWithInlineSlashes.length > 0
        ? leadingWithInlineSlashes
        : undefined,
    skillName: last.name,
  };
}

/**
 * The skill folders the run's Claude Code reads itself: `.claude/skills` in
 * its working directory (the workspace) and `skills` in its config dir
 * (the instance's CLAUDE_CONFIG_DIR, else ~/.claude). A Claude skill
 * Sentinel lists from anywhere else (a skillsBasePath folder) is unknown to
 * the CLI, so its chip must stay prose rather than become `/name`.
 */
export function getClaudeSkillRoots(input: {
  cwd: string | null;
  env: Record<string, string | undefined>;
}): string[] {
  const configDirectory =
    input.env.CLAUDE_CONFIG_DIR?.trim() ||
    path.join(input.env.HOME?.trim() || os.homedir(), ".claude");
  return [
    ...(input.cwd ? [path.join(input.cwd, ".claude", "skills")] : []),
    path.join(configDirectory, "skills"),
  ].map((root) => path.resolve(root));
}

/**
 * The skills of a message that Claude Code can run natively: the Claude
 * skill chips the composer inserted whose folder sits in one of `roots`
 * (getClaudeSkillRoots). Shared `.agents` skills, and chips without a
 * folder, stay prose.
 */
export function getClaudeDispatchSkillNames(
  composerContext: Pick<ComposerContext, "skills"> | null | undefined,
  roots: readonly string[],
): Set<string> {
  const rootSet = new Set(roots.map((root) => path.resolve(root)));
  return new Set(
    (composerContext?.skills ?? [])
      .filter(
        (skill) =>
          (skill.target === "claude" || skill.sourceKind === "claude") &&
          Boolean(skill.directory) &&
          rootSet.has(path.dirname(path.resolve(skill.directory!))),
      )
      .map((skill) => skill.name),
  );
}
