import type {
  ThreadMessageMetadata,
  ThreadUIMessage,
} from "@/lib/ai/messages/types";

export type MessagePart = ThreadUIMessage["parts"][number];
export type PartEntry = { part: MessagePart; partIndex: number; type: "part" };
export type ReasoningBlockEntry = {
  rawPartCount: number;
  reasoningBlockIndex: number;
  endPartIndex: number;
  partIndex: number;
  text: string;
  type: "reasoning-block";
};
export type RenderEntry = PartEntry | ReasoningBlockEntry;
export type DynamicToolPart = Extract<MessagePart, { type: "dynamic-tool" }>;
export type FilePart = Extract<MessagePart, { type: "file" }>;
export type StaticToolPart = Extract<MessagePart, { type: `tool-${string}` }>;
export type ToolPart = DynamicToolPart | StaticToolPart;
export type TextPart = Extract<MessagePart, { type: "text" }>;

export function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

export function getToolName(part: ToolPart) {
  return part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
}

export function getToolStateLabel(state: ToolPart["state"]) {
  switch (state) {
    case "input-streaming":
      return "Preparing";
    case "input-available":
      return "Ready";
    case "approval-requested":
      return "Needs approval";
    case "approval-responded":
      return "Approval recorded";
    case "output-available":
      return "Completed";
    case "output-error":
      return "Failed";
    case "output-denied":
      return "Denied";
    default:
      return state;
  }
}

export function getPartKey(messageId: string, entry: PartEntry) {
  const { part, partIndex } = entry;

  if (part.type === "dynamic-tool") {
    return `${messageId}:dynamic-tool:${part.toolCallId}`;
  }

  if (isToolPart(part)) {
    return `${messageId}:${part.type}:${part.toolCallId}`;
  }

  return `${messageId}:${part.type}:${partIndex}`;
}

export function getAssistantText(message: ThreadUIMessage) {
  return message.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function groupMessageParts(parts: MessagePart[]) {
  const groups: PartEntry[][] = [];
  let current: PartEntry[] = [];

  parts.forEach((part, partIndex) => {
    if (part.type === "step-start") {
      if (current.length > 0) {
        groups.push(current);
      }
      current = [];
      return;
    }

    current.push({ part, partIndex, type: "part" });
  });

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function mergeReasoningText(current: string, next: string) {
  if (!current) return next;
  if (!next) return current;

  const currentEndsWithWhitespace = /\s$/.test(current);
  const nextStartsWithWhitespace = /^\s/.test(next);

  if (currentEndsWithWhitespace || nextStartsWithWhitespace) {
    return `${current}${next}`;
  }

  return `${current}\n\n${next}`;
}

export function coalesceReasoningEntries(group: PartEntry[]): RenderEntry[] {
  const entries: RenderEntry[] = [];
  let index = 0;
  let reasoningBlockIndex = 0;

  while (index < group.length) {
    const current = group[index];
    if (!current) {
      index += 1;
      continue;
    }

    if (current.part.type !== "reasoning") {
      entries.push(current);
      index += 1;
      continue;
    }

    let text = current.part.text;
    let endPartIndex = current.partIndex;
    let rawPartCount = 1;
    let cursor = index + 1;

    while (cursor < group.length) {
      const next = group[cursor];
      if (!next || next.part.type !== "reasoning") break;
      text = mergeReasoningText(text, next.part.text);
      endPartIndex = next.partIndex;
      rawPartCount += 1;
      cursor += 1;
    }

    entries.push({
      endPartIndex,
      partIndex: current.partIndex,
      rawPartCount,
      reasoningBlockIndex,
      text,
      type: "reasoning-block",
    });
    reasoningBlockIndex += 1;
    index = cursor;
  }

  return entries;
}

export function formatTokenCount(count: number) {
  return new Intl.NumberFormat().format(count);
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractReasoningTokens(
  metadata: ThreadMessageMetadata | undefined,
) {
  return metadata?.usage?.reasoningTokens;
}

export function getMessageStatus(metadata: ThreadMessageMetadata | undefined) {
  return metadata?.status;
}

export function getBranchOptions(metadata: ThreadMessageMetadata | undefined) {
  return metadata?.branchOptions ?? [];
}
