import { execSync } from "node:child_process";
import { readFile, rm, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEST_PLACEHOLDER = "{{DEST}}";
const SKILL_FILENAME = "SKILL.md";
const SKILL_DIRECTORY_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/i;
export type SkillInstallTarget = "sentinel" | "codex" | "claude";
export type SkillInstallResult = {
  alreadyInstalled?: boolean;
  directory: string;
  name: string;
};

async function pathExists(candidatePath: string) {
  return Boolean(await stat(candidatePath).catch(() => null));
}

function validateFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match?.[1]) {
    throw new Error("SKILL.md is missing YAML frontmatter.");
  }

  let hasName = false;
  let hasDescription = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line || /^\s/.test(line)) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (key === "name") hasName = true;
    if (key === "description") hasDescription = true;
  }

  if (!hasName || !hasDescription) {
    throw new Error(
      "SKILL.md frontmatter must include non-empty name and description.",
    );
  }
}

export function resolveCodexHome() {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
}

async function validateInstalledSkillDirectory(dest: string) {
  const skillFile = path.join(dest, SKILL_FILENAME);
  const content = await readFile(skillFile, "utf8").catch(() => null);

  if (!content) {
    throw new Error(
      `Directory at ${dest} already exists but does not contain a valid SKILL.md.`,
    );
  }

  validateFrontmatter(content);
}

function resolveSkillDestination(
  destRoot: string,
  name: string,
  target: SkillInstallTarget,
) {
  const normalizedName = name.trim();
  if (!SKILL_DIRECTORY_NAME_PATTERN.test(normalizedName)) {
    throw new Error(
      "Skill name must use only letters, numbers, dashes, or underscores.",
    );
  }

  const skillsDir =
    target === "codex"
      ? path.resolve(destRoot, "skills")
      : target === "claude"
        ? path.resolve(destRoot, ".claude", "skills")
        : path.resolve(destRoot, ".sentinel", "skills");
  const dest = path.resolve(skillsDir, normalizedName);

  if (path.dirname(dest) !== skillsDir) {
    throw new Error(`Invalid skill destination for "${name}".`);
  }

  return { dest, skillsDir };
}

export async function executeInstallSteps({
  name,
  installSteps,
  destRoot,
  target = "sentinel",
}: {
  name: string;
  installSteps: string[];
  destRoot: string;
  target?: SkillInstallTarget;
}): Promise<SkillInstallResult> {
  const { dest, skillsDir } = resolveSkillDestination(destRoot, name, target);

  if (await pathExists(dest)) {
    await validateInstalledSkillDirectory(dest);
    return {
      alreadyInstalled: true,
      directory: dest,
      name,
    };
  }

  await mkdir(skillsDir, { recursive: true });

  const resolvedSteps = installSteps.map((step) =>
    step.replaceAll(DEST_PLACEHOLDER, dest),
  );

  const script = ["set -e", ...resolvedSteps].join("\n");

  try {
    execSync(script, { shell: "/bin/sh", stdio: "pipe", timeout: 60_000 });
  } catch (error) {
    await rm(dest, { recursive: true, force: true }).catch(() => {});
    const message =
      error instanceof Error ? error.message : "Install step failed.";
    throw new Error(`Failed to install skill "${name}": ${message}`);
  }

  const skillFile = path.join(dest, SKILL_FILENAME);
  const content = await readFile(skillFile, "utf8").catch(() => null);

  if (!content) {
    await rm(dest, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `Skill "${name}" was installed but SKILL.md was not found at ${skillFile}.`,
    );
  }

  try {
    validateFrontmatter(content);
  } catch (validationError) {
    await rm(dest, { recursive: true, force: true }).catch(() => {});
    throw validationError;
  }

  return { directory: dest, name };
}

export async function uninstallSkill({
  name,
  destRoot,
  target = "sentinel",
}: {
  name: string;
  destRoot: string;
  target?: SkillInstallTarget;
}) {
  const { dest } = resolveSkillDestination(destRoot, name, target);

  if (!(await pathExists(dest))) {
    throw new Error(`Skill "${name}" is not installed at ${dest}.`);
  }

  const skillFile = path.join(dest, SKILL_FILENAME);
  if (!(await pathExists(skillFile))) {
    throw new Error(
      `Directory at ${dest} does not appear to be a valid skill (no SKILL.md).`,
    );
  }

  await rm(dest, { recursive: true, force: true });
  return { name, directory: dest };
}
