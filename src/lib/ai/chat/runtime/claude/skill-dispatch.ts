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
 * The skills of a message that Claude Code can run natively: the Claude
 * skill chips the composer inserted (`.claude/skills`, in the workspace or
 * the instance's config dir). Shared `.agents` skills stay prose.
 */
export function getClaudeDispatchSkillNames(
  composerContext: Pick<ComposerContext, "skills"> | null | undefined,
): Set<string> {
  return new Set(
    (composerContext?.skills ?? [])
      .filter(
        (skill) => skill.target === "claude" || skill.sourceKind === "claude",
      )
      .map((skill) => skill.name),
  );
}
