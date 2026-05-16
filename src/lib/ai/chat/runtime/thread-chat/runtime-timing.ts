import { createLogger } from "@/lib/logger";

export const threadChatLog = createLogger("ThreadChat");

export type RuntimeTimingPhase =
  | "agent_stream_created"
  | "bootstrap_ready"
  | "compaction_blocking"
  | "compaction_deferred"
  | "compaction_ready"
  | "compaction_reused"
  | "documents_normalized"
  | "first_message_upsert"
  | "optional_preflight_ready"
  | "optional_preflight_started"
  | "preflight_ready"
  | "prompt_context_ready"
  | "request_received"
  | "repo_checkpoint_ready"
  | "repo_checkpoint_started"
  | "run_failed"
  | "run_finished"
  | "stream_execute_started";

const OPTIONAL_PREFLIGHT_TIMEOUT_MS =
  process.env.NODE_ENV === "test" ? 25 : 1_200;

export function logRuntimeTiming(
  phase: RuntimeTimingPhase,
  startedAt: number,
  context: {
    runId?: string | null;
    threadId: string;
    trigger?: string;
    userId: string;
    workspaceId?: string | null;
  },
  extra?: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  threadChatLog.debug(`timing:${phase}`, {
    elapsedMs: Date.now() - startedAt,
    phase,
    ...context,
    ...(extra ?? {}),
  });
}

function describeStartupError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function withOptionalPreflightBudget<T>({
  fallback,
  label,
  promise,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
}) {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return new Promise<T>((resolve) => {
    const finish = (value: T) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      resolve(value);
    };

    timeout = setTimeout(() => {
      threadChatLog.warn(
        `Skipping ${label} during startup after ${OPTIONAL_PREFLIGHT_TIMEOUT_MS}ms.`,
      );
      finish(fallback);
    }, OPTIONAL_PREFLIGHT_TIMEOUT_MS);

    promise.then(finish).catch((error) => {
      threadChatLog.warn(
        `Skipping ${label} during startup: ${describeStartupError(error)}`,
      );
      finish(fallback);
    });
  });
}
