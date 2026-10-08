import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { engineInstanceIdSchema } from "@/lib/ai/chat/engines/contract";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import { getEngineSnapshotService } from "@/lib/ai/chat/engines/platform/snapshot-service";
import {
  createEngineUsageService,
  EngineUsageError,
  type EngineUsageService,
} from "@/lib/ai/chat/engines/platform/usage/service";
import {
  CursorKeychainUnavailableError,
  readCursorKeychainToken,
} from "@/lib/ai/chat/engines/usage/cursor-keychain";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

// api.engines.usage: plan usage limits per engine instance (the usage
// store in platform/usage). Snapshots carry the same limits and their
// changes arrive through engines.onEvents; these procedures answer one
// instance on demand, refresh it when the user asks, and run the Cursor
// Keychain read, which nothing else ever triggers.

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });

let service: EngineUsageService | null = null;

async function getUsageService() {
  if (!service) {
    // Loaded on first use: the driver list pulls in every engine module.
    const { getEngineDriver } =
      await import("@/lib/ai/chat/engines/platform/drivers");
    service = createEngineUsageService({
      drivers: getEngineDriver,
      readCursorKeychainToken: (instanceId) =>
        readCursorKeychainToken(instanceId),
      registry: getEngineInstanceRegistry(),
      snapshots: getEngineSnapshotService(),
    });
  }
  return service;
}

function toTRPCError(error: unknown): never {
  if (error instanceof EngineUsageError) {
    throw new TRPCError({
      cause: error,
      code:
        error.code === "not-found"
          ? "NOT_FOUND"
          : error.code === "not-ready"
            ? "PRECONDITION_FAILED"
            : "BAD_REQUEST",
      message: error.message,
    });
  }
  if (error instanceof CursorKeychainUnavailableError) {
    throw new TRPCError({
      cause: error,
      code: "PRECONDITION_FAILED",
      message: error.message,
    });
  }
  throw error;
}

export const engineUsageRouter = createTRPCRouter({
  /** One instance's usage limits (null when it reports none). */
  get: protectedProcedure
    .input(instanceInputSchema)
    .query(async ({ ctx, input }) =>
      (await getUsageService())
        .get(ctx.session.user.id, input.instanceId)
        .catch(toTRPCError),
    ),

  /** Reads one instance's usage now. */
  refresh: protectedProcedure
    .input(instanceInputSchema)
    .mutation(async ({ ctx, input }) =>
      (await getUsageService())
        .refresh(ctx.session.user.id, input.instanceId)
        .catch(toTRPCError),
    ),

  /**
   * Explicit user action only: reads the Cursor CLI's login from the macOS
   * Keychain (macOS asks the user to allow it), then reads usage with it.
   */
  readCursorKeychain: protectedProcedure
    .input(instanceInputSchema)
    .mutation(async ({ ctx, input }) =>
      (await getUsageService())
        .readCursorKeychain(ctx.session.user.id, input.instanceId)
        .catch(toTRPCError),
    ),
});
