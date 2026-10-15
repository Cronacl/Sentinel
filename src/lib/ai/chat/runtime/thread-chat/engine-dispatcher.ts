import "server-only";

import type {
  DriverKind,
  EngineInstanceId,
  ResolvedEngineInstance,
} from "@/lib/ai/chat/engines/contract";
import type {
  EngineDriver,
  LoadedEngineThread,
} from "@/lib/ai/chat/engines/platform/driver";
import { getEngineDriver } from "@/lib/ai/chat/engines/platform/drivers";
import {
  EngineInstanceUnavailableError,
  EngineTriggerUnsupportedError,
} from "@/lib/ai/chat/engines/platform/errors";
import { getEngineInstanceRegistry } from "@/lib/ai/chat/engines/platform/instances";
import { getDriverLabel } from "@/lib/ai/chat/engines/catalog";

import type { ThreadChatRequest } from "../../types";

// Routes a thread's turn to the engine instance the thread is bound to,
// through the server driver registry (platform/drivers.ts). The built-in
// engine has no thread handlers and stays with the orchestrator. Anything
// that cannot run (an unknown or planned driver, a removed or disabled
// instance, a trigger the runtime does not handle) is a typed 409, never a
// silent fallback to another engine.

export type LoadedThread = LoadedEngineThread;

/**
 * The engine a thread runs on. `instanceId` null means the driver's default
 * instance (its id is the driver kind), exactly as the
 * chat_engine_instance_id column stores it.
 */
export type ThreadEngineTarget = {
  driver: DriverKind;
  instanceId: EngineInstanceId | null;
};

export type EngineDispatcherDeps = {
  drivers: (kind: string) => EngineDriver | null;
  /** Throws EngineInstanceUnavailableError when the target cannot run. */
  resolveInstance: (
    userId: string,
    target: ThreadEngineTarget,
  ) => Promise<ResolvedEngineInstance>;
};

/**
 * The thread's binding wins once it exists (the engine lock): a request
 * cannot move a thread to another engine or instance. A new thread takes
 * the request's engine and instance, else the built-in engine.
 */
export function resolveThreadEngine(
  request: Pick<ThreadChatRequest, "engine" | "engineInstanceId">,
  existingThread: Partial<
    Pick<NonNullable<LoadedThread>, "chatEngine" | "chatEngineInstanceId">
  > | null,
): ThreadEngineTarget {
  if (existingThread?.chatEngine) {
    return {
      driver: existingThread.chatEngine,
      instanceId: normalizeInstanceId(
        existingThread.chatEngine,
        existingThread.chatEngineInstanceId,
      ),
    };
  }

  const driver = request.engine ?? "sentinel";
  return {
    driver,
    instanceId: normalizeInstanceId(driver, request.engineInstanceId),
  };
}

function normalizeInstanceId(
  driver: DriverKind,
  instanceId: string | null | undefined,
) {
  // The default instance is stored (and resolved) as NULL.
  return instanceId == null || instanceId === driver ? null : instanceId;
}

export function createEngineDispatcher(deps: EngineDispatcherDeps) {
  return {
    /**
     * Runs the turn on the thread's instance. Null for the built-in engine
     * (the orchestrator runs it). Throws EngineInstanceUnavailableError or
     * EngineTriggerUnsupportedError (both answered with 409).
     */
    async run(
      target: ThreadEngineTarget,
      request: ThreadChatRequest,
      existingThread: LoadedThread,
    ): Promise<Response | null> {
      const driver = deps.drivers(target.driver);
      if (driver && !driver.thread) {
        return null;
      }
      if (driver?.thread && !driver.thread.triggers.includes(request.trigger)) {
        throw new EngineTriggerUnsupportedError(
          target.driver,
          request.trigger,
          `${getDriverLabel(target.driver)} does not support "${request.trigger}" yet.`,
        );
      }

      // Unknown and planned drivers, missing, disabled and misconfigured
      // instances all throw here.
      const instance = await deps.resolveInstance(request.userId, target);
      if (!driver?.thread) {
        throw new EngineInstanceUnavailableError(
          instance.id,
          target.driver,
          "driver-unknown",
          `This build has no "${target.driver}" engine driver.`,
        );
      }

      return await driver.thread.run({
        instance,
        request,
        thread: existingThread,
      });
    },

    /**
     * Stops the thread's run through its driver. Null when no driver owns
     * the run (built-in or unknown engine): the generic stop then clears it.
     * Stopping never fails because the instance became unusable.
     */
    async stop(
      target: ThreadEngineTarget,
      request: ThreadChatRequest,
      existingThread: LoadedThread,
    ): Promise<Response | null> {
      const driver = deps.drivers(target.driver);
      if (!driver?.thread) {
        return null;
      }

      let instance: ResolvedEngineInstance | null = null;
      try {
        instance = await deps.resolveInstance(request.userId, target);
      } catch (error) {
        if (!(error instanceof EngineInstanceUnavailableError)) {
          throw error;
        }
      }

      return await driver.thread.stop({
        instance,
        request,
        thread: existingThread,
      });
    },
  };
}

const defaultDispatcher = createEngineDispatcher({
  drivers: getEngineDriver,
  resolveInstance: (userId, target) =>
    getEngineInstanceRegistry().resolve(userId, target),
});

export async function runExternalThreadEngine(
  target: ThreadEngineTarget,
  request: ThreadChatRequest,
  existingThread: LoadedThread,
) {
  return await defaultDispatcher.run(target, request, existingThread);
}

export async function stopThreadEngine(
  target: ThreadEngineTarget,
  request: ThreadChatRequest,
  existingThread: LoadedThread,
) {
  return await defaultDispatcher.stop(target, request, existingThread);
}
