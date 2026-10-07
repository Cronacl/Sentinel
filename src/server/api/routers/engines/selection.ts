import { TRPCError } from "@trpc/server";

import { toStoredEngineInstanceId } from "@/lib/ai/chat/engines/contract/ids";

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

/**
 * Whether a thread-settings write would move the thread to another engine
 * or instance. Without `instanceId` a write keeps the stored instance while
 * the engine stays the same (engineInstanceIdForEngineWrite), so only an
 * engine change or a different instance counts.
 */
export function isThreadEngineRebind(
  thread: { chatEngine: string; chatEngineInstanceId: string | null },
  engine: string,
  instanceId: string | null | undefined,
) {
  if (engine !== thread.chatEngine) {
    return true;
  }
  if (instanceId === undefined) {
    return false;
  }
  return (
    toStoredEngineInstanceId(engine, instanceId) !==
    toStoredEngineInstanceId(engine, thread.chatEngineInstanceId)
  );
}

/**
 * A thread that has messages stays on its engine instance (the engine
 * lock): its native session, continuation key and history belong to it.
 */
export function assertThreadEngineKept(input: {
  engine: string;
  hasMessages: boolean;
  instanceId: string | null | undefined;
  thread: { chatEngine: string; chatEngineInstanceId: string | null };
}) {
  if (
    input.hasMessages &&
    isThreadEngineRebind(input.thread, input.engine, input.instanceId)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This thread already runs on another engine instance. Start a new thread to use this one.",
    });
  }
}
