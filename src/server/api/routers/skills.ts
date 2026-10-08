import os from "node:os";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  discoverCodexSkills,
  getSkillSnapshot,
  loadSkillByName,
} from "@/lib/skills";
import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import { engineInstanceIdSchema } from "@/lib/ai/chat/engines/contract";
import { getInstanceHomeDirectory } from "@/lib/ai/chat/engines/platform/instance-homes";
import {
  executeInstallSteps,
  resolveCodexHome,
  uninstallSkill,
} from "@/lib/skills/install";
import {
  getGlobalInstallDirectory,
  resolveSkillInstanceContext,
} from "@/lib/skills/instance-skills";
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

/**
 * Where skills live for an engine instance (its driver's default without
 * one): Codex skills in the instance's CODEX_HOME, toggled through its
 * app-server; Claude's and Copilot's global skills under their
 * CLAUDE_CONFIG_DIR or COPILOT_HOME when the instance sets one.
 */
async function resolveSkillContext(userId: string, instanceId?: string | null) {
  const context = await resolveSkillInstanceContext(userId, instanceId);
  const codexInstance = context.instances.codex;
  return {
    ...context,
    codex: getCodexAppServerManager(codexInstance),
    home:
      (codexInstance ? getInstanceHomeDirectory(codexInstance) : null) ??
      resolveCodexHome(),
  };
}

type CodexSkillContext = Awaited<ReturnType<typeof resolveSkillContext>>;

const instanceIdInputSchema = engineInstanceIdSchema.optional();

/** Skill folders moved by instance homes (nothing when none sets one). */
function instanceSkillDirectories(
  globalDirectories: CodexSkillContext["globalDirectories"],
) {
  return Object.keys(globalDirectories).length > 0 ? { globalDirectories } : {};
}

/** The instance's own global skills folder for `target`, when it has one. */
function instanceInstallTarget(
  context: CodexSkillContext,
  input: { scope: "global" | "workspace"; target: string },
) {
  const globalSkillsDirectory =
    input.scope === "global"
      ? getGlobalInstallDirectory(context, input.target)
      : null;
  return globalSkillsDirectory ? { globalSkillsDirectory } : {};
}

function resolveDestRoot(
  user: { skillsBasePath?: string | null },
  scope: "global" | "workspace",
  workspaceRootPath: string | null,
  target: "sentinel" | "codex" | "claude" | "copilot" | "cursor" | "opencode",
  codexHome: string,
) {
  if (target === "codex") {
    if (scope === "workspace") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Codex skills can only be installed globally.",
      });
    }

    return codexHome;
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

