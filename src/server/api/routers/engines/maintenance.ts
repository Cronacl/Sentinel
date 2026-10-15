import { on } from "node:events";

import { tracked, TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  engineInstanceIdSchema,
  type EngineEvent,
} from "@/lib/ai/chat/engines/contract";
import {
  ENGINE_EVENT_NAME,
  getEngineEventEmitter,
  getEngineEventVersion,
} from "@/lib/ai/chat/engines/platform/events";
import {
  EngineMaintenanceError,
  getEngineMaintenanceService,
} from "@/lib/ai/chat/engines/platform/maintenance/service";
import { getEngineManifestService } from "@/lib/ai/chat/engines/platform/manifest/service";
import { getEngineNetworkSettingsStore } from "@/lib/ai/chat/engines/platform/network-settings";
import { getEngineSnapshotService } from "@/lib/ai/chat/engines/platform/snapshot-service";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// api.engines.maintenance: version advisories, CLI installs and updates per
// instance, and the engine network settings (remote manifest, update
// checks). Installs and updates only run on an explicit user action: the
// request carries the command the user confirmed, and the service refuses
// it when the command it would run has changed since.

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });
const commandSchema = z.string().trim().min(1).max(4_096);

const MAINTENANCE_ERROR_CODES = {
  busy: "CONFLICT",
  changed: "CONFLICT",
  not_found: "NOT_FOUND",
  unavailable: "PRECONDITION_FAILED",
} as const;

async function run<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof EngineMaintenanceError) {
      throw new TRPCError({
        code: MAINTENANCE_ERROR_CODES[error.code],
        message: error.message,
      });
    }
    throw error;
  }
}

async function readSettings() {
  const [settings, manifest] = await Promise.all([
    getEngineNetworkSettingsStore().read(),
    getEngineManifestService().status(),
  ]);
  return { ...settings, manifest };
}

export const engineMaintenanceRouter = createTRPCRouter({
  /** What can be installed or updated for the instance, and its state. */
  status: protectedProcedure
    .input(instanceInputSchema)
    .query(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().status(
          ctx.session.user.id,
          input.instanceId,
        ),
      ),
    ),

  /** Looks the latest release up now and re-probes the instance. */
  checkForUpdate: protectedProcedure
    .input(instanceInputSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().checkForUpdate(
          ctx.session.user.id,
          input.instanceId,
        ),
      ),
    ),

  /** Runs the update command the user confirmed (`expectedCommand`). */
  update: protectedProcedure
    .input(instanceInputSchema.extend({ expectedCommand: commandSchema }))
    .mutation(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().update(
          ctx.session.user.id,
          input.instanceId,
          { expectedCommand: input.expectedCommand },
        ),
      ),
    ),

  /** Installs the missing CLI with the option and command the user confirmed. */
  install: protectedProcedure
    .input(
      instanceInputSchema.extend({
        expectedCommand: commandSchema.nullable(),
        optionId: z.string().trim().min(1).max(64),
      }),
    )
    .mutation(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().install(
          ctx.session.user.id,
          input.instanceId,
          {
            expectedCommand: input.expectedCommand,
            optionId: input.optionId,
          },
        ),
      ),
    ),

  /** Stops the instance's running install or update. */
  cancel: protectedProcedure
    .input(instanceInputSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().cancel(
          ctx.session.user.id,
          input.instanceId,
        ),
      ),
    ),

  cancelInstall: protectedProcedure
    .input(instanceInputSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        getEngineMaintenanceService().cancel(
          ctx.session.user.id,
          input.instanceId,
        ),
      ),
    ),

  /**
   * Install and update progress of one instance over SSE: its current
   * state first, then each change. (engines.onEvents carries the same
   * events for every instance.)
   */
  onProgress: protectedProcedure
    .input(instanceInputSchema)
    .subscription(async function* ({ ctx, input, signal }) {
      const events = on(getEngineEventEmitter(), ENGINE_EVENT_NAME, {
        signal,
      });
      try {
        const status = await getEngineMaintenanceService().status(
          ctx.session.user.id,
          input.instanceId,
        );
        const version = getEngineEventVersion();
        yield tracked(String(version), {
          installState: status.installState ?? undefined,
          instanceId: input.instanceId,
          type: "maintenance",
          updateState: status.updateState ?? undefined,
          version,
        } satisfies EngineEvent);

        for await (const [event] of events) {
          const engineEvent = event as EngineEvent;
          if (
            engineEvent.type === "maintenance" &&
            engineEvent.instanceId === input.instanceId
          ) {
            yield tracked(String(engineEvent.version), engineEvent);
          }
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        if (error instanceof EngineMaintenanceError) {
          throw new TRPCError({
            code: MAINTENANCE_ERROR_CODES[error.code],
            message: error.message,
          });
        }
        throw error;
      } finally {
        await events.return?.();
      }
    }),

  /** The engine network settings and the manifest in effect. */
  settings: protectedProcedure.query(() => readSettings()),

  updateSettings: protectedProcedure
    .input(
      z
        .object({
          remoteManifest: z.boolean().optional(),
          updateChecks: z.boolean().optional(),
        })
        .refine(
          (value) =>
            value.remoteManifest !== undefined ||
            value.updateChecks !== undefined,
          { message: "Nothing to update." },
        ),
    )
    .mutation(async ({ input }) => {
      const settings = await getEngineNetworkSettingsStore().update(input);
      if (input.remoteManifest && settings.remoteManifest.enabled) {
        await getEngineManifestService().refresh({ force: true });
      }
      // Snapshots pick the change up on their next probe.
      getEngineSnapshotService().invalidate();
      return await readSettings();
    }),

  /** Fetches the manifest from main now (when remote refresh is on). */
  refreshManifest: protectedProcedure.mutation(async () => {
    await getEngineManifestService().refresh({ force: true });
    getEngineSnapshotService().invalidate();
    return await readSettings();
  }),
});
