// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const getSkillSnapshot = mock(async ({ workspaceRoot, globalBase }) => ({
  revision: 2,
  skillRoots: workspaceRoot
    ? [`${workspaceRoot}/.sentinel/skills/example`]
    : [],
  skills: [
    {
      description: "Helpful skill",
      directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example`,
      name: "example",
      preview: "# Example",
      scope: workspaceRoot ? "workspace" : "global",
      skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example/SKILL.md`,
      sourceKind: "sentinel",
    },
  ],
  updatedAt: 123,
}));
const discoverCodexSkills = mock(async () => []);
const loadSkillByName = mock(async () => null);
function resolveTargetDirectory(
  destRoot: string,
  name: string,
  target: "claude" | "codex" | "sentinel" = "sentinel",
) {
  if (target === "codex") {
    return `${destRoot}/skills/${name}`;
  }

  if (target === "claude") {
    return `${destRoot}/.claude/skills/${name}`;
  }

  return `${destRoot}/.sentinel/skills/${name}`;
}

const executeInstallSteps = mock(
  async ({ name, destRoot, installSteps, target = "sentinel" }) => ({
    directory: resolveTargetDirectory(destRoot, name, target),
    installSteps,
    name,
  }),
);
const resolveCodexHome = mock(() => "/tmp/codex-home");
const uninstallSkill = mock(
  async ({ name, destRoot, target = "sentinel" }) => ({
    directory: resolveTargetDirectory(destRoot, name, target),
    name,
  }),
);
const listCodexSkills = mock(async () => ({ skills: [] }));
const writeSkillConfig = mock(async () => {});
const buildInstallSteps = mock((repoUrl, skillPath, ref) => [
  `fetch ${repoUrl}`,
  `copy ${skillPath}@${ref} {{DEST}}`,
]);

const registryEntry = {
  description: "Helpful skill",
  displayName: "Example",
  installSteps: ["echo curated", "cp repo {{DEST}}"],
  name: "example",
  ref: "main",
  repoUrl: "https://github.com/openai/skills",
  skillPath: "skills/.curated/example",
};

mock.module("@/server/api/trpc", () => ({
  createTRPCRouter: (routes: Record<string, any>) => routes,
  protectedProcedure: {
    input: () => ({
      mutation: (handler: any) => handler,
      query: (handler: any) => handler,
    }),
    query: (handler: any) => handler,
  },
}));

mock.module("@/lib/skills", () => ({
  discoverCodexSkills,
  getSkillSnapshot,
  loadSkillByName,
}));

mock.module("@/lib/skills/install", () => ({
  executeInstallSteps,
  resolveCodexHome,
  uninstallSkill,
}));

mock.module("@/lib/skills/registry", () => ({
  SKILL_REGISTRY: [registryEntry],
  buildInstallSteps,
  findRegistrySkill: (name: string) =>
    name === registryEntry.name ? registryEntry : null,
}));

mock.module("@/lib/ai/chat/engines/codex-app-server", () => ({
  getCodexAppServerManager: () => ({
    listSkills: listCodexSkills,
    writeSkillConfig,
  }),
}));

const { skillsRouter } = await import("./skills");

afterEach(() => {
  mock.restore();
});

