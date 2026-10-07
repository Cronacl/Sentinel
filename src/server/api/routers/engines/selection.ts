import { TRPCError } from "@trpc/server";

// Engine selections written from the UI (user default, thread settings, new
// threads, automations) name an engine and, optionally, one of its
// instances. An instance of another driver (or one that does not exist)
// would only fail later, at dispatch, so it is refused when written.

/**
 * Throws BAD_REQUEST unless `instanceId` is absent, the engine's default
 * instance, or an existing instance of `engine`. The registry is loaded on
 * demand: callers' modules stay importable without the database layer.
 */
export async function assertEngineInstanceSelection(
  userId: string,
  engine: string,
  instanceId: string | null | undefined,
) {
  if (instanceId == null || instanceId === engine) {
    return;
  }

  const { getEngineInstanceRegistry } =
    await import("@/lib/ai/chat/engines/platform/instances");
  const lookup = await getEngineInstanceRegistry().get(userId, instanceId);
  if (!lookup || lookup.instance.driver !== engine) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Engine instance "${instanceId}" is not an instance of ${engine}.`,
    });
  }
}
