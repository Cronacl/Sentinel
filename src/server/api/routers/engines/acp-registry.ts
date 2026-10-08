import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { engineFeatureNotSupported } from "./not-supported";

// api.engines.acpRegistry: browsing the ACP Registry and installing an agent
// as an engine instance. The registry driver lands in P13; until then every
// procedure answers not_supported.

const agentIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,127}$/);

export const engineAcpRegistryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .query(() => engineFeatureNotSupported("acpRegistry.list")),

  install: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .mutation(() => engineFeatureNotSupported("acpRegistry.install")),
});
