import { z } from "zod";

import { engineInstanceIdSchema } from "@/lib/ai/chat/engines/contract";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { engineFeatureNotSupported } from "./not-supported";

// api.engines.maintenance: version advisories, updates and managed installs
// per instance. P11 builds the update runner and install service; until
// then every procedure answers not_supported.

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });

export const engineMaintenanceRouter = createTRPCRouter({
  checkForUpdate: protectedProcedure
    .input(instanceInputSchema)
    .mutation(() => engineFeatureNotSupported("maintenance.checkForUpdate")),

  update: protectedProcedure
    .input(instanceInputSchema)
    .mutation(() => engineFeatureNotSupported("maintenance.update")),

  install: protectedProcedure
    .input(instanceInputSchema)
    .mutation(() => engineFeatureNotSupported("maintenance.install")),

  cancelInstall: protectedProcedure
    .input(instanceInputSchema)
    .mutation(() => engineFeatureNotSupported("maintenance.cancelInstall")),
});
