import type { PermissionMode } from "@/server/db/enums";

import type { ExternalPermissionOption, ExternalToolKind } from "./mirror";

// Approval policy for external agents (design acp-and-agents §2.8) and how a
// user's decision maps onto the options an ACP agent offers. Pure and
// table-tested.

export type PermissionDisposition = "allow" | "ask" | "deny";

/** What the user chose (the approval card's decision values). */
export type ExternalDecision =
  "accept" | "acceptForSession" | "cancel" | "decline";

const READ_ONLY_KINDS = new Set<ExternalToolKind>(["read", "search", "think"]);
const EDIT_KINDS = new Set<ExternalToolKind>(["edit", "delete", "move"]);

export function isReadOnlyKind(kind: ExternalToolKind) {
  return READ_ONLY_KINDS.has(kind);
}

export function isEditKind(kind: ExternalToolKind) {
  return EDIT_KINDS.has(kind);
}

/**
 * Where the files an edit touches are: inside the workspace, outside it,
 * or unknown (the request names no file, like Cursor's deletes).
 */
export type EditScope = "inside" | "outside" | "unknown";

export type PermissionDispositionInput = {
  /** For edit kinds; unknown when absent. */
  editScope?: EditScope;
  interactive: boolean;
  kind: ExternalToolKind;
  permissionMode: PermissionMode;
  toolsEnabled: boolean;
};

/**
 * allow / deny / ask for one request:
 * - tools off: deny;
 * - read, search and think: allow;
 * - full access: allow;
 * - accept_edits (and auto, which no ACP agent classifies natively yet):
 *   edits, deletes and moves of files inside the workspace are allowed;
 *   an edit naming no file or one outside the workspace asks, as does
 *   everything else;
 * - default: ask;
 * - an unattended run (automation) never asks: what would ask is denied
 *   (runtime/unattended.ts).
 */
export function resolvePermissionDisposition(
  input: PermissionDispositionInput,
): PermissionDisposition {
  if (!input.toolsEnabled) {
    return "deny";
  }
  if (READ_ONLY_KINDS.has(input.kind) || input.permissionMode === "full") {
    return "allow";
  }
  if (
    (input.permissionMode === "accept_edits" ||
      input.permissionMode === "auto") &&
    EDIT_KINDS.has(input.kind) &&
    input.editScope === "inside"
  ) {
    return "allow";
  }
  return input.interactive ? "ask" : "deny";
}

export type PermissionOutcome =
  | { outcome: { optionId: string; outcome: "selected" } }
  | { outcome: { outcome: "cancelled" } };

export const CANCELLED_PERMISSION_OUTCOME: PermissionOutcome = {
  outcome: { outcome: "cancelled" },
};

function selected(optionId: string): PermissionOutcome {
  return { outcome: { optionId, outcome: "selected" } };
}

function findKind(
  options: readonly ExternalPermissionOption[],
  ...kinds: string[]
) {
  for (const kind of kinds) {
    const option = options.find((candidate) => candidate.kind === kind);
    if (option) {
      return option;
    }
  }
  return null;
}

/**
 * The option a decision selects. "accept" never escalates to an
 * always-allow option, and "decline" never to always-reject unless that is
 * all the agent offers; with nothing suitable the request is cancelled.
 */
export function selectPermissionOutcome(
  options: readonly ExternalPermissionOption[],
  decision: ExternalDecision,
): PermissionOutcome {
  let option: ExternalPermissionOption | null = null;
  switch (decision) {
    case "accept":
      option = findKind(options, "allow_once");
      break;
    case "acceptForSession":
      option = findKind(options, "allow_always", "allow_once");
      break;
    case "decline":
      option = findKind(options, "reject_once", "reject_always");
      break;
    case "cancel":
      option = null;
      break;
  }
  return option ? selected(option.optionId) : CANCELLED_PERMISSION_OUTCOME;
}

/** Automatic approval (full access, read-only kinds): once, else always. */
export function autoApproveOutcome(
  options: readonly ExternalPermissionOption[],
): PermissionOutcome {
  const option = findKind(options, "allow_once", "allow_always");
  return option ? selected(option.optionId) : CANCELLED_PERMISSION_OUTCOME;
}

/** Automatic denial (tools off, unattended runs). */
export function autoDenyOutcome(
  options: readonly ExternalPermissionOption[],
): PermissionOutcome {
  const option = findKind(options, "reject_once", "reject_always");
  return option ? selected(option.optionId) : CANCELLED_PERMISSION_OUTCOME;
}

const DECISIONS = new Set<string>([
  "accept",
  "acceptForSession",
  "cancel",
  "decline",
]);

/** The decision a submitted approval carries (plain approve/deny map to once). */
export function toExternalDecision(response: {
  approved: boolean;
  decision?: string;
}): ExternalDecision {
  if (response.decision && DECISIONS.has(response.decision)) {
    return response.decision as ExternalDecision;
  }
  return response.approved ? "accept" : "decline";
}
