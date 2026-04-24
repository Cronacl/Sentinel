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
      installOrigin: "sentinel",
      isExternal: false,
      name: "example",
      preview: "# Example",
      scope: workspaceRoot ? "workspace" : "global",
      skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example/SKILL.md`,
      sourceKind: "sentinel",
      target: "sentinel",
    },
  ],
  updatedAt: 123,
}));
const discoverCodexSkills = mock(async () => []);
const loadSkillByName = mock(async () => null);
function resolveTargetDirectory(
  destRoot: string,
  name: string,
  target:
    | "claude"
    | "codex"
    | "copilot"
    | "cursor"
    | "opencode"
    | "sentinel" = "sentinel",
  scope: "global" | "workspace" = "global",
) {
  if (target === "codex") {
    return `${destRoot}/skills/${name}`;
  }

  if (target === "claude") {
    return `${destRoot}/.claude/skills/${name}`;
  }

  if (target === "copilot") {
    return scope === "workspace"
      ? `${destRoot}/.github/skills/${name}`
      : `${destRoot}/.copilot/skills/${name}`;
  }

  if (target === "cursor") {
    return `${destRoot}/.cursor/skills/${name}`;
  }

  if (target === "opencode") {
    return scope === "workspace"
      ? `${destRoot}/.opencode/skills/${name}`
      : `${destRoot}/.config/opencode/skills/${name}`;
  }

  return `${destRoot}/.sentinel/skills/${name}`;
}

const executeInstallSteps = mock(
  async ({
    name,
    destRoot,
    installSteps,
    scope = "global",
    target = "sentinel",
  }) => ({
    directory: resolveTargetDirectory(destRoot, name, target, scope),
    installSteps,
    name,
  }),
);
const resolveCodexHome = mock(() => "/tmp/codex-home");
const uninstallSkill = mock(
  async ({ name, destRoot, scope = "global", target = "sentinel" }) => ({
    directory: resolveTargetDirectory(destRoot, name, target, scope),
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
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example/SKILL.md`,
            sourceKind: "claude",
            target: "claude",
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
        installOrigin: "sentinel",
        isExternal: false,
        name: "example",
        preview: "# Example",
        scope: "global",
        skillFile: "/tmp/codex-home/skills/example/SKILL.md",
        sourceKind: "codex",
        target: "codex",
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
          copilot: false,
          cursor: false,
          opencode: false,
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
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example/SKILL.md`,
            sourceKind: "claude",
            target: "claude",
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
          copilot: false,
          cursor: false,
          opencode: false,
          sentinel: false,
        },
        name: "example",
      }),
    ]);
  });

  it("keeps installed targets true across multiple local harnesses for the same skill", async () => {
    getSkillSnapshot.mockImplementationOnce(
      async ({ workspaceRoot, globalBase }) => ({
        revision: 2,
        skillRoots: [
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example`,
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example`,
        ],
        skills: [
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example`,
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.sentinel/skills/example/SKILL.md`,
            sourceKind: "sentinel",
            target: "sentinel",
          },
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example`,
            installOrigin: "external",
            isExternal: true,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.claude/skills/example/SKILL.md`,
            sourceKind: "claude",
            target: "claude",
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
          copilot: false,
          cursor: false,
          opencode: false,
          sentinel: true,
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
      scope: "global",
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
      scope: "global",
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
      scope: "workspace",
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
      scope: "workspace",
      target: "sentinel",
    });
  });

  it("installs curated skills into Copilot personal skills directories", async () => {
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
        target: "copilot",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/custom-home",
      installSteps: registryEntry.installSteps,
      name: "example",
      scope: "global",
      target: "copilot",
    });
    expect(result.directory).toBe("/tmp/custom-home/.copilot/skills/example");
  });

  it("installs curated skills into Copilot workspace skill directories", async () => {
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
        target: "copilot",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      installSteps: registryEntry.installSteps,
      name: "example",
      scope: "workspace",
      target: "copilot",
    });
    expect(result.directory).toBe("/tmp/workspace/.github/skills/example");
  });

  it("installs curated skills into Cursor workspace skill directories", async () => {
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
        target: "cursor",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      installSteps: registryEntry.installSteps,
      name: "example",
      scope: "workspace",
      target: "cursor",
    });
    expect(result.directory).toBe("/tmp/workspace/.cursor/skills/example");
  });

  it("installs curated skills into OpenCode global skill directories", async () => {
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
        target: "opencode",
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/custom-home",
      installSteps: registryEntry.installSteps,
      name: "example",
      scope: "global",
      target: "opencode",
    });
    expect(result.directory).toBe(
      "/tmp/custom-home/.config/opencode/skills/example",
    );
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

  it("loads Cursor-targeted skills using the Cursor lookup target", async () => {
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
        target: "cursor",
      },
    });

    expect(loadSkillByName).toHaveBeenCalledWith({
      globalBase: "/tmp/custom-home",
      name: "example",
      target: "cursor",
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
      scope: "workspace",
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
      scope: "workspace",
      target: "claude",
    });
    expect(result.directory).toBe("/tmp/workspace/.claude/skills/example");
  });

  it("marks curated skills as installed in Copilot independently from the other runtimes", async () => {
    getSkillSnapshot.mockImplementationOnce(
      async ({ workspaceRoot, globalBase }) => ({
        revision: 2,
        skillRoots: [
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.github/skills/example`,
        ],
        skills: [
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.github/skills/example`,
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.github/skills/example/SKILL.md`,
            sourceKind: "copilot",
            target: "copilot",
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
          claude: false,
          codex: false,
          copilot: true,
          cursor: false,
          opencode: false,
          sentinel: false,
        },
        name: "example",
      }),
    ]);
  });

  it("marks curated skills as installed in Cursor and OpenCode independently", async () => {
    getSkillSnapshot.mockImplementationOnce(
      async ({ workspaceRoot, globalBase }) => ({
        revision: 2,
        skillRoots: [
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.cursor/skills/example`,
          `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.opencode/skills/example`,
        ],
        skills: [
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.cursor/skills/example`,
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.cursor/skills/example/SKILL.md`,
            sourceKind: "cursor",
            target: "cursor",
          },
          {
            description: "Helpful skill",
            directory: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.opencode/skills/example`,
            installOrigin: "sentinel",
            isExternal: false,
            name: "example",
            preview: "# Example",
            scope: workspaceRoot ? "workspace" : "global",
            skillFile: `${workspaceRoot ?? globalBase ?? "/tmp/home"}/.opencode/skills/example/SKILL.md`,
            sourceKind: "opencode",
            target: "opencode",
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
          claude: false,
          codex: false,
          copilot: false,
          cursor: true,
          opencode: true,
          sentinel: false,
        },
        name: "example",
      }),
    ]);
  });
});
