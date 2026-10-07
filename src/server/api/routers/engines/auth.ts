import { z } from "zod";

import { engineInstanceIdSchema } from "@/lib/ai/chat/engines/contract";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { engineFeatureNotSupported } from "./not-supported";

// api.engines.auth: sign-in flows per instance (browser, device code,
// terminal command, credentials). P11 builds the flow store and the driver
// auth controllers; until then every procedure answers not_supported.
// Codex keeps its own account procedures under api.engines.codex.

const instanceInputSchema = z.object({ instanceId: engineInstanceIdSchema });

export const engineAuthRouter = createTRPCRouter({
  methods: protectedProcedure
    .input(instanceInputSchema)
    .query(() => engineFeatureNotSupported("auth.methods")),

  start: protectedProcedure
    .input(
      instanceInputSchema.extend({
        methodId: z.string().trim().min(1).max(128).optional(),
      }),
    )
    .mutation(() => engineFeatureNotSupported("auth.start")),

  cancel: protectedProcedure
    .input(
      instanceInputSchema.extend({
        flowId: z.string().trim().min(1).max(128),
      }),
    )
    .mutation(() => engineFeatureNotSupported("auth.cancel")),

  logout: protectedProcedure
    .input(instanceInputSchema)
    .mutation(() => engineFeatureNotSupported("auth.logout")),
});
