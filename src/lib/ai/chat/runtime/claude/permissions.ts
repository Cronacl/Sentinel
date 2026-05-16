import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

function isClaudePermissionRecord(
  input: unknown,
): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

export function normalizeClaudePermissionInput(
  input: unknown,
): Record<string, unknown> {
  if (isClaudePermissionRecord(input)) {
    return input;
  }

  return {};
}

export function resolveClaudePermissionInput(input: {
  pendingInput?: unknown;
  persistedToolInput?: unknown;
}) {
  if (isClaudePermissionRecord(input.pendingInput)) {
    return input.pendingInput;
  }

  if (isClaudePermissionRecord(input.persistedToolInput)) {
    return input.persistedToolInput;
  }

  return {};
}

export function buildClaudePermissionResult(input: {
  approved: boolean;
  message?: string;
  toolInput?: unknown;
}): PermissionResult {
  if (!input.approved) {
    return {
      behavior: "deny",
      message: input.message ?? "Request denied.",
    };
  }

  return {
    behavior: "allow",
    updatedInput: normalizeClaudePermissionInput(input.toolInput),
  };
}
