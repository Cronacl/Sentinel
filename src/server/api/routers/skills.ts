import os from "node:os";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  discoverCodexSkills,
  getSkillSnapshot,
  loadSkillByName,
} from "@/lib/skills";
import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import {
  executeInstallSteps,
  resolveCodexHome,
  uninstallSkill,
} from "@/lib/skills/install";
import {
  buildInstallSteps,
  findRegistrySkill,
  SKILL_REGISTRY,
} from "@/lib/skills/registry";
import {
  customSkillInstallFormSchema,
  skillInstallTargetSchema,
  skillNameSchema,
  skillScopeSchema,
} from "@/schemas/skill-install.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedWorkspaceOrThrow } from "./workspace-thread-helpers";

function resolveGlobalBase(user: { skillsBasePath?: string | null }) {
  return user.skillsBasePath?.trim() || null;
}

function resolveDestRoot(
  user: { skillsBasePath?: string | null },
  scope: "global" | "workspace",
  workspaceRootPath: string | null,
  target: "sentinel" | "codex" | "claude" | "copilot",
) {
  if (target === "codex") {
    if (scope === "workspace") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Codex skills can only be installed globally.",
      });
    }

    return resolveCodexHome();
  }

  if (scope === "workspace") {
    if (!workspaceRootPath) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Select a workspace before using workspace-scoped skills.",
      });
    }

    return workspaceRootPath;
  }
  return user.skillsBasePath?.trim() || os.homedir();
}

function parseInstallInstructions(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function findCodexInstalledSkill(name: string) {
  const codex = getCodexAppServerManager();
  const response = await codex.listSkills().catch(() => null);
  const skills = Array.isArray(response?.skills) ? response.skills : [];
  const normalizedName = name.trim().toLowerCase();
  return (
    skills.find(
      (skill) => skill.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

async function buildCodexSkillList() {
  const codexHome = resolveCodexHome();
  return await discoverCodexSkills({
    globalBase: codexHome,
  });
}

export const skillsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          workspaceId: z.string().trim().min(1).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const workspaceRoot = input?.workspaceId
        ? (
            await getOwnedWorkspaceOrThrow(ctx, input.workspaceId)
          ).rootPath?.trim() || null
        : ctx.workspace?.rootPath?.trim() || null;

      const localSnapshot = await getSkillSnapshot({
        workspaceRoot,
        globalBase: resolveGlobalBase(ctx.user),
      });

      const codexSkills = await buildCodexSkillList().catch(() => []);

      return {
        ...localSnapshot,
        skills: [...localSnapshot.skills, ...codexSkills],
      };
    }),

  get: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        target: skillInstallTargetSchema.default("sentinel"),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.target === "codex") {
        return await loadSkillByName({
          globalBase: resolveCodexHome(),
          name: input.name,
          target: "codex",
          workspaceRoot: null,
        });
      }

      return await loadSkillByName({
        name: input.name,
        target: input.target,
        workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
        globalBase: resolveGlobalBase(ctx.user),
      });
    }),

  registry: protectedProcedure.query(async ({ ctx }) => {
    const snapshot = await getSkillSnapshot({
      workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
      globalBase: resolveGlobalBase(ctx.user),
    }).catch(() => ({
      revision: 0,
      skillRoots: [] as string[],
      skills: [],
      updatedAt: Date.now(),
    }));

    const installedSentinelNames = new Set(
      snapshot.skills
        .filter((skill) => skill.target === "sentinel")
        .map((s) => s.name.trim().toLowerCase()),
    );
    const installedClaudeNames = new Set(
      snapshot.skills
        .filter((skill) => skill.target === "claude")
        .map((s) => s.name.trim().toLowerCase()),
    );
    const installedCopilotNames = new Set(
      snapshot.skills
        .filter((skill) => skill.target === "copilot")
        .map((s) => s.name.trim().toLowerCase()),
    );
    const installedCodexNames = new Set(
      (await buildCodexSkillList().catch(() => [])).map((skill) =>
        skill.name.trim().toLowerCase(),
      ),
    );

    return SKILL_REGISTRY.map((entry) => ({
      displayName: entry.displayName,
      name: entry.name,
      repoUrl: entry.repoUrl,
      description: entry.description,
      installedTargets: {
        claude: installedClaudeNames.has(entry.name.trim().toLowerCase()),
        codex: installedCodexNames.has(entry.name.trim().toLowerCase()),
        copilot: installedCopilotNames.has(entry.name.trim().toLowerCase()),
        sentinel: installedSentinelNames.has(entry.name.trim().toLowerCase()),
      },
    }));
  }),

  install: protectedProcedure
    .input(
      z.object({
        name: skillNameSchema,
        scope: skillScopeSchema.default("global"),
        target: skillInstallTargetSchema.default("sentinel"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const registrySkill = findRegistrySkill(input.name);
      if (!registrySkill) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown curated skill "${input.name}".`,
        });
      }

      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
      );

      const result = await executeInstallSteps({
        name: registrySkill.name,
        installSteps: registrySkill.installSteps,
        destRoot,
        scope: input.scope,
        target: input.target,
      });

      if (input.target === "codex") {
        const codexSkill = await findCodexInstalledSkill(registrySkill.name);
        if (codexSkill) {
          await getCodexAppServerManager().writeSkillConfig(
            codexSkill.id,
            true,
          );
        }
      }

      return result;
    }),

  installCustom: protectedProcedure
    .input(customSkillInstallFormSchema)
    .mutation(async ({ ctx, input }) => {
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
      );

      const installSteps = parseInstallInstructions(input.installInstructions);

      const result = await executeInstallSteps({
        name: input.name,
        installSteps:
          installSteps.length > 0
            ? installSteps
            : buildInstallSteps(input.repoUrl, input.skillPath, input.ref),
        destRoot,
        scope: input.scope,
        target: input.target,
      });

      if (input.target === "codex") {
        const codexSkill = await findCodexInstalledSkill(input.name);
        if (codexSkill) {
          await getCodexAppServerManager().writeSkillConfig(
            codexSkill.id,
            true,
          );
        }
      }

      return result;
    }),

  uninstall: protectedProcedure
    .input(
      z.object({
        name: skillNameSchema,
        scope: skillScopeSchema.default("global"),
        target: skillInstallTargetSchema.default("sentinel"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
      );

      const installedCodexSkill =
        input.target === "codex"
          ? await findCodexInstalledSkill(input.name)
          : null;

      const result = await uninstallSkill({
        name: input.name,
        destRoot,
        scope: input.scope,
        target: input.target,
      });

      if (installedCodexSkill) {
        await getCodexAppServerManager().writeSkillConfig(
          installedCodexSkill.id,
          false,
        );
      }

      return result;
    }),
});
