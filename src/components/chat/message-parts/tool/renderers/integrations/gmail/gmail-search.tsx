"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import { GmailSearchSidebar } from "./gmail-search-sidebar";

type EmailResult = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  body?: string;
  to?: string;
  cc?: string;
  isUnread: boolean;
  isStarred: boolean;
  attachmentCount?: number;
};

type SearchOutput = {
  emails: EmailResult[];
  totalResults: number;
};

export const GmailSearchTool = memo(function GmailSearchTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as SearchOutput) : null;
  const input = "input" in part ? (part.input as { query?: string }) : null;

  const canOpen = Boolean(output && output.emails.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.emails.length === 0) return;
    open(
      <GmailSearchSidebar
        query={input?.query ?? ""}
        emails={output.emails}
        totalResults={output.totalResults}
      />,
    );
  }, [open, output, input?.query]);

  const label = (() => {
    if (isError) return "Gmail search failed";
    if (isRunning) {
      return input?.query
        ? `Searching Gmail for \u201c${input.query}\u201d`
        : "Searching Gmail\u2026";
    }
    if (output) {
      const count = output.totalResults;
      return `Found ${count} email${count !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return "Searching Gmail\u2026";
  })();

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={handleOpenSidebar}
      className={`group flex w-full items-center gap-2 text-left text-[13px] ${
        isError
          ? "text-danger"
          : isRunning
            ? "sentinel-thinking-shimmer"
            : "text-foreground/70"
      } ${canOpen ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
    >
      <IntegrationProviderIcon
        provider="gmail"
        className="h-4 w-4 shrink-0"
      />
      <span className="min-w-0 flex-1">{label}</span>
      {canOpen ? (
        <span className="shrink-0 text-[11px] text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100">
          View &rsaquo;
        </span>
      ) : null}
    </button>
  );
});
