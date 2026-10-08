import "server-only";

import type { AcpAgentProcess } from "@/lib/ai/chat/engines/acp/connection";
import type { AcpAgentDescriptor } from "@/lib/ai/chat/engines/acp/descriptor";
import type { ClientTerminals } from "@/lib/ai/chat/engines/acp/client-terminal";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { ThreadMode } from "@/lib/plan";
import type { PoolLease } from "@/lib/runtime/process/pool";
import type { PermissionMode } from "@/server/db/enums";

import * as persist from "../../persistence";
import type { MirrorEmitter } from "../external/emitter";
import type { ExternalRunControl } from "../external/lifecycle";
import type { ExternalAssistantMirror } from "../external/mirror";
import type { ExternalDecision } from "../external/permissions";
import { emitLatestThreadSnapshot } from "../thread-chat/run-state";

// The state of one ACP turn, shared by the run (run.ts) and the handlers
// for what the agent asks while it runs (interactions.ts).

export type InteractionAnswer =
  | { type: "cancel" }
  | {
      approved: boolean;
      decision: ExternalDecision;
      reason?: string;
      type: "decision";
    }
  | { response: string; type: "response" };

/** Something the agent waits on: an approval, a question, a sign-in link. */
export type PendingInteraction = {
  approvalId: string;
  elicitationId?: string;
  kind: "gate" | "permission" | "question" | "url";
  settle(answer: InteractionAnswer): void;
  toolId: string;
};

export type AcpRunGrants = {
  /** Paths an approved edit covers (fs/write_text_file needs no second ask). */
  editPaths: Set<string>;
  /** An approved execute: for this turn, or for the session (allow_always). */
  execute: "none" | "session" | "turn";
};

export type AcpRunControl = ExternalRunControl & {
  /** Aborts setup requests (initialize, auth, session) on Stop. */
  abort: AbortController;
  /** The thread was created by this turn: the agent may title it. */
  allowTitleUpdate: boolean;
  cancelRequested: boolean;
  descriptor: AcpAgentDescriptor;
  detach: (() => void) | null;
  emitter: MirrorEmitter;
  grants: AcpRunGrants;
  instance: ResolvedEngineInstance;
  interactive: boolean;
  lease: PoolLease<AcpAgentProcess> | null;
  mirror: ExternalAssistantMirror;
  nextInteractionId: number;
  pending: Map<string, PendingInteraction>;
  permissionMode: PermissionMode;
  poolKey: string;
  process: AcpAgentProcess | null;
  promptPromise: Promise<void> | null;
  /** A session/load is replaying history. */
  replaying: boolean;
  requestedModelId: string | null;
  sessionId: string | null;
  statusLabel: string | null;
  terminals: ClientTerminals | null;
  threadMode: ThreadMode;
  toolsEnabled: boolean;
  workspaceRoot: string;
};

type MessageStatus = NonNullable<
  NonNullable<ThreadUIMessage["metadata"]>["status"]
>;

/** Persists the assistant message as the mirror describes it now. */
export function persistAssistantMessage(
  control: AcpRunControl,
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

export function setStatusLabel(control: AcpRunControl, label: string | null) {
  control.statusLabel = label;
  control.emitter.flush();
}

/** The run now waits on the user (approval or question). */
export async function markAwaitingUser(control: AcpRunControl) {
  persist.setThreadStatus(control.threadId, "awaiting_approval");
  control.emitter.flush();
  await emitLatestThreadSnapshot(
    control.threadId,
    control.eventChannel,
    control.runId,
  ).catch(() => null);
}

/** The user answered: back to streaming once nothing else waits. */
export function resumeStreaming(control: AcpRunControl) {
  if (!control.finished && control.pending.size === 0) {
    persist.setThreadStatus(control.threadId, "streaming");
  }
  control.emitter.flush();
}

export function nextInteractionId(control: AcpRunControl, base: string) {
  if (!control.pending.has(base) && !control.mirror.getTool(base)?.approval) {
    return base;
  }
  control.nextInteractionId += 1;
  return `${base}#${control.nextInteractionId}`;
}

/** Answers everything the agent still waits on as cancelled. */
export function cancelPendingInteractions(control: AcpRunControl) {
  for (const interaction of [...control.pending.values()]) {
    interaction.settle({ type: "cancel" });
  }
  control.pending.clear();
}
