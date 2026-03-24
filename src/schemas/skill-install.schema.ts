import { z } from "zod";

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/i;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function isValidSkillPath(value: string) {
  const normalized = value.trim().replace(/^\.\/+/, "");

  if (!normalized || normalized.startsWith("/")) {
    return false;
  }

  return normalized.split("/").every((segment) => segment && segment !== "..");
}

function isGitHubRepoUrl(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/")
      .filter(Boolean);

    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      GITHUB_HOSTS.has(url.hostname) &&
      segments.length >= 2
    );
  } catch {
    return false;
  }
}

export const skillScopeSchema = z.enum(["global", "workspace"]);
export const skillInstallTargetSchema = z.enum(["sentinel", "codex"]);

export const skillNameSchema = z
  .string()
  .trim()
  .min(1, "Skill name is required.")
  .regex(
    SKILL_NAME_PATTERN,
    "Use letters, numbers, dashes, or underscores only.",
  );

export const customSkillInstallFormSchema = z
  .object({
    installInstructions: z.string(),
    name: skillNameSchema,
    ref: z.string().trim().min(1, "Git ref is required."),
    repoUrl: z
      .string()
      .trim()
      .min(1, "Repository URL is required.")
      .refine(isGitHubRepoUrl, "Enter a valid GitHub repository URL."),
    scope: skillScopeSchema,
    target: skillInstallTargetSchema.default("sentinel"),
    skillPath: z
      .string()
      .trim()
      .min(1, "Skill path is required.")
      .refine(
        isValidSkillPath,
        "Use a repo-relative path without leading slashes or '..' segments.",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.target === "codex" && data.scope === "workspace") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Codex skills can only be installed globally.",
        path: ["scope"],
      });
    }
  });

export type CustomSkillInstallFormValues = z.infer<
  typeof customSkillInstallFormSchema
>;
export type CustomSkillInstallFormInputValues = z.input<
  typeof customSkillInstallFormSchema
>;
