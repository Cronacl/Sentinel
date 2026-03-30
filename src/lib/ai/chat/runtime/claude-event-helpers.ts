import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import type { ThreadToolApprovalResponse } from "@/lib/ai/chat/types";

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

export type ClaudePromptResponse =
  | {
      approvalId: string;
      decision?: string;
      kind: "approval";
      reason?: string;
      response?: string;
      approved?: boolean;
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

function isClaudeUserInputPart(
  part: ThreadUIMessage["parts"][number],
): part is DynamicToolPart {
  if (part.type !== "dynamic-tool") {
    return false;
  }

  const normalized = part.toolName.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const withoutClaudePrefix = normalized.startsWith("claude")
    ? normalized.slice("claude".length)
    : normalized;

  return (
    normalized === "claudeuserinput" ||
    normalized === "claudeaskuserquestion" ||
    normalized === "clauderequestuserinput" ||
    withoutClaudePrefix === "userinput" ||
    withoutClaudePrefix === "askuserquestion" ||
    withoutClaudePrefix === "requestuserinput"
  );
}

function findClaudePromptResponse(
  messages: ThreadUIMessage[] | undefined,
  approvalId?: string,
): ClaudePromptResponse | null {
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

      if (isClaudeUserInputPart(part)) {
        if (
          typeof approval.response !== "string" ||
          approval.response.trim().length === 0
        ) {
          continue;
        }

        return {
          approvalId: approval.id,
          kind: "user-input" as const,
          response: approval.response.trim(),
        };
      }

      if (typeof approval.approved !== "boolean") {
        continue;
      }

      return {
        approvalId: approval.id,
        approved: approval.approved,
        decision:
          typeof approval.decision === "string" ? approval.decision : undefined,
        kind: "approval" as const,
        reason:
          typeof approval.reason === "string" ? approval.reason : undefined,
        response:
          typeof approval.response === "string" ? approval.response : undefined,
      };
    }
  }

  return null;
}

export function extractClaudePromptResponse(
  messages: ThreadUIMessage[] | undefined,
): ClaudePromptResponse | null {
  return findClaudePromptResponse(messages);
}

export function extractClaudePromptResponseById(
  messages: ThreadUIMessage[] | undefined,
  approvalId: string,
): ClaudePromptResponse | null {
  return findClaudePromptResponse(messages, approvalId);
}

function inferClaudePromptResponseKind(
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

      return isClaudeUserInputPart(part) ? "user-input" : "approval";
    }
  }

  return null;
}

export function resolveClaudePromptResponse(input: {
  messages: ThreadUIMessage[] | undefined;
  pendingKind?: ClaudePromptResponse["kind"];
  toolApprovalResponse?: ThreadToolApprovalResponse;
}): ClaudePromptResponse | null {
  if (!input.toolApprovalResponse) {
    return extractClaudePromptResponse(input.messages);
  }

  const pendingKind =
    input.pendingKind ??
    inferClaudePromptResponseKind(
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
