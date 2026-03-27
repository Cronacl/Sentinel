"use client";

import { ScrollShadow } from "@heroui/react";

export function formatClaudeToolName(toolName: string) {
  return toolName
    .replace(/^claude_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function renderClaudeJson(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function SectionLabel({ label }: { label: string }) {
  return <p className="mb-2 text-[11px] text-muted">{label}</p>;
}

export function ClaudeJsonBlock({
  label,
  maxHeight = 240,
  value,
}: {
  label: string;
  maxHeight?: number;
  value: unknown;
}) {
  return (
    <div>
      <SectionLabel label={label} />
      <ScrollShadow
        className="overflow-x-auto"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <pre className="rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted whitespace-pre-wrap break-words">
          {renderClaudeJson(value)}
        </pre>
      </ScrollShadow>
    </div>
  );
}

export function ClaudeTextBlock({
  label,
  maxHeight = 240,
  text,
}: {
  label: string;
  maxHeight?: number;
  text: string;
}) {
  return (
    <div>
      <SectionLabel label={label} />
      <ScrollShadow
        className="overflow-x-auto"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <pre className="rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted whitespace-pre-wrap break-words">
          {text}
        </pre>
      </ScrollShadow>
    </div>
  );
}
