import os from "node:os";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getSkillSnapshot, loadSkillByName } from "@/lib/skills";
import { executeInstallSteps, uninstallSkill } from "@/lib/skills/install";
import {
  buildInstallSteps,
  findRegistrySkill,
  SKILL_REGISTRY,
} from "@/lib/skills/registry";
import {
  customSkillInstallFormSchema,
  skillNameSchema,
  skillScopeSchema,
} from "@/schemas/skill-install.schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

function resolveGlobalBase(user: { skillsBasePath?: string | null }) {
  return user.skillsBasePath?.trim() || null;
}

function resolveDestRoot(
  user: { skillsBasePath?: string | null },
  scope: "global" | "workspace",
  workspaceRootPath: string | null,
) {
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

export const skillsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getSkillSnapshot({
      workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
      globalBase: resolveGlobalBase(ctx.user),
    });
  }),

  get: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await loadSkillByName({
        name: input.name,
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

    const installedNames = new Set(
      snapshot.skills.map((s) => s.name.trim().toLowerCase()),
    );

    return SKILL_REGISTRY.map((entry) => ({
      displayName: entry.displayName,
      name: entry.name,
      repoUrl: entry.repoUrl,
      description: entry.description,
      installed: installedNames.has(entry.name.trim().toLowerCase()),
    }));
  }),

  install: protectedProcedure
    .input(
      z.object({
        name: skillNameSchema,
        scope: skillScopeSchema.default("global"),
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
      );

      return await executeInstallSteps({
        name: registrySkill.name,
        installSteps: registrySkill.installSteps,
        destRoot,
      });
    }),

  installCustom: protectedProcedure
    .input(customSkillInstallFormSchema)
    .mutation(async ({ ctx, input }) => {
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
      );

      const installSteps = parseInstallInstructions(input.installInstructions);

      return await executeInstallSteps({
        name: input.name,
        installSteps:
          installSteps.length > 0
            ? installSteps
            : buildInstallSteps(input.repoUrl, input.skillPath, input.ref),
        destRoot,
      });
    }),

  uninstall: protectedProcedure
    .input(
      z.object({
        name: skillNameSchema,
        scope: skillScopeSchema.default("global"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
      );

      return await uninstallSkill({
        name: input.name,
        destRoot,
      });
    }),
});
