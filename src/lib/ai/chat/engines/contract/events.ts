import { z } from "zod";

import { engineAuthFlowStateSchema } from "./auth";
import {
  engineInstallStateSchema,
  engineUpdateStateSchema,
} from "./maintenance";
import { engineSnapshotSchema } from "./snapshot";

/**
 * Pushed over the engines.onEvents subscription. `version` increases
 * monotonically per server process so a reconnecting client can replay from
 * its last event id.
 */
export const engineEventSchema = z.discriminatedUnion("type", [
  z.object({
    snapshot: engineSnapshotSchema,
    type: z.literal("snapshot"),
    version: z.number().int(),
  }),
  z.object({
    instanceId: z.string(),
    type: z.literal("snapshot-removed"),
    version: z.number().int(),
  }),
  z.object({
    state: engineAuthFlowStateSchema,
    type: z.literal("auth"),
    version: z.number().int(),
  }),
  z.object({
    installState: engineInstallStateSchema.optional(),
    instanceId: z.string(),
    type: z.literal("maintenance"),
    updateState: engineUpdateStateSchema.optional(),
    version: z.number().int(),
  }),
]);

export type EngineEvent = z.infer<typeof engineEventSchema>;
export type EngineEventType = EngineEvent["type"];
