import { describe, expect, it } from "bun:test";

import {
  getClaudeDispatchSkillNames,
  getClaudeSkillRoots,
  planClaudeSkillDispatch,
} from "./skill-dispatch";

// Cases ported from t3code ClaudeSkillDispatch.test.ts (MIT).
const SKILLS = new Set(["2spec", "implement", "review", "re-release-version"]);

describe("planClaudeSkillDispatch", () => {
  it("leaves a prompt without a known skill untouched", () => {
    expect(planClaudeSkillDispatch("fix the build", SKILLS)).toBeUndefined();
    expect(
      planClaudeSkillDispatch("echo $HOME then $unknown", SKILLS),
    ).toBeUndefined();
  });

  it("moves a mid-prompt mention into a trailing slash command", () => {
    expect(
      planClaudeSkillDispatch("ok, now $implement all the tickets", SKILLS),
    ).toEqual({
      commandText: "/implement all the tickets",
      leadingText: "ok, now",
      skillName: "implement",
    });
  });

  it("keeps a mention that opens the prompt as a single command block", () => {
    expect(planClaudeSkillDispatch("$review\nfocus on auth", SKILLS)).toEqual({
      commandText: "/review\nfocus on auth",
      leadingText: undefined,
      skillName: "review",
    });
  });

  it("dispatches a known skill whose name begins with a digit", () => {
    expect(planClaudeSkillDispatch("use $2spec for this", SKILLS)).toEqual({
      commandText: "/2spec for this",
      leadingText: "use",
      skillName: "2spec",
    });
  });

  it("dispatches the last mention and rewrites earlier ones inline", () => {
    expect(
      planClaudeSkillDispatch(
        "$review the diff, then $implement the fixes",
        SKILLS,
      ),
    ).toEqual({
      commandText: "/implement the fixes",
      leadingText: "/review the diff, then",
      skillName: "implement",
    });
  });

  it("ignores glued tokens and currency amounts", () => {
    expect(
      planClaudeSkillDispatch("cost is 5$implement", SKILLS),
    ).toBeUndefined();
    const withAmounts = new Set([...SKILLS, "20", "20k", "100M", "1e6"]);
    expect(
      planClaudeSkillDispatch("pay $20 $20k $100M $1e6 tomorrow", withAmounts),
    ).toBeUndefined();
  });
});

describe("getClaudeSkillRoots", () => {
  it("lists the workspace folder and the config dir's", () => {
    expect(
      getClaudeSkillRoots({
        cwd: "/work/repo",
        env: { CLAUDE_CONFIG_DIR: "/homes/claude-work", HOME: "/Users/me" },
      }),
    ).toEqual(["/work/repo/.claude/skills", "/homes/claude-work/skills"]);
    expect(
      getClaudeSkillRoots({ cwd: null, env: { HOME: "/Users/me" } }),
    ).toEqual(["/Users/me/.claude/skills"]);
  });
});

describe("getClaudeDispatchSkillNames", () => {
  const roots = ["/work/repo/.claude/skills", "/Users/me/.claude/skills"];

  it("only dispatches skills Claude Code loads itself", () => {
    expect(
      getClaudeDispatchSkillNames(
        {
          skills: [
            {
              directory: "/work/repo/.claude/skills/review",
              engine: "claude",
              name: "review",
              target: "claude",
            },
            {
              directory: "/Users/me/.claude/skills/deploy/",
              engine: "claude",
              name: "deploy",
              sourceKind: "claude",
            },
            {
              directory: "/work/repo/.agents/skills/shared",
              engine: "claude",
              name: "shared",
              sourceKind: "agents",
              target: "sentinel",
            },
          ],
        },
        roots,
      ),
    ).toEqual(new Set(["review", "deploy"]));
    expect(getClaudeDispatchSkillNames(undefined, roots)).toEqual(new Set());
  });

  it("keeps Claude skills from folders the CLI does not read as prose", () => {
    expect(
      getClaudeDispatchSkillNames(
        {
          skills: [
            // A skillsBasePath folder Sentinel lists but Claude Code ignores.
            {
              directory: "/custom/base/.claude/skills/review",
              engine: "claude",
              name: "review",
              target: "claude",
            },
            // No folder to check.
            { engine: "claude", name: "lint", target: "claude" },
          ],
        },
        roots,
      ),
    ).toEqual(new Set());
  });
});
