"use client";

import { useEffect, useRef, useState } from "react";

import type { RendererProps } from "../renderer";

export function unwrapCopilotInput<T>(rawInput: unknown): T | null {
  if (!rawInput || typeof rawInput !== "object") return null;
  const value = rawInput as Record<string, unknown>;
  if (typeof value.toolName === "string" && value.input !== undefined) {
    return value.input as T;
  }
  return rawInput as T;
}

export function getCopilotApprovalReason(
  approval: unknown,
): string | undefined {
  if (!approval || typeof approval !== "object") return undefined;
  const value = approval as Record<string, unknown>;
  return typeof value.reason === "string" ? value.reason : undefined;
}

function extractTextFromArray(value: unknown[]) {
  const textParts = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (
      (entry.type === "text" || entry.type === "terminal") &&
      typeof entry.text === "string"
    ) {
      return [entry.text];
    }
    return [];
  });

  return textParts.length > 0 ? textParts.join("\n") : null;
}

export function extractCopilotTextFromContent(output: unknown): string | null {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    return extractTextFromArray(output);
  }

  if (!output || typeof output !== "object") {
    return null;
  }

  const value = output as Record<string, unknown>;

  if (typeof value.detailedContent === "string") return value.detailedContent;
  if (typeof value.content === "string") return value.content;
  if (typeof value.stdout === "string") return value.stdout;
  if (typeof value.output === "string") return value.output;
  if (typeof value.text === "string") return value.text;
  if (typeof value.result === "string") return value.result;
  if (typeof value.partialOutput === "string") return value.partialOutput;
  if (typeof value.progressMessage === "string") return value.progressMessage;
  if (typeof value.message === "string") return value.message;

  if (Array.isArray(value.contents)) {
    return extractTextFromArray(value.contents as unknown[]);
  }

  if (Array.isArray(value.content)) {
    return extractTextFromArray(value.content as unknown[]);
  }

  return null;
}

export function tryParseCopilotOutput<T>(
  output: unknown,
  guard: (value: unknown) => value is T,
): T | null {
  if (guard(output)) return output;

  const text = extractCopilotTextFromContent(output);
  if (!text) return null;

  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (guard(parsed)) return parsed;
    } catch {
      /* best effort */
    }
  }

  return null;
}

export function formatDuration(ms: number) {
  return `${(ms / 1000).toFixed(ms >= 1000 ? 1 : 2)}s`;
}

const EXIT_CODE_RE = /\n?<exited with exit code (\d+)>\s*$/;
const INTERRUPTED_RE = /\n?<interrupted>\s*$/;

export type ParsedShellContent = {
  exitCode: number | null;
  interrupted: boolean;
  text: string;
};

export function parseShellFromContentText(
  raw: string | null,
): ParsedShellContent | null {
  if (!raw) return null;

  const interruptedMatch = INTERRUPTED_RE.exec(raw);
  if (interruptedMatch) {
    return {
      exitCode: null,
      interrupted: true,
      text: raw.slice(0, interruptedMatch.index),
    };
  }

  const exitMatch = EXIT_CODE_RE.exec(raw);
  if (exitMatch) {
    return {
      exitCode: parseInt(exitMatch[1]!, 10),
      interrupted: false,
      text: raw.slice(0, exitMatch.index),
    };
  }

  return null;
}

export function getCopilotContentField(
  output: unknown,
  field: "content" | "detailedContent",
): string | null {
  if (!output || typeof output !== "object") return null;
  const v = output as Record<string, unknown>;
  return typeof v[field] === "string" ? (v[field] as string) : null;
}

export function getFileName(path: string) {
  return path.split("/").pop() ?? path;
}

export function isCopilotToolRunningState(
  state: RendererProps["part"]["state"],
) {
  return (
    state === "approval-responded" ||
    state === "input-available" ||
    state === "input-streaming"
  );
}

export function isCopilotToolErrorState(state: RendererProps["part"]["state"]) {
  return state === "output-error" || state === "output-denied";
}

export function useCopilotExpansionState(
  part: RendererProps["part"],
  _defaultExpanded: boolean,
) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lastToolCallIdRef = useRef(part.toolCallId);

  useEffect(() => {
    if (lastToolCallIdRef.current !== part.toolCallId) {
      lastToolCallIdRef.current = part.toolCallId;
      setIsExpanded(false);
    }
  }, [part.toolCallId]);

  return [isExpanded, setIsExpanded] as const;
}
