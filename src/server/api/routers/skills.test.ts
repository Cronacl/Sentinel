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
const executeInstallSteps = mock(async ({ name, destRoot, installSteps }) => ({
  directory: `${destRoot}/.sentinel/skills/${name}`,
  installSteps,
  name,
}));
const resolveCodexHome = mock(() => "/tmp/codex-home");
const uninstallSkill = mock(async ({ name, destRoot }) => ({
  directory: `${destRoot}/.sentinel/skills/${name}`,
  name,
}));
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
          codex: true,
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
      },
    });

    expect(executeInstallSteps).toHaveBeenCalledWith({
      destRoot: "/tmp/custom-home",
      installSteps: registryEntry.installSteps,
      name: "example",
    });
    expect(result.directory).toBe("/tmp/custom-home/.sentinel/skills/example");
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
      directory: "/tmp/codex-home/.sentinel/skills/example",
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
      },
    });

    expect(uninstallSkill).toHaveBeenCalledWith({
      destRoot: "/tmp/workspace",
      name: "example",
    });
  });
});
