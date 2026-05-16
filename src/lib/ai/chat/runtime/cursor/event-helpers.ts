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

export type CursorPromptResponse =
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

function isCursorUserInputPart(
  part: ThreadUIMessage["parts"][number],
): part is DynamicToolPart {
  if (part.type !== "dynamic-tool") {
    return false;
  }

  const normalized = part.toolName.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const withoutCursorPrefix = normalized.startsWith("cursor")
    ? normalized.slice("cursor".length)
    : normalized;

  return (
    normalized === "cursoraskquestion" ||
    normalized === "cursoruserinput" ||
    withoutCursorPrefix === "askquestion" ||
    withoutCursorPrefix === "askuserquestion" ||
    withoutCursorPrefix === "requestuserinput" ||
    withoutCursorPrefix === "userinput"
  );
}

function findCursorPromptResponse(
  messages: ThreadUIMessage[] | undefined,
  approvalId?: string,
): CursorPromptResponse | null {
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

      if (isCursorUserInputPart(part)) {
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

function inferCursorPromptResponseKind(
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

      return isCursorUserInputPart(part) ? "user-input" : "approval";
    }
  }

  return null;
}

export function resolveCursorPromptResponse(input: {
  messages: ThreadUIMessage[] | undefined;
  pendingKind?: CursorPromptResponse["kind"];
  toolApprovalResponse?: ThreadToolApprovalResponse;
}): CursorPromptResponse | null {
  if (!input.toolApprovalResponse) {
    return findCursorPromptResponse(input.messages);
  }

  const pendingKind =
    input.pendingKind ??
    inferCursorPromptResponseKind(
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
