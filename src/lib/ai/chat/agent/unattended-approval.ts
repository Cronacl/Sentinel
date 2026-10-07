import type { GenericToolApprovalFunction, ToolSet } from "ai";

import { UNATTENDED_DECLINE_MESSAGE } from "../runtime/unattended";

/**
 * Tool approval for an unattended run (an automation): a call the tool's
 * approval policy would put to the user is declined, with a reason the model
 * sees, and the run goes on; every other call runs as it would in an
 * attended run. Set as the agent's `toolApproval`, which takes precedence
 * over each tool's own `needsApproval`, so this asks that function itself.
 */
export const declineUserApprovalsWhenUnattended: GenericToolApprovalFunction<
  ToolSet,
  Record<string, unknown>,
  unknown
> = async ({ messages, toolCall, tools, toolsContext }) => {
  const tool = tools?.[toolCall.toolName];
  const needsApproval = tool?.needsApproval;
  if (needsApproval == null) {
    return "not-applicable";
  }

  const asksUser =
    typeof needsApproval === "function"
      ? await needsApproval(toolCall.input as never, {
          context: toolsContext?.[toolCall.toolName] as never,
          messages,
          toolCallId: toolCall.toolCallId,
        })
      : needsApproval;

  return asksUser
    ? { reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" }
    : "not-applicable";
};