async function findCodexInstalledSkill(
  codex: CodexSkillContext["codex"],
  name: string,
) {
  const response = await codex.listSkills().catch(() => null);
  const skills = Array.isArray(response?.skills) ? response.skills : [];
  const normalizedName = name.trim().toLowerCase();
  return (
    skills.find(
      (skill) => skill.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

async function buildCodexSkillList(codexHome: string) {
  return await discoverCodexSkills({
    globalBase: codexHome,
  });
}

export const skillsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          /** The composer's engine instance: its home's skills are listed. */
          instanceId: instanceIdInputSchema,
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
      const { globalDirectories, home: codexHome } = await resolveSkillContext(
        ctx.user.id,
        input?.instanceId,
      );

      const localSnapshot = await getSkillSnapshot({
        workspaceRoot,
        globalBase: resolveGlobalBase(ctx.user),
        ...instanceSkillDirectories(globalDirectories),
      });

      const codexSkills = await buildCodexSkillList(codexHome).catch(() => []);

      return {
        ...localSnapshot,
        skills: [...localSnapshot.skills, ...codexSkills],
      };
    }),

  get: protectedProcedure
    .input(
      z.object({
        instanceId: instanceIdInputSchema,
        name: z.string().trim().min(1),
        target: skillInstallTargetSchema.default("sentinel"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const context = await resolveSkillContext(ctx.user.id, input.instanceId);
      if (input.target === "codex") {
        return await loadSkillByName({
          globalBase: context.home,
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
        ...instanceSkillDirectories(context.globalDirectories),
      });
    }),

  registry: protectedProcedure.query(async ({ ctx }) => {
    const { globalDirectories, home: codexHome } = await resolveSkillContext(
      ctx.user.id,
    );
    const snapshot = await getSkillSnapshot({
      workspaceRoot: ctx.workspace?.rootPath?.trim() || null,
      globalBase: resolveGlobalBase(ctx.user),
      ...instanceSkillDirectories(globalDirectories),
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
    const installedCursorNames = new Set(
      snapshot.skills
        .filter((skill) => skill.target === "cursor")
        .map((s) => s.name.trim().toLowerCase()),
    );
    const installedOpenCodeNames = new Set(
      snapshot.skills
        .filter((skill) => skill.target === "opencode")
        .map((s) => s.name.trim().toLowerCase()),
    );
    const installedCodexNames = new Set(
      (await buildCodexSkillList(codexHome).catch(() => [])).map((skill) =>
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
        cursor: installedCursorNames.has(entry.name.trim().toLowerCase()),
        opencode: installedOpenCodeNames.has(entry.name.trim().toLowerCase()),
        sentinel: installedSentinelNames.has(entry.name.trim().toLowerCase()),
      },
    }));
  }),

  install: protectedProcedure
    .input(
      z.object({
        instanceId: instanceIdInputSchema,
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

      const codexContext = await resolveSkillContext(
        ctx.user.id,
        input.instanceId,
      );
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
        codexContext.home,
      );

      const result = await executeInstallSteps({
        name: registrySkill.name,
        installSteps: registrySkill.installSteps,
        destRoot,
        ...instanceInstallTarget(codexContext, input),
        scope: input.scope,
        target: input.target,
      });

      if (input.target === "codex") {
        const codexSkill = await findCodexInstalledSkill(
          codexContext.codex,
          registrySkill.name,
        );
        if (codexSkill) {
          await codexContext.codex.writeSkillConfig(codexSkill.id, true);
        }
      }

      return result;
    }),

  installCustom: protectedProcedure
    .input(customSkillInstallFormSchema)
    .mutation(async ({ ctx, input }) => {
      const codexContext = await resolveSkillContext(ctx.user.id);
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
        codexContext.home,
      );

      const installSteps = parseInstallInstructions(input.installInstructions);

      const result = await executeInstallSteps({
        name: input.name,
        installSteps:
          installSteps.length > 0
            ? installSteps
            : buildInstallSteps(input.repoUrl, input.skillPath, input.ref),
        destRoot,
        ...instanceInstallTarget(codexContext, input),
        scope: input.scope,
        target: input.target,
      });

      if (input.target === "codex") {
        const codexSkill = await findCodexInstalledSkill(
          codexContext.codex,
          input.name,
        );
        if (codexSkill) {
          await codexContext.codex.writeSkillConfig(codexSkill.id, true);
        }
      }

      return result;
    }),

  uninstall: protectedProcedure
    .input(
      z.object({
        instanceId: instanceIdInputSchema,
        name: skillNameSchema,
        scope: skillScopeSchema.default("global"),
        target: skillInstallTargetSchema.default("sentinel"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const codexContext = await resolveSkillContext(
        ctx.user.id,
        input.instanceId,
      );
      const destRoot = resolveDestRoot(
        ctx.user,
        input.scope,
        ctx.workspace?.rootPath?.trim() || null,
        input.target,
        codexContext.home,
      );

      const installedCodexSkill =
        input.target === "codex"
          ? await findCodexInstalledSkill(codexContext.codex, input.name)
          : null;

      const result = await uninstallSkill({
        name: input.name,
        destRoot,
        ...instanceInstallTarget(codexContext, input),
        scope: input.scope,
        target: input.target,
      });

      if (installedCodexSkill) {
        await codexContext.codex.writeSkillConfig(
          installedCodexSkill.id,
          false,
        );
      }

      return result;
    }),
});
