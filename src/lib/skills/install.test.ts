import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { executeInstallSteps } from "./install";

async function createTempRoot(prefix: string) {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("executeInstallSteps", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots
        .splice(0)
        .map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  it("returns an already-installed result when the destination already contains a valid skill", async () => {
    const root = await createTempRoot("sentinel-skill-install-");
    tempRoots.push(root);

    const skillDirectory = path.join(
      root,
      ".claude",
      "skills",
      "frontend-design",
    );
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      path.join(skillDirectory, "SKILL.md"),
      "---\nname: frontend-design\ndescription: Helpful skill\n---\n\n# Steps\n",
    );

    await expect(
      executeInstallSteps({
        destRoot: root,
        installSteps: ["echo should-not-run > /tmp/unused"],
        name: "frontend-design",
        scope: "global",
        target: "claude",
      }),
    ).resolves.toEqual({
      alreadyInstalled: true,
      directory: skillDirectory,
      name: "frontend-design",
    });
  });

  it("still fails when the destination exists but is not a valid skill directory", async () => {
    const root = await createTempRoot("sentinel-skill-install-");
    tempRoots.push(root);

    const skillDirectory = path.join(
      root,
      ".claude",
      "skills",
      "frontend-design",
    );
    await mkdir(skillDirectory, { recursive: true });

    await expect(
      executeInstallSteps({
        destRoot: root,
        installSteps: ["echo should-not-run > /tmp/unused"],
        name: "frontend-design",
        scope: "global",
        target: "claude",
      }),
    ).rejects.toThrow(
      `Directory at ${skillDirectory} already exists but does not contain a valid SKILL.md.`,
    );
  });

  it("writes Sentinel install metadata for new installs", async () => {
    const root = await createTempRoot("sentinel-skill-install-");
    tempRoots.push(root);

    const result = await executeInstallSteps({
      destRoot: root,
      installSteps: [
        `mkdir -p "${root}/.sentinel/skills/example"`,
        `cat <<'EOF' > "${root}/.sentinel/skills/example/SKILL.md"
---
name: example
description: Helpful skill
---

# Steps
EOF`,
      ],
      name: "example",
      scope: "global",
      target: "sentinel",
    });

    const metadata = await readFile(
      path.join(result.directory, ".sentinel-install.json"),
      "utf8",
    );

    expect(JSON.parse(metadata)).toMatchObject({
      installedBy: "sentinel",
      target: "sentinel",
    });
  });

  it("installs Copilot skills into the home Copilot directory for global scope", async () => {
    const root = await createTempRoot("sentinel-skill-install-");
    tempRoots.push(root);

    const result = await executeInstallSteps({
      destRoot: root,
      installSteps: [
        `mkdir -p "${root}/.copilot/skills/copilot-skill"`,
        `cat <<'EOF' > "${root}/.copilot/skills/copilot-skill/SKILL.md"
---
name: copilot-skill
description: Helpful skill
---

# Steps
EOF`,
      ],
      name: "copilot-skill",
      scope: "global",
      target: "copilot",
    });

    expect(result.directory).toBe(`${root}/.copilot/skills/copilot-skill`);
  });

  it("installs Copilot skills into the workspace .github/skills directory", async () => {
    const root = await createTempRoot("sentinel-skill-install-");
    tempRoots.push(root);

    const result = await executeInstallSteps({
      destRoot: root,
      installSteps: [
        `mkdir -p "${root}/.github/skills/copilot-skill"`,
        `cat <<'EOF' > "${root}/.github/skills/copilot-skill/SKILL.md"
---
name: copilot-skill
description: Helpful skill
---

# Steps
EOF`,
      ],
      name: "copilot-skill",
      scope: "workspace",
      target: "copilot",
    });

    expect(result.directory).toBe(`${root}/.github/skills/copilot-skill`);
  });
});
