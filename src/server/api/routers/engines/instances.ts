import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createEngineInstanceInputSchema,
  engineInstanceIdSchema,
  updateEngineInstanceInputSchema,
} from "@/lib/ai/chat/engines/contract";
import {
  EngineInstanceError,
  countEngineInstanceReferences,
} from "@/lib/ai/chat/engines/platform/errors";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// api.engines.instances: the user's engine instances (rows in
// engine_instance plus a synthesized default per driver). Summaries never
// carry secret values. The settings UI for adding and editing instances
// lands in P11; the procedures are complete here.

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });

const TRPC_CODES = {
  conflict: "CONFLICT",
  "in-use": "PRECONDITION_FAILED",
  invalid: "BAD_REQUEST",
  "not-found": "NOT_FOUND",
  unsupported: "BAD_REQUEST",
} as const satisfies Record<EngineInstanceError["code"], TRPCError["code"]>;

/** Registry rejections as tRPC errors; anything else is rethrown. */
export function toEngineInstanceTRPCError(error: unknown): unknown {
  if (!(error instanceof EngineInstanceError)) {
    return error;
  }

  const details = [
    ...(error.details.issues ?? []),
    ...(error.details.references
      ? [
          `Used by ${countEngineInstanceReferences(error.details.references)} thread(s), automation(s) or default selection.`,
        ]
      : []),
  ];

  return new TRPCError({
    cause: error,
    code: TRPC_CODES[error.code],
    message:
      details.length > 0
        ? `${error.message} ${details.join(" ")}`
        : error.message,
  });
}

async function withRegistryErrors<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw toEngineInstanceTRPCError(error);
  }
}

export const engineInstancesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) =>
    getEngineInstanceRegistry().listSummaries(ctx.session.user.id),
  ),

  create: protectedProcedure
    .input(createEngineInstanceInputSchema)
    .mutation(async ({ ctx, input }) =>
      withRegistryErrors(() =>
        getEngineInstanceRegistry().create(ctx.session.user.id, input),
      ),
    ),

  update: protectedProcedure
    .input(
      instanceInputSchema.extend({ patch: updateEngineInstanceInputSchema }),
    )
    .mutation(async ({ ctx, input }) =>
      withRegistryErrors(() =>
        getEngineInstanceRegistry().update(
          ctx.session.user.id,
          input.instanceId,
          input.patch,
        ),
      ),
    ),

  setEnabled: protectedProcedure
    .input(
      instanceInputSchema.extend({
        enabled: z.boolean(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      withRegistryErrors(() =>
        getEngineInstanceRegistry().setEnabled(
          ctx.session.user.id,
          input.instanceId,
          input.enabled,
          { force: input.force },
        ),
      ),
    ),

  remove: protectedProcedure
    .input(instanceInputSchema.extend({ force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) =>
      withRegistryErrors(() =>
        getEngineInstanceRegistry().remove(
          ctx.session.user.id,
          input.instanceId,
          { force: input.force },
        ),
      ),
    ),

  /** What still points at an instance (shown before removing it). */
  references: protectedProcedure
    .input(instanceInputSchema)
    .query(async ({ ctx, input }) => {
      const registry = getEngineInstanceRegistry();
      const lookup = await registry.get(ctx.session.user.id, input.instanceId);
      if (!lookup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Engine instance "${input.instanceId}" does not exist.`,
        });
      }
      return await registry.countReferences(ctx.session.user.id, {
        driver: lookup.instance.driver,
        instanceId: lookup.instance.id,
      });
    }),
});
