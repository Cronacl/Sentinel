import { normalizeThreadMessageMetadata } from "@/lib/ai/messages/types";
import type { ScratchpadTaskStatus, ThreadStatus } from "@/server/db/enums";

type ScratchpadMessageLike = {
  metadata?: unknown;
  parts?: unknown;
  role: string;
};

function trimToString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLatestAssistantMessage(
  messages: ScratchpadMessageLike[] | undefined,
) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages?.[index];
    if (message?.role === "assistant") {
      return message;
    }
  }

  return null;
}

function getLatestStatusLabel(messages: ScratchpadMessageLike[] | undefined) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const metadata = normalizeThreadMessageMetadata(
      messages?.[index]?.metadata as never,
    );
    if (metadata.statusLabel) {
      return metadata.statusLabel.trim() || null;
    }
  }

  return null;
}

function getLatestErrorMessage(messages: ScratchpadMessageLike[] | undefined) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const metadata = normalizeThreadMessageMetadata(
      messages?.[index]?.metadata as never,
    );
    if (metadata.errorMessage) {
      return metadata.errorMessage.trim() || null;
    }
  }

  return null;
}

function getLatestAssistantSummary(
  messages: ScratchpadMessageLike[] | undefined,
) {
  const assistant = getLatestAssistantMessage(messages);
  if (!assistant) {
    return null;
  }

  const raw = ((Array.isArray(assistant.parts) ? assistant.parts : []) ?? [])
    .filter(
      (
        part,
      ): part is {
        text: string;
        type: string;
      } => part.type === "text" && typeof part.text === "string",
    )
    .map((part) => trimToString(part.text))
    .filter(Boolean)
    .join(" ");

  const text = raw
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[-*] /g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  return text.length > 100 ? `${text.slice(0, 97).trimEnd()}...` : text;
}

export function deriveScratchpadTaskStatus(input: {
  activeRunId?: string | null;
  messages?: ScratchpadMessageLike[];
  pendingQuestion?: boolean;
  persistedProgressText?: string | null;
  status: ScratchpadTaskStatus;
  threadStatus?: ThreadStatus | null;
}) {
  const latestError = getLatestErrorMessage(input.messages);
  const latestStatusLabel = getLatestStatusLabel(input.messages);
  const latestAssistantSummary = getLatestAssistantSummary(input.messages);
  const persistedProgress = trimToString(input.persistedProgressText) || null;

  if (
    input.threadStatus === "streaming" ||
    (input.activeRunId != null && input.threadStatus !== "idle")
  ) {
    return {
      progressText: latestStatusLabel ?? persistedProgress ?? "Thinking",
      status: "running" as const,
    };
  }

  if (input.threadStatus === "awaiting_approval") {
    return {
      progressText: "Awaiting approval",
      status: "blocked" as const,
    };
  }

  if (input.pendingQuestion) {
    return {
      progressText: "Needs input",
      status: "blocked" as const,
    };
  }

  if (latestError) {
    return {
      progressText: latestError,
      status: "failed" as const,
    };
  }

  if (latestAssistantSummary) {
    return {
      progressText: latestAssistantSummary,
      status: "completed" as const,
    };
  }

  return {
    progressText: latestStatusLabel ?? persistedProgress,
    status: input.status,
  };
}

export function deriveScratchpadTaskTitle(input: {
  taskTitle?: string | null;
  threadTitle?: string | null;
}) {
  const taskTitle = trimToString(input.taskTitle);
  const threadTitle = trimToString(input.threadTitle);

  if (!threadTitle || threadTitle === "New thread") {
    return taskTitle || "Scratchpad task";
  }

  if (threadTitle.startsWith("Scratchpad: ")) {
    const strippedTitle = trimToString(
      threadTitle.slice("Scratchpad: ".length),
    );
    return strippedTitle || taskTitle || "Scratchpad task";
  }

  return threadTitle;
}
