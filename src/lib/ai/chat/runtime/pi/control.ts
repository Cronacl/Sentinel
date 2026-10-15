import "server-only";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { PiRpcProcess } from "@/lib/ai/chat/engines/pi/rpc";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { PoolLease } from "@/lib/runtime/process/pool";
import type { PermissionMode } from "@/server/db/enums";

import * as persist from "../../persistence";
import type { MirrorEmitter } from "../external/emitter";
import type { ExternalRunControl } from "../external/lifecycle";
import type { ExternalAssistantMirror } from "../external/mirror";
import type { ExternalDecision } from "../external/permissions";
import { emitLatestThreadSnapshot } from "../thread-chat/run-state";
import type { PiTurnTracker } from "./events";

// The state of one Pi turn, shared by the run (run.ts) and the extension UI
// requests Pi raises while it runs (interactions.ts). Mirrors the ACP
// runtime's control (runtime/acp/control.ts) without the ACP session.

export type PiInteractionAnswer =
  | { type: "cancel" }
  | { decision: ExternalDecision; type: "decision" }
  | { response: string; type: "response" };

/** An extension dialog Pi waits on. */
export type PiPendingInteraction = {
  approvalId: string;
  kind: "confirm" | "question";
  settle(answer: PiInteractionAnswer): void;
  toolId: string;
};

export type PiRunControl = ExternalRunControl & {
  /** Aborts setup requests on Stop. */
  abort: AbortController;
  cancelRequested: boolean;
  detach: (() => void) | null;
  emitter: MirrorEmitter;
  instance: ResolvedEngineInstance;
  interactive: boolean;
  lease: PoolLease<PiRpcProcess> | null;
  mirror: ExternalAssistantMirror;
  nextInteractionId: number;
  pending: Map<string, PiPendingInteraction>;
  permissionMode: PermissionMode;
  poolKey: string;
  process: PiRpcProcess | null;
  promptPromise: Promise<void> | null;
  requestedModelId: string | null;
  /** Resolves when Pi settled the turn (or the process died). */
  settle: { promise: Promise<void>; resolve(): void };
  /** Bumped by new agent activity and each idle check: stale checks stop. */
  settleGeneration: number;
  statusLabel: string | null;
  threadMode: "chat" | "plan";
  toolsEnabled: boolean;
  tracker: PiTurnTracker;
  workspaceRoot: string;
};

type MessageStatus = NonNullable<
  NonNullable<ThreadUIMessage["metadata"]>["status"]
>;

/** Persists the assistant message as the mirror describes it now. */
export function persistAssistantMessage(
  control: PiRunControl,
  status: MessageStatus,
  extra: {
    errorMessage?: string | null;
    finishReason?: string | null;
    repoCheckpointId?: string | null;
    statusLabel?: string | null;
  } = {},
) {
  const usage = control.mirror.getUsage();
  const reasoning = control.mirror.reasoningMetadata();
  return persist.upsertMessage(control.threadId, {
    id: control.assistantId,
    metadata: {
      branchId: control.assistantId,
      ...(extra.errorMessage ? { errorMessage: extra.errorMessage } : {}),
      ...(extra.finishReason ? { finishReason: extra.finishReason } : {}),
      isActive: true,
      model: {
        requestedModelId: control.requestedModelId ?? undefined,
        responseModelId: control.requestedModelId ?? undefined,
      },
      ...(reasoning ? { reasoning } : {}),
      ...(extra.repoCheckpointId
        ? { repoCheckpointId: extra.repoCheckpointId }
        : {}),
      runId: control.runId,
      status,
      statusLabel:
        extra.statusLabel !== undefined
          ? extra.statusLabel
          : control.statusLabel,
      ...(usage ? { usage } : {}),
    },
    parts: control.mirror.toParts({ streaming: status === "streaming" }),
    role: "assistant",
  });
}

export function setStatusLabel(control: PiRunControl, label: string | null) {
  control.statusLabel = label;
  control.emitter.flush();
}

/** The run now waits on the user (approval or question). */
export async function markAwaitingUser(control: PiRunControl) {
  persist.setThreadStatus(control.threadId, "awaiting_approval");
  control.emitter.flush();
  await emitLatestThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  ).catch(() => null);
}

/** The user answered: back to streaming once nothing else waits. */
export function resumeStreaming(control: PiRunControl) {
  if (!control.finished && control.pending.size === 0) {
    persist.setThreadStatus(control.threadId, "streaming");
  }
  control.emitter.flush();
}

export function nextInteractionId(control: PiRunControl, base: string) {
  if (!control.pending.has(base) && !control.mirror.getTool(base)?.approval) {
    return base;
  }
  control.nextInteractionId += 1;
  return `${base}#${control.nextInteractionId}`;
}

/** Answers everything Pi still waits on as cancelled. */
export function cancelPendingInteractions(control: PiRunControl) {
  for (const interaction of [...control.pending.values()]) {
    interaction.settle({ type: "cancel" });
  }
  control.pending.clear();
}
