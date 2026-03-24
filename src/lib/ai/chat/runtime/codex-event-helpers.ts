import type {
  CodexApprovalDecision,
  CodexServerEvent,
} from "@/lib/ai/chat/engines/codex-app-server";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";

type ApprovalLike = {
  approved?: unknown;
  decision?: unknown;
  id?: unknown;
  response?: unknown;
};

type DynamicToolPart = Extract<ThreadUIMessage["parts"][number], { type: "dynamic-tool" }>;

export type CodexPromptResponse =
  | {
      approvalId: string;
      decision: CodexApprovalDecision;
      kind: "approval";
    }
  | {
      kind: "user-input";
      requestId: string;
      response: string;
    };

function getApprovalFromPart(part: ThreadUIMessage["parts"][number]) {
  if (!("approval" in part) || !part.approval || typeof part.approval !== "object") {
    return null;
  }

  return part.approval as ApprovalLike;
}

function isCodexUserInputPart(
  part: ThreadUIMessage["parts"][number],
): part is DynamicToolPart {
  return part.type === "dynamic-tool" && part.toolName === "codex_user_input";
}

export function extractCodexPromptResponse(
  messages: ThreadUIMessage[] | undefined,
): CodexPromptResponse | null {
  if (!messages) {
    return null;
  }

  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      const approval = getApprovalFromPart(part);
      if (!approval || typeof approval.id !== "string") {
        continue;
      }

      if (isCodexUserInputPart(part)) {
        if (typeof approval.response !== "string" || approval.response.trim().length === 0) {
          continue;
        }

        return {
          kind: "user-input",
          requestId: approval.id,
          response: approval.response.trim(),
        };
      }

      if (typeof approval.approved !== "boolean") {
        continue;
      }

      const decision =
        typeof approval.decision === "string"
          ? (approval.decision as CodexApprovalDecision)
          : approval.approved
            ? "accept"
            : "decline";

      return {
        approvalId: approval.id,
        decision,
        kind: "approval",
      };
    }
  }

  return null;
}

function getEventParams(event: Pick<CodexServerEvent, "params">) {
  return event.params && typeof event.params === "object"
    ? (event.params as Record<string, unknown>)
    : null;
}

export function getCodexEventThreadId(
  event: Pick<CodexServerEvent, "method" | "params" | "type">,
): string | null {
  const params = getEventParams(event);
  if (params?.threadId && typeof params.threadId === "string") {
    return params.threadId;
  }

  if (
    event.method === "thread/started" &&
    params?.thread &&
    typeof params.thread === "object" &&
    "id" in params.thread &&
    typeof (params.thread as { id?: unknown }).id === "string"
  ) {
    return (params.thread as { id: string }).id;
  }

  return null;
}
