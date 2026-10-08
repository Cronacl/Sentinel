import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  engineAuthResponseSchema,
  engineInstanceIdSchema,
  type EngineAuthMethod,
} from "@/lib/ai/chat/engines/contract";
import {
  EngineAuthFlowError,
  type EngineAuthController,
} from "@/lib/ai/chat/engines/platform/auth/controller";
import { getEngineAuthFlowStore } from "@/lib/ai/chat/engines/platform/auth/flow-store";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// api.engines.auth: sign-in flows per instance (browser, device code,
// terminal command, credentials), run by the driver's auth controller in
// the flow store (platform/auth/flow-store.ts). Every procedure acts on the
// caller's own instances only; flows are keyed by user. `terminal` is what
// the client can do: true only in the desktop app, which can embed a
// terminal (browsers get a command to copy instead).

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });
const flowIdSchema = z.string().trim().min(1).max(128);
const clientInputSchema = {
  terminal: z.boolean().optional(),
};

export type EngineAuthMethodsResult = {
  /** The driver can sign out from Sentinel. */
  canLogout: boolean;
  /** Shown when confirming a sign-out (see EngineAuthController). */
  logoutNotice: string | null;
  methods: EngineAuthMethod[];
  /** False for engines Sentinel cannot sign in (the built-in one). */
  supported: boolean;
};

async function resolveAuthTarget(userId: string, instanceId: string) {
  const lookup = await getEngineInstanceRegistry().get(userId, instanceId);
  if (!lookup) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Engine instance "${instanceId}" does not exist.`,
    });
  }
  if (lookup.status === "unavailable") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: lookup.instance.message,
    });
  }

  // Loaded on first use: the driver list pulls in every engine module.
  const { getEngineDriver } =
    await import("@/lib/ai/chat/engines/platform/drivers");
  const controller = getEngineDriver(lookup.instance.driver)?.auth ?? null;
  return { controller, instance: lookup.instance };
}

function requireController(controller: EngineAuthController | null) {
  if (!controller) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This engine has no sign-in in Sentinel.",
    });
  }
  return controller;
}

function toTRPCError(error: unknown): never {
  if (error instanceof EngineAuthFlowError) {
    throw new TRPCError({
      cause: error,
      code:
        error.code === "not-found"
          ? "NOT_FOUND"
          : error.code === "conflict"
            ? "CONFLICT"
            : "BAD_REQUEST",
      message: error.message,
    });
  }
  throw error;
}

export const engineAuthRouter = createTRPCRouter({
  /** The sign-in methods an instance offers now. */
  methods: protectedProcedure
    .input(instanceInputSchema.extend(clientInputSchema))
    .query(async ({ ctx, input }): Promise<EngineAuthMethodsResult> => {
      const { controller, instance } = await resolveAuthTarget(
        ctx.session.user.id,
        input.instanceId,
      );
      if (!controller) {
        return {
          canLogout: false,
          logoutNotice: null,
          methods: [],
          supported: false,
        };
      }

      return {
        canLogout: Boolean(controller.logout),
        logoutNotice: controller.logout
          ? (controller.logoutNotice?.(instance) ?? null)
          : null,
        methods: await controller.methods(instance, {
          terminal: input.terminal === true,
        }),
        supported: true,
      };
    }),

  /** The instance's current or last flow (idle when there is none). */
  status: protectedProcedure
    .input(instanceInputSchema)
    .query(({ ctx, input }) =>
      getEngineAuthFlowStore().get(ctx.session.user.id, input.instanceId),
    ),

  /**
   * Starts a sign-in (ending one still running for the instance) and
   * answers once the user has something to do or it finished.
   */
  start: protectedProcedure
    .input(
      instanceInputSchema.extend({
        ...clientInputSchema,
        methodId: z.string().trim().min(1).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { controller, instance } = await resolveAuthTarget(
        userId,
        input.instanceId,
      );
      return await getEngineAuthFlowStore().start({
        client: { terminal: input.terminal === true },
        controller: requireController(controller),
        instance,
        methodId: input.methodId ?? null,
        purpose: "login",
        userId,
      });
    }),

  /** Answers the flow's current step (credentials, terminal finished). */
  respond: protectedProcedure
    .input(
      instanceInputSchema.extend({
        flowId: flowIdSchema,
        interactionId: z.string().trim().min(1).max(160),
        response: engineAuthResponseSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await getEngineAuthFlowStore().respond({
          flowId: input.flowId,
          instanceId: input.instanceId,
          interactionId: input.interactionId,
          response: input.response,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  cancel: protectedProcedure
    .input(instanceInputSchema.extend({ flowId: flowIdSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await getEngineAuthFlowStore().cancel({
          flowId: input.flowId,
          instanceId: input.instanceId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  /** Signs the instance out (a flow too: some engines ask in a terminal). */
  logout: protectedProcedure
    .input(instanceInputSchema.extend(clientInputSchema))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { controller, instance } = await resolveAuthTarget(
        userId,
        input.instanceId,
      );
      return await getEngineAuthFlowStore().start({
        client: { terminal: input.terminal === true },
        controller: requireController(controller),
        instance,
        purpose: "logout",
        userId,
      });
    }),
});
