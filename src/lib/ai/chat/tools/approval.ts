import type { InferToolInput, Tool } from "ai";

/**
 * Whether a call to a tool is put to the user before it runs, given the
 * call's input. Builders close over their approval policies here, so a
 * policy is read when the call is made.
 */
export type ToolApprovalCheck<INPUT = unknown> = (
  input: INPUT,
) => boolean | PromiseLike<boolean>;

// A property rather than a side table, so the check survives a tool being
// copied with spread (MCP namespacing does that). `Symbol.for` keeps it the
// same key if this module is bundled more than once.
const APPROVAL_CHECK = Symbol.for("sentinel.toolApprovalCheck");

type WithApprovalCheck = { [APPROVAL_CHECK]?: ToolApprovalCheck };

/**
 * Attaches the approval check to a tool. AI SDK 7 no longer takes approval
 * from the tool itself (`needsApproval` is deprecated); the thread agent
 * reads this check from its `toolApproval` (see agent/tool-approval.ts).
 */
export function withToolApproval<TOOL extends Tool>(
  tool: TOOL,
  check: ToolApprovalCheck<InferToolInput<TOOL>>,
): TOOL {
  return Object.assign(tool, { [APPROVAL_CHECK]: check });
}

/** False for a tool without a check, and for a missing tool. */
export async function toolCallNeedsApproval(
  tool: unknown,
  input: unknown,
): Promise<boolean> {
  const check =
    tool != null && typeof tool === "object"
      ? (tool as WithApprovalCheck)[APPROVAL_CHECK]
      : undefined;
  return check ? Boolean(await check(input)) : false;
}
