import type { ThreadToolApprovalResponse } from "@/lib/ai/chat/types";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

type ApprovalLike = {
  approved?: unknown;
  decision?: unknown;
  id?: unknown;
  reason?: unknown;
  response?: unknown;
};

type DynamicToolPart = Extract<
  ThreadUIMessage["parts"][number],
  { type: "dynamic-tool" }
>;

export type OpenCodePromptResponse =
  | {
      approvalId: string;
      approved?: boolean;
      decision?: string;
      kind: "approval";
      reason?: string;
      response?: string;
    }
  | {
      approvalId: string;
      kind: "user-input";
      response: string;
    };

function getApprovalFromPart(part: ThreadUIMessage["parts"][number]) {
  if (
    !("approval" in part) ||
    !part.approval ||
    typeof part.approval !== "object"
  ) {
    return null;
  }

  return part.approval as ApprovalLike;
}

function isOpenCodeUserInputPart(
  part: ThreadUIMessage["parts"][number],
): part is DynamicToolPart {
  if (part.type !== "dynamic-tool") {
    return false;
  }

  const normalized = part.toolName.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const withoutOpenCodePrefix = normalized.startsWith("opencode")
    ? normalized.slice("opencode".length)
    : normalized;

  return (
    normalized === "opencodeaskquestion" ||
    normalized === "opencodeuserinput" ||
    withoutOpenCodePrefix === "askquestion" ||
    withoutOpenCodePrefix === "askuserquestion" ||
    withoutOpenCodePrefix === "requestuserinput" ||
    withoutOpenCodePrefix === "userinput"
  );
}

function findOpenCodePromptResponse(
  messages: ThreadUIMessage[] | undefined,
  approvalId?: string,
): OpenCodePromptResponse | null {
  if (!messages) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      const approval = getApprovalFromPart(part);
      if (!approval || typeof approval.id !== "string") {
        continue;
      }

      if (approvalId && approval.id !== approvalId) {
        continue;
      }

      if (isOpenCodeUserInputPart(part)) {
        if (
          typeof approval.response !== "string" ||
          approval.response.trim().length === 0
        ) {
          continue;
        }

        return {
          approvalId: approval.id,
          kind: "user-input",
          response: approval.response.trim(),
        };
      }

      if (typeof approval.approved !== "boolean") {
        continue;
      }

      return {
        approvalId: approval.id,
        approved: approval.approved,
        ...(typeof approval.decision === "string"
          ? { decision: approval.decision }
          : {}),
        kind: "approval",
        ...(typeof approval.reason === "string"
          ? { reason: approval.reason }
          : {}),
        ...(typeof approval.response === "string"
          ? { response: approval.response }
          : {}),
      };
    }
  }

  return null;
}

function inferOpenCodePromptResponseKind(
  messages: ThreadUIMessage[] | undefined,
  approvalId: string,
) {
  if (!messages) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      const approval = getApprovalFromPart(part);
      if (!approval || approval.id !== approvalId) {
        continue;
      }

      return isOpenCodeUserInputPart(part) ? "user-input" : "approval";
    }
  }

  return null;
}

export function resolveOpenCodePromptResponse(input: {
  messages: ThreadUIMessage[] | undefined;
  pendingKind?: OpenCodePromptResponse["kind"];
  toolApprovalResponse?: ThreadToolApprovalResponse;
}): OpenCodePromptResponse | null {
  if (!input.toolApprovalResponse) {
    return findOpenCodePromptResponse(input.messages);
  }

  const pendingKind =
    input.pendingKind ??
    inferOpenCodePromptResponseKind(
      input.messages,
      input.toolApprovalResponse.id,
    ) ??
    "approval";

  if (pendingKind === "user-input") {
    const response = input.toolApprovalResponse.response?.trim();
    if (!response) {
      return null;
    }

    return {
      approvalId: input.toolApprovalResponse.id,
      kind: "user-input",
      response,
    };
  }

  return {
    approvalId: input.toolApprovalResponse.id,
    approved: input.toolApprovalResponse.approved,
    ...(input.toolApprovalResponse.decision
      ? { decision: input.toolApprovalResponse.decision }
      : {}),
    kind: "approval",
    ...(input.toolApprovalResponse.reason
      ? { reason: input.toolApprovalResponse.reason }
      : {}),
    ...(input.toolApprovalResponse.response
      ? { response: input.toolApprovalResponse.response }
      : {}),
  };
}

export type OpenCodeSessionErrorOutcome = {
  aborted: boolean;
  // Not terminal on its own: with the default `compaction.auto` the server
  // publishes this error, compacts the session and keeps going; only with
  // auto-compaction off does session.idle follow without a new assistant
  // message (opencode 1.18.35 session/processor.ts `halt`).
  contextOverflow: boolean;
  message: string;
};

// `session.error` carries `{error?: {name, data: {message}}}` (the SDK's
// ProviderAuthError | UnknownError | APIError | … union); the readable text is
// `data.message`, not `error.message`. Mirrors t3code's openCodeErrorMessage.
export function resolveOpenCodeSessionError(
  properties: unknown,
): OpenCodeSessionErrorOutcome {
  const record =
    properties && typeof properties === "object"
      ? (properties as { error?: unknown; message?: unknown })
      : {};
  const error =
    record.error && typeof record.error === "object"
      ? (record.error as { data?: unknown; message?: unknown; name?: unknown })
      : null;
  const data =
    error?.data && typeof error.data === "object"
      ? (error.data as { message?: unknown })
      : null;
  const name = typeof error?.name === "string" ? error.name : null;
  const message = [data?.message, error?.message, record.message, name].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return {
    aborted: name === "MessageAbortedError",
    contextOverflow: name === "ContextOverflowError",
    message: message ?? "OpenCode run failed.",
  };
}
