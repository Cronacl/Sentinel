import { z } from "zod";

export const loadSkillInputSchema = z.object({
  name: z.string().min(1).describe("The discovered skill name to load."),
});

export const loadSkillOutputSchema = z.object({
  content: z.string(),
  description: z.string(),
  directory: z.string(),
  files: z.array(z.string()),
  name: z.string(),
  preview: z.string(),
  scope: z.enum(["global", "workspace"]),
  skillFile: z.string(),
  sourceKind: z.enum(["agents", "claude", "sentinel"]),
});

export type LoadSkillInput = z.infer<typeof loadSkillInputSchema>;
export type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;

export async function executeLoadSkill({
  input,
  workspaceRoot,
}: {
  input: LoadSkillInput;
  workspaceRoot: string | null;
}): Promise<LoadSkillOutput> {
  const { loadSkillByName } = await import("@/lib/skills");
  const skill = await loadSkillByName({
    name: input.name,
    workspaceRoot,
  });

  if (!skill) {
    throw new Error(`Skill "${input.name}" was not found.`);
  }

  return skill;
}
