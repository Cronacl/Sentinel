import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  isPickableEngineSnapshot,
  toComposerEngineModels,
  toComposerEngineOption,
  type ComposerEngineModel,
} from "@/lib/ai/chat/engines/composer-catalog";
import {
  driverKindSchema,
  engineInstanceIdSchema,
  type EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";
import { streamEngineEvents } from "@/lib/ai/chat/engines/platform/event-stream";
import { getEngineRefreshLoop } from "@/lib/ai/chat/engines/platform/refresh-loop";
import { getEngineSnapshotService } from "@/lib/ai/chat/engines/platform/snapshot-service";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { engineAcpRegistryRouter } from "./acp-registry";
import { engineAuthRouter } from "./auth";
import { engineCodexRouter } from "./codex";
import { engineInstancesRouter } from "./instances";
import { engineMaintenanceRouter } from "./maintenance";
import { listSentinelModels } from "./sentinel-models";

// api.engines: generic over every driver. Snapshots come from the platform
// snapshot service (platform/snapshot-service.ts); nothing here names an
// engine except the built-in one, whose models come from the provider
// catalog. Driver-specific procedures live in sub-routers (codex) and the
// platform services in theirs (instances, auth, maintenance, acpRegistry).

type ModelsContext = Parameters<typeof listSentinelModels>[0];

function isBuiltinSnapshot(snapshot: Pick<EngineSnapshot, "driver">) {
  return snapshot.driver === "sentinel";
}

async function modelsForSnapshot(
  ctx: ModelsContext,
  snapshot: EngineSnapshot,
): Promise<ComposerEngineModel[]> {
  return isBuiltinSnapshot(snapshot)
    ? await listSentinelModels(ctx)
    : toComposerEngineModels(snapshot);
}

export const enginesRouter = createTRPCRouter({
  /**
   * Every instance's snapshot without waiting on probes: cached, else the
   * last persisted one (stale), else `checking`; what is missing or expired
   * is probed in the background and pushed through onEvents. With
   * forceRefresh, waits for fresh probes of every instance.
   */
  snapshots: protectedProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const service = getEngineSnapshotService();
      return input?.forceRefresh
        ? await service.getAll(ctx.session.user.id, {
            forceRefresh: true,
            reason: "user",
          })
        : await service.peekAll(ctx.session.user.id);
    }),

  /** Probes one instance now (fully) and returns its new snapshot. */
  refresh: protectedProcedure
    .input(z.object({ instanceId: engineInstanceIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const snapshot = await getEngineSnapshotService().refresh(
        ctx.session.user.id,
        input.instanceId,
        "user",
      );
      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Engine instance "${input.instanceId}" does not exist.`,
        });
      }
      return snapshot;
    }),

  /**
   * One instance's models in the composer shape. `engine` alone means the
   * driver's default instance. An instance that does not exist has no
   * models (never another engine's).
   */
  models: protectedProcedure
    .input(
      z
        .object({
          engine: driverKindSchema.optional(),
          instanceId: engineInstanceIdSchema.optional(),
        })
        .refine((value) => value.engine || value.instanceId, {
          message: "An engine or an instance is required.",
        }),
    )
    .query(async ({ ctx, input }) => {
      const instanceId = input.instanceId ?? input.engine!;
      const snapshot = await getEngineSnapshotService().getSnapshot(
        ctx.session.user.id,
        instanceId,
      );
      if (
        !snapshot ||
        (input.engine !== undefined && snapshot.driver !== input.engine)
      ) {
        return [];
      }
      return await modelsForSnapshot(ctx, snapshot);
    }),

  /**
   * Everything the composer's engine and model pickers show, in one query:
   * the pickable instances and each one's models.
   */
  composerCatalog: protectedProcedure.query(async ({ ctx }) => {
    const snapshots = (
      await getEngineSnapshotService().getAll(ctx.session.user.id)
    ).filter(isPickableEngineSnapshot);
    const models = await Promise.all(
      snapshots.map(
        async (snapshot) =>
          [
            snapshot.instanceId,
            await modelsForSnapshot(ctx, snapshot),
          ] as const,
      ),
    );

    return {
      modelsByInstance: Object.fromEntries(models) as Record<
        string,
        ComposerEngineModel[]
      >,
      options: snapshots.map(toComposerEngineOption),
    };
  }),

  /**
   * Snapshot, auth and maintenance events over SSE: every current snapshot
   * first, then changes as they happen. While connected, snapshots are
   * re-probed in the background as they expire.
   */
  onEvents: protectedProcedure.subscription(async function* ({ ctx, signal }) {
    const userId = ctx.session.user.id;
    const service = getEngineSnapshotService();
    const release = getEngineRefreshLoop((id) => service.peekAll(id)).retain(
      userId,
    );

    try {
      for await (const event of streamEngineEvents({
        peekAll: () => service.peekAll(userId),
        signal,
      })) {
        yield tracked(String(event.version), event);
      }
    } finally {
      release();
    }
  }),

  instances: engineInstancesRouter,
  auth: engineAuthRouter,
  maintenance: engineMaintenanceRouter,
  acpRegistry: engineAcpRegistryRouter,
  codex: engineCodexRouter,
});
