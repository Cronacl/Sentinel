import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getCodexAppServerManager } from "@/lib/ai/chat/engines/codex-app-server";
import { engineInstanceIdSchema } from "@/lib/ai/chat/engines/contract";
import { EngineInstanceUnavailableError } from "@/lib/ai/chat/engines/platform/errors";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import { getCodexThreadState } from "@/lib/ai/chat/engines/types";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { getOwnedThreadOrThrow } from "../workspace-thread-helpers";

// api.engines.codex: Codex-only actions on a Codex app-server. Thread
// actions run on the app-server of the instance the thread is bound to;
// account, config, skill and MCP actions take the instance to act on
// (default: the default Codex instance).

type ThreadContext = Parameters<typeof getOwnedThreadOrThrow>[0];

const instanceInputSchema = z.object({
  instanceId: engineInstanceIdSchema.optional(),
});
const threadInputSchema = z.object({ threadId: z.string() });

async function resolveCodexInstance(
  userId: string,
  instanceId: string | null | undefined,
) {
  try {
    return await getEngineInstanceRegistry().resolve(userId, {
      driver: "codex",
      instanceId: instanceId === "codex" ? null : (instanceId ?? null),
    });
  } catch (error) {
    if (error instanceof EngineInstanceUnavailableError) {
      throw new TRPCError({
        cause: error,
        code: "PRECONDITION_FAILED",
        message: error.message,
      });
    }
    throw error;
  }
}

async function getInstanceManager(
  userId: string,
  instanceId: string | null | undefined,
) {
  return getCodexAppServerManager(
    await resolveCodexInstance(userId, instanceId),
  );
}

/** The thread's Codex thread id and the app-server of its instance. */
async function resolveCodexThread(ctx: ThreadContext, threadId: string) {
  const thread = await getOwnedThreadOrThrow(ctx, threadId);
  const state = getCodexThreadState(thread.chatEngineState);
  if (!state?.codexThreadId) {
    throw new Error("This thread does not have an associated Codex thread.");
  }

  return {
    codex: await getInstanceManager(
      ctx.session.user.id,
      thread.chatEngine === "codex" ? thread.chatEngineInstanceId : null,
    ),
    codexThreadId: state.codexThreadId,
  };
}

export const engineCodexRouter = createTRPCRouter({
  review: protectedProcedure
    .input(threadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      return codex.startReview(codexThreadId);
    }),

  // Codex 0.156+ removed count-based rollback; this pages the turn history
  // and reverts before the `count`-th newest turn.
  rollback: protectedProcedure
    .input(threadInputSchema.extend({ count: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      return codex.revertThreadTurns(codexThreadId, input.count);
    }),

  compact: protectedProcedure
    .input(threadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      return codex.compactThread(codexThreadId);
    }),

  fork: protectedProcedure
    .input(threadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      return codex.forkThread(codexThreadId);
    }),

  archive: protectedProcedure
    .input(threadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      await codex.archiveThread(codexThreadId);
    }),

  unarchive: protectedProcedure
    .input(threadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { codex, codexThreadId } = await resolveCodexThread(
        ctx,
        input.threadId,
      );
      await codex.unarchiveThread(codexThreadId);
    }),

  login: protectedProcedure
    .input(
      z.intersection(
        instanceInputSchema,
        z.discriminatedUnion("method", [
          z.object({ apiKey: z.string().min(1), method: z.literal("apiKey") }),
          z.object({ method: z.literal("chatgpt") }),
          z.object({ method: z.literal("chatgptDeviceCode") }),
        ]),
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input.instanceId,
      );
      return codex.startLogin(
        input.method === "apiKey"
          ? { apiKey: input.apiKey, type: "apiKey" }
          : { type: input.method },
      );
    }),

  cancelLogin: protectedProcedure
    .input(instanceInputSchema.extend({ loginId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input.instanceId,
      );
      return codex.cancelLogin(input.loginId);
    }),

  logout: protectedProcedure
    .input(instanceInputSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      await codex.logout();
    }),

  rateLimits: protectedProcedure
    .input(instanceInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      return codex.readRateLimits();
    }),

  config: protectedProcedure
    .input(instanceInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      return codex.readConfig();
    }),

  writeConfig: protectedProcedure
    // zod 4 requires the key for z.unknown(); a missing value stays valid.
    .input(
      instanceInputSchema.extend({
        key: z.string(),
        value: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input.instanceId,
      );
      return codex.writeConfigValue(input.key, input.value);
    }),

  skills: protectedProcedure
    .input(instanceInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      return codex.listSkills();
    }),

  writeSkillConfig: protectedProcedure
    .input(
      instanceInputSchema.extend({
        enabled: z.boolean(),
        skillId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input.instanceId,
      );
      return codex.writeSkillConfig(input.skillId, input.enabled);
    }),

  mcpServers: protectedProcedure
    .input(instanceInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      return codex.listMcpServerStatus();
    }),

  // `config/mcpServer/reload` reloads every MCP server; `serverName` is kept
  // so existing callers stay valid.
  reloadMcpServer: protectedProcedure
    .input(instanceInputSchema.extend({ serverName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input.instanceId,
      );
      await codex.reloadMcpServers();
    }),

  experimentalFeatures: protectedProcedure
    .input(instanceInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const codex = await getInstanceManager(
        ctx.session.user.id,
        input?.instanceId,
      );
      return codex.listExperimentalFeatures();
    }),
});
