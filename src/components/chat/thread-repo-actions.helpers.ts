import type { RepoLastPullRequest } from "@/lib/ai/chat/engines/types";

function extractErrorMessagesFromPayload(payload: unknown): string[] {
  if (typeof payload === "string") {
    return payload.trim() ? [payload.trim()] : [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => extractErrorMessagesFromPayload(entry));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const directMessage =
    typeof record.message === "string" ? record.message.trim() : "";
  const nestedMessages = extractErrorMessagesFromPayload(record.errors);

  return [directMessage, ...nestedMessages].filter(Boolean);
}

export function buildGenerateCommitMessageInput(input: {
  includeUnstaged: boolean;
  threadId: string;
  workspaceId: string;
}) {
  return {
    includeUnstaged: input.includeUnstaged,
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  };
}

export function buildCreatePullRequestInput(input: {
  branchName?: string;
  draft?: boolean;
  includeUnstaged?: boolean;
  message?: string;
  threadId: string;
  workspaceId: string;
}) {
  return {
    ...(input.branchName?.trim()
      ? { branchName: input.branchName.trim() }
      : {}),
    ...(input.draft ? { draft: true } : {}),
    ...(input.includeUnstaged === undefined
      ? {}
      : { includeUnstaged: input.includeUnstaged }),
    ...(input.message?.trim() ? { message: input.message.trim() } : {}),
    threadId: input.threadId,
    workspaceId: input.workspaceId,
  };
}

export function getGeneratedCommitPromptValue(input: { message: string }) {
  return input.message;
}

export function formatRepoActionErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return trimmed;
  }

  const withoutDocsUrl = trimmed.replace(
    /\s+-\s+https:\/\/docs\.github\.com\/\S+$/u,
    "",
  );
  const jsonStart = withoutDocsUrl.search(/[\[{]/u);
  if (jsonStart === -1) {
    return withoutDocsUrl;
  }

  const payloadText = withoutDocsUrl.slice(jsonStart).trim();
  const prefix = withoutDocsUrl
    .slice(0, jsonStart)
    .trim()
    .replace(/[:\s-]+$/u, "");

  try {
    const payload = JSON.parse(payloadText) as unknown;
    const messages = extractErrorMessagesFromPayload(payload);
    if (messages.length === 0) {
      return prefix || withoutDocsUrl;
    }
    if (prefix.toLowerCase() === "validation failed") {
      return messages.join(" ");
    }
    return [prefix, ...messages].filter(Boolean).join(": ");
  } catch {
    return withoutDocsUrl;
  }
}

export function getActivePullRequestUrl(input: {
  branch: string | null | undefined;
  lastPullRequest: RepoLastPullRequest | null | undefined;
}) {
  if (!input.branch || !input.lastPullRequest) {
    return null;
  }

  if (input.lastPullRequest.head !== input.branch) {
    return null;
  }

  if (
    input.lastPullRequest.kind === "github" &&
    input.lastPullRequest.state.toLowerCase() !== "open"
  ) {
    return null;
  }

  return input.lastPullRequest.url;
}
