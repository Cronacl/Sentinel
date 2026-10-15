import type { GenericToolApprovalFunction, ToolSet } from "ai";

import { UNATTENDED_DECLINE_MESSAGE } from "../runtime/unattended";
import { toolCallNeedsApproval } from "../tools/approval";

type ThreadToolApproval = GenericToolApprovalFunction<
  ToolSet,
  Record<string, unknown>,
  unknown
>;

function callNeedsApproval({
  toolCall,
  tools,
}: Parameters<ThreadToolApproval>[0]) {
  const tool =
    tools && Object.hasOwn(tools, toolCall.toolName)
      ? tools[toolCall.toolName]
      : undefined;
  return toolCallNeedsApproval(tool, toolCall.input);
}

/**
 * The thread agent's `toolApproval`: a call whose tool check (set with
 * `withToolApproval`) says so is put to the user. When the run resumes
 * after the user answers, AI SDK 7 asks again; anything but "denied" keeps
 * the user's answer.
 */
export const askUserForToolApproval: ThreadToolApproval = async (options) =>
  (await callNeedsApproval(options)) ? "user-approval" : "not-applicable";

/**
 * Tool approval for an unattended run (an automation): a call that would be
 * put to the user is declined, with a reason the model sees, and the run
 * goes on; every other call runs as it would in an attended run.
 */
export const declineUserApprovalsWhenUnattended: ThreadToolApproval = async (
  options,
) =>
  (await callNeedsApproval(options))
    ? { reason: UNATTENDED_DECLINE_MESSAGE, type: "denied" }
    : "not-applicable";
