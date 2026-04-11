"use client";

import { ScrollShadow } from "@heroui/react";

import { MarkdownContent } from "../../text/markdown-content";

export function formatCopilotToolName(toolName: string) {
  return toolName
    .replace(/^copilot_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function renderCopilotJson(value: unknown) {
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

export function CopilotJsonBlock({
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
          {renderCopilotJson(value)}
        </pre>
      </ScrollShadow>
    </div>
  );
}

export function CopilotTextBlock({
  label,
  maxHeight = 240,
  markdown = false,
  text,
}: {
  label: string;
  maxHeight?: number;
  markdown?: boolean;
  text: string;
}) {
  return (
    <div>
      <SectionLabel label={label} />
      <ScrollShadow
        className="overflow-x-auto"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {markdown ? (
          <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
            <div className="[&_.sentinel-prose]:text-[13px] [&_.sentinel-prose_a]:text-primary [&_.sentinel-prose_a]:underline [&_.sentinel-prose_a]:decoration-primary/30 [&_.sentinel-prose_a]:hover:decoration-primary">
              <MarkdownContent text={text} />
            </div>
          </div>
        ) : (
          <pre className="rounded-xl border border-border/60 bg-background/70 p-3 font-mono text-[12px] text-muted whitespace-pre-wrap break-words">
            {text}
          </pre>
        )}
      </ScrollShadow>
    </div>
  );
}
