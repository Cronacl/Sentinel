"use client";

import { useEffect, useState } from "react";

import type { RendererProps } from "../renderer";

/**
 * Helpers for Claude SDK tool renderers.
 */

export function unwrapClaudeInput<T>(rawInput: unknown): T | null {
  if (!rawInput || typeof rawInput !== "object") return null;
  const v = rawInput as Record<string, unknown>;
  if (typeof v.toolName === "string" && v.input !== undefined) {
    return v.input as T;
  }
  return rawInput as T;
}

export function getApprovalReason(approval: unknown): string | undefined {
  if (!approval || typeof approval !== "object") return undefined;
  const v = approval as Record<string, unknown>;
  return typeof v.reason === "string" ? v.reason : undefined;
}

export function extractTextFromContent(output: unknown): string | null {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const textParts = output
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>).type === "text" &&
          typeof (item as Record<string, unknown>).text === "string",
      )
      .map((item) => (item as Record<string, unknown>).text as string);
    if (textParts.length > 0) return textParts.join("\n");
    return null;
  }

  if (!output || typeof output !== "object") return null;
  const v = output as Record<string, unknown>;

  if (typeof v.stdout === "string") return v.stdout;
  if (typeof v.output === "string") return v.output;
  if (typeof v.text === "string") return v.text;
  if (typeof v.result === "string") return v.result;
  if (typeof v.persistedOutputPath === "string") {
    return `[Full output saved to ${v.persistedOutputPath}]`;
  }
  if (typeof v.rawOutputPath === "string") {
    return `[Full output saved to ${v.rawOutputPath}]`;
  }

  if (Array.isArray(v.content)) {
    const textParts = (v.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (textParts.length > 0) return textParts.join("\n");
  }

  if (Array.isArray(v.structuredContent)) {
    return extractTextFromContent(v.structuredContent);
  }

  return null;
}

export function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(ms >= 1000 ? 1 : 2)}s`;
}

export function getFileName(path: string) {
  return path.split("/").pop() ?? path;
}

export function isClaudeToolRunningState(
  state: RendererProps["part"]["state"],
) {
  return (
    state === "approval-responded" ||
    state === "input-available" ||
    state === "input-streaming"
  );
}

export function isClaudeToolErrorState(state: RendererProps["part"]["state"]) {
  return state === "output-error" || state === "output-denied";
}

export function useClaudeExpansionState(
  part: RendererProps["part"],
  defaultExpanded: boolean,
) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, part.state, part.toolCallId]);

  return [isExpanded, setIsExpanded] as const;
}
