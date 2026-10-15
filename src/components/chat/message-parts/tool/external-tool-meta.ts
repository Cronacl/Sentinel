import type { ToolPart } from "../types";

// Display data external agent runtimes (the shared ACP engine) put on their
// tool parts in callProviderMetadata.sentinel (runtime/external/mirror.ts).
// Its `kind` is the authoritative renderer discriminator; tool names are
// only used for parts persisted before this metadata existed.

export type ExternalToolLocation = { line?: number; path: string };

export type ExternalToolDiff = {
  newText: string;
  oldText: string | null;
  path: string;
};

export type ExternalToolTerminal = {
  exitStatus?: { exitCode: number | null; signal: string | null } | null;
  output?: string;
  terminalId: string;
  truncated?: boolean;
};

export type ExternalToolContent = {
  diffs?: ExternalToolDiff[];
  images?: Array<{ mediaType: string; url: string }>;
  rawOutput?: unknown;
  terminals?: ExternalToolTerminal[];
  text?: string;
};

export type ExternalPermissionOption = {
  kind: string | null;
  name: string;
  optionId: string;
};

export type ExternalToolMeta = {
  agentLabel: string;
  kind: string;
  locations: ExternalToolLocation[];
  meta: Record<string, unknown> | null;
  permissionOptions: ExternalPermissionOption[];
  preview: ExternalToolContent | null;
  rawName: string | null;
  title: string | null;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getExternalToolMeta(part: ToolPart): ExternalToolMeta | null {
  const provider =
    "callProviderMetadata" in part ? record(part.callProviderMetadata) : null;
  const sentinel = record(provider?.sentinel);
  if (!sentinel || typeof sentinel.kind !== "string") {
    return null;
  }
  return {
    agentLabel:
      typeof sentinel.agentLabel === "string" ? sentinel.agentLabel : "Agent",
    kind: sentinel.kind,
    locations: Array.isArray(sentinel.locations)
      ? (sentinel.locations as ExternalToolLocation[]).filter(
          (location) => typeof location?.path === "string",
        )
      : [],
    meta: record(sentinel.meta),
    permissionOptions: Array.isArray(sentinel.permissionOptions)
      ? (sentinel.permissionOptions as ExternalPermissionOption[]).filter(
          (option) => typeof option?.optionId === "string",
        )
      : [],
    preview: record(sentinel.preview) as ExternalToolContent | null,
    rawName: typeof sentinel.rawName === "string" ? sentinel.rawName : null,
    title:
      typeof sentinel.title === "string"
        ? sentinel.title
        : "title" in part && typeof part.title === "string"
          ? part.title
          : null,
  };
}

/** What the call produced (output when finished, else the live preview). */
export function getExternalToolContent(
  part: ToolPart,
  meta: ExternalToolMeta,
): ExternalToolContent {
  const output =
    part.state === "output-available" && "output" in part
      ? record(part.output)
      : null;
  return (output as ExternalToolContent | null) ?? meta.preview ?? {};
}

/** The approval decision an agent's option stands for. */
export function decisionForOption(
  option: ExternalPermissionOption,
): "accept" | "acceptForSession" | "decline" {
  switch (option.kind) {
    case "allow_always":
      return "acceptForSession";
    case "reject_once":
    case "reject_always":
      return "decline";
    default:
      return "accept";
  }
}

/**
 * The buttons an approval shows: one per kind the agent offers (its own
 * labels), at most one per decision, allow before reject.
 */
export function getApprovalButtons(
  options: readonly ExternalPermissionOption[],
) {
  const order = ["allow_once", "allow_always", "reject_once", "reject_always"];
  const seen = new Set<string>();
  return [...options]
    .filter((option) => option.kind && order.includes(option.kind))
    .sort(
      (left, right) => order.indexOf(left.kind!) - order.indexOf(right.kind!),
    )
    .flatMap((option) => {
      const decision = decisionForOption(option);
      if (seen.has(decision)) {
        return [];
      }
      seen.add(decision);
      return [{ decision, label: option.name, optionId: option.optionId }];
    });
}
