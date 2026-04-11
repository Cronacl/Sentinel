import { z } from "zod";

export const loadSkillInputSchema = z.object({
  name: z.string().min(1).describe("The discovered skill name to load."),
});

export const loadSkillOutputSchema = z.object({
  content: z.string(),
  description: z.string(),
  directory: z.string(),
  files: z.array(z.string()),
  installOrigin: z.enum(["external", "sentinel"]),
  isExternal: z.boolean(),
  name: z.string(),
  preview: z.string(),
  scope: z.enum(["global", "workspace"]),
  skillFile: z.string(),
  sourceKind: z.enum(["agents", "claude", "copilot", "codex", "sentinel"]),
  target: z.enum(["sentinel", "codex", "claude", "copilot"]),
});

export type LoadSkillInput = z.infer<typeof loadSkillInputSchema>;
export type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;

function buildSkillPreamble(skill: {
  directory: string;
  name: string;
  skillFile: string;
}) {
  return [
    `# Sentinel runtime guidance for ${skill.name}`,
    "",
    `- Actual skill directory: ${skill.directory}`,
    `- Actual SKILL.md path: ${skill.skillFile}`,
    "- Use the returned directory above as the source of truth for scripts, references, and bundled assets.",
    "- If the skill text mentions older defaults such as ~/.codex/skills, $CODEX_HOME/skills, or another home-based location, treat those as stale examples and replace them with the actual skill directory above.",
    '- When invoking a script from this skill, prefer the absolute path directly or export the variable in a separate command first. Do not rely on `VAR=/path "$VAR" ...` in one shell command because the variable expansion happens before the assignment.',
    "",
  ].join("\n");
}

export async function executeLoadSkill({
  globalBase,
  input,
  workspaceRoot,
}: {
  globalBase: string | null;
  input: LoadSkillInput;
  workspaceRoot: string | null;
}): Promise<LoadSkillOutput> {
  const { loadSkillByName } = await import("@/lib/skills");
  const skill = await loadSkillByName({
    globalBase,
    name: input.name,
    workspaceRoot,
  });

  if (!skill) {
    throw new Error(`Skill "${input.name}" was not found.`);
  }

  return {
    ...skill,
    content: `${buildSkillPreamble(skill)}${skill.content}`,
  };
}
