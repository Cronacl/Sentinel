import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

import {
  __internal,
  discoverSkills,
  getSkillSnapshot,
  loadSkillByName,
} from "./index";

async function createTempRoot(prefix: string) {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill({
  baseDirectory,
  container,
  content = "# Skill\n\nRun the workflow.\n",
  description = "Helpful skill",
  name,
}: {
  baseDirectory: string;
  container: string;
  content?: string;
  description?: string;
  name: string;
}) {
  const skillDirectory = path.join(baseDirectory, container, name);
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    path.join(skillDirectory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`,
  );

  return skillDirectory;
}

async function waitForRevision({
  currentRevision,
  workspaceRoot,
}: {
  currentRevision: number;
  workspaceRoot: string | null;
}) {
  const timeoutAt = Date.now() + 10_000;

  while (Date.now() < timeoutAt) {
    const snapshot = await getSkillSnapshot({ workspaceRoot });
    if (snapshot.revision > currentRevision) {
      return snapshot;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for skill snapshot revision to change.");
}

async function settleWatcherSubscriptions() {
  await new Promise((resolve) =>
    setTimeout(resolve, __internal.WATCH_DEBOUNCE_MS * 2),
  );
}

describe("skills", () => {
  let homeDirectory: string;
  let originalHome: string | undefined;
  let workspaceRoot: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    homeDirectory = await createTempRoot("sentinel-skills-home-");
    workspaceRoot = await createTempRoot("sentinel-skills-workspace-");
    process.env.HOME = homeDirectory;
    __internal.clearSkillRegistry();
  });

  afterEach(async () => {
    __internal.clearSkillRegistry();
    process.env.HOME = originalHome;
    await rm(homeDirectory, { force: true, recursive: true });
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("discovers conventional workspace and global skills", async () => {
    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".agents/skills",
      name: "workspace-agent",
    });
    await writeSkill({
      baseDirectory: homeDirectory,
      container: ".claude/skills",
      name: "global-claude",
    });

    const skills = await discoverSkills({ workspaceRoot });

    expect(skills.map((skill) => skill.name)).toEqual([
      "global-claude",
      "workspace-agent",
    ]);
    expect(skills[0]?.scope).toBe("global");
    expect(skills[1]?.scope).toBe("workspace");
  });

  it("ignores invalid frontmatter and strips frontmatter when loading", async () => {
    const invalidDirectory = path.join(
      workspaceRoot,
      ".sentinel/skills/invalid-skill",
    );
    await mkdir(invalidDirectory, { recursive: true });
    await writeFile(
      path.join(invalidDirectory, "SKILL.md"),
      "# Missing frontmatter\n",
    );
    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".sentinel/skills",
      content: "## Steps\n\n1. Do the thing.\n",
      name: "valid-skill",
    });

    const skills = await discoverSkills({ workspaceRoot });
    const loaded = await loadSkillByName({
      name: "valid-skill",
      workspaceRoot,
    });

    expect(skills.map((skill) => skill.name)).toEqual(["valid-skill"]);
    expect(loaded?.content).toBe("## Steps\n\n1. Do the thing.");
  });

  it("loads skills from the requested target root", async () => {
    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".sentinel/skills",
      content: "Sentinel workflow.\n",
      description: "Sentinel version",
      name: "shared-skill",
    });
    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".claude/skills",
      content: "Claude workflow.\n",
      description: "Claude version",
      name: "shared-skill",
    });

    const sentinelSkill = await loadSkillByName({
      name: "shared-skill",
      target: "sentinel",
      workspaceRoot,
    });
    const claudeSkill = await loadSkillByName({
      name: "shared-skill",
      target: "claude",
      workspaceRoot,
    });

    expect(sentinelSkill).toMatchObject({
      content: "Sentinel workflow.",
      description: "Sentinel version",
      sourceKind: "sentinel",
    });
    expect(claudeSkill).toMatchObject({
      content: "Claude workflow.",
      description: "Claude version",
      sourceKind: "claude",
    });
  });

  it("deduplicates by precedence and ignores exact duplicate filesystem entries", async () => {
    await writeSkill({
      baseDirectory: homeDirectory,
      container: ".agents/skills",
      description: "Global version",
      name: "shared-skill",
    });
    const winningDirectory = await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".sentinel/skills",
      description: "Workspace sentinel version",
      name: "shared-skill",
    });

    const aliasContainer = path.join(workspaceRoot, ".claude/skills");
    await mkdir(path.dirname(aliasContainer), { recursive: true });
    await symlink(path.join(workspaceRoot, ".sentinel/skills"), aliasContainer);

    const skills = await discoverSkills({ workspaceRoot });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      description: "Workspace sentinel version",
      directory: winningDirectory,
      name: "shared-skill",
      scope: "workspace",
      sourceKind: "sentinel",
    });
  });

  it("updates watched snapshots when skills are added, edited, and deleted", async () => {
    const initialSnapshot = await getSkillSnapshot({ workspaceRoot });
    await settleWatcherSubscriptions();

    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".agents/skills",
      name: "watched-skill",
    });

    const addedSnapshot = await waitForRevision({
      currentRevision: initialSnapshot.revision,
      workspaceRoot,
    });
    expect(addedSnapshot.skills.map((skill) => skill.name)).toEqual([
      "watched-skill",
    ]);

    const skillFile = path.join(
      workspaceRoot,
      ".agents/skills/watched-skill/SKILL.md",
    );
    await writeFile(
      skillFile,
      "---\nname: watched-skill\ndescription: Updated description\n---\n\n# Changed\n",
    );

    const editedSnapshot = await waitForRevision({
      currentRevision: addedSnapshot.revision,
      workspaceRoot,
    });
    expect(editedSnapshot.skills[0]?.description).toBe("Updated description");

    await rm(path.dirname(skillFile), { force: true, recursive: true });

    const deletedSnapshot = await waitForRevision({
      currentRevision: editedSnapshot.revision,
      workspaceRoot,
    });
    expect(deletedSnapshot.skills).toEqual([]);
  });

  it("detects a newly created skills container via parent-directory watching", async () => {
    const initialSnapshot = await getSkillSnapshot({ workspaceRoot });
    await settleWatcherSubscriptions();

    await writeSkill({
      baseDirectory: workspaceRoot,
      container: ".claude/skills",
      name: "new-container-skill",
    });

    const updatedSnapshot = await waitForRevision({
      currentRevision: initialSnapshot.revision,
      workspaceRoot,
    });

    expect(updatedSnapshot.skills.map((skill) => skill.name)).toEqual([
      "new-container-skill",
    ]);
  });
});