describe("skillsRouter", () => {
  it("returns a snapshot for the selected workspace root and custom global base", async () => {
    const result = await skillsRouter.list({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
    });

    expect(getSkillSnapshot).toHaveBeenCalledWith({
      globalBase: "/tmp/custom-home",
      workspaceRoot: "/tmp/workspace",
    });
    expect(result.revision).toBe(2);
    expect(result.skills[0]?.name).toBe("example");
    expect(result.skills[0]?.target).toBe("sentinel");
  });

  it("returns claude-discovered skills with a claude install target", async () => {
    getSkillSnapshot.mockImplementationOnce(
      async ({ workspaceRoot, globalBase }) => ({
        revision: 2,
        skillRoots: [
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example`,
        ],
        skills: [
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example`,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example/SKILL.md`,
            sourceKind: "claude",
          },
        ],
        updatedAt: 123,
      }),
    );

    const result = await skillsRouter.list({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
    });

    expect(result.skills).toEqual([
      expect.objectContaining({
        name: "example",
        sourceKind: "claude",
        target: "claude",
      }),
    ]);
  });

  it("marks curated skills as installed in codex when present in the codex skills directory", async () => {
    discoverCodexSkills.mockImplementationOnce(async () => [
      {
        description: "Helpful skill",
        directory: "/tmp/codex-home/skills/example",
        name: "example",
        preview: "# Example",
        scope: "global",
        skillFile: "/tmp/codex-home/skills/example/SKILL.md",
        sourceKind: "codex",
      },
    ]);

    const result = await skillsRouter.registry({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: null,
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        installedTargets: {
          claude: false,
          codex: true,
          sentinel: true,
        },
        name: "example",
      }),
    ]);
  });

  it("marks curated skills as installed in claude independently from sentinel and codex", async () => {
    getSkillSnapshot.mockImplementationOnce(
      async ({ workspaceRoot, globalBase }) => ({
        revision: 2,
        skillRoots: workspaceRoot
          ? [`${workspaceRoot}/.claude/skills/example`]
          : [],
        skills: [
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example`,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example/SKILL.md`,
            sourceKind: "claude",
          },
        ],
        updatedAt: 123,
      }),
    );

    const result = await skillsRouter.registry({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: null,
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        installedTargets: {
          claude: true,
          codex: false,
          sentinel: false,
        },
        name: "example",
      }),
    ]);
  });

  it("installs curated skills using the server registry steps", async () => {
    const result = await skillsRouter.install({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: null,
      },
      input: {
        name: "example",
        scope: "global",
        target: "sentinel",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/custom-home",
      installSteps: registryEntry.installSteps,
      name: "example",
      target: "sentinel",
    });
    expect(result.directory).toBe("/tmp/custom-home/.sentinel/skills/example");
  });

  it("installs curated skills into claude global skills directories", async () => {
    const result = await skillsRouter.install({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: null,
      },
      input: {
        name: "example",
        scope: "global",
        target: "claude",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/custom-home",
      installSteps: registryEntry.installSteps,
      name: "example",
      target: "claude",
    });
    expect(result.directory).toBe("/tmp/custom-home/.claude/skills/example");
  });

  it("installs curated skills into claude workspace skills directories", async () => {
    const result = await skillsRouter.install({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
      input: {
        name: "example",
        scope: "workspace",
        target: "claude",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      installSteps: registryEntry.installSteps,
      name: "example",
      target: "claude",
    });
    expect(result.directory).toBe("/tmp/workspace/.claude/skills/example");
  });

  it("does not fail codex installs when the codex skill inventory is unavailable", async () => {
    listCodexSkills.mockImplementationOnce(async () => ({}));

    await expect(
      skillsRouter.install({
        ctx: {
          user: {
            skillsBasePath: "/tmp/custom-home",
          },
          workspace: null,
        },
        input: {
          name: "example",
          scope: "global",
          target: "codex",
        },
      }),
    ).resolves.toEqual({
      directory: "/tmp/codex-home/skills/example",
      installSteps: registryEntry.installSteps,
      name: "example",
    });

    expect(writeSkillConfig).not.toHaveBeenCalled();
  });

  it("builds default steps for custom skill installs when no override is provided", async () => {
    await skillsRouter.installCustom({
      ctx: {
        user: {
          skillsBasePath: null,
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
      input: {
        installInstructions: "",
        name: "custom-skill",
        ref: "main",
        repoUrl: "https://github.com/example/repo",
        scope: "workspace",
        skillPath: "skills/custom-skill",
        target: "sentinel",
      },
    });

    expect(buildInstallSteps).toHaveBeenCalledWith(
      "https://github.com/example/repo",
      "skills/custom-skill",
      "main",
    );
    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      installSteps: [
        "fetch https://github.com/example/repo",
        "copy skills/custom-skill@main {{DEST}}",
      ],
      name: "custom-skill",
      target: "sentinel",
    });
  });

  it("loads claude-targeted skills using the claude lookup target", async () => {
    await skillsRouter.get({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
      input: {
        name: "example",
        target: "claude",
      },
    });

    expect(loadSkillByName).toHaveBeenCalledWith({
      globalBase: "/tmp/custom-home",
      name: "example",
      target: "claude",
      workspaceRoot: "/tmp/workspace",
    });
  });

  it("uninstalls from the requested scope", async () => {
    await skillsRouter.uninstall({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
      input: {
        name: "example",
        scope: "workspace",
        target: "sentinel",
      },
    });

    expect(uninstallSkill).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      name: "example",
      target: "sentinel",
    });
  });

  it("uninstalls claude skills from the claude destination", async () => {
    const result = await skillsRouter.uninstall({
      ctx: {
        user: {
          skillsBasePath: "/tmp/custom-home",
        },
        workspace: {
          rootPath: "/tmp/workspace",
        },
      },
      input: {
        name: "example",
        scope: "workspace",
        target: "claude",
      },
    });

    expect(uninstallSkill).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      name: "example",
      target: "claude",
    });
    expect(result.directory).toBe("/tmp/workspace/.claude/skills/example");
  });
});
