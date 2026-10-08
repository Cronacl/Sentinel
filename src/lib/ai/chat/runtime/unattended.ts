import type { ThreadChatRequest } from "../types";

// Unattended runs (automations send `interactive: false`) have nobody to
// answer an approval or a question. Every engine settles such requests on
// the spot instead of leaving the run waiting: whatever its permission mode
// already approves still runs (full access), anything that would ask the
// user is declined with this message.

export const UNATTENDED_DECLINE_MESSAGE =
  "Declined: automation runs cannot ask for approval or answers.";

export function isUnattendedRun(
  request: Pick<ThreadChatRequest, "interactive">,
) {
  return request.interactive === false;
}
