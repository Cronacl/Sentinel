"use client";

import { memo, useCallback } from "react";

import { useRightSidebar } from "@/components/shell/shell-context";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";
import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { getToolName } from "../../../../types";
import { GDriveSearchSidebar } from "./gdrive-search-sidebar";

type DriveFileResult = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  owners: string[];
  webViewLink: string;
  starred: boolean;
  shared: boolean;
};

type SearchOutput = {
  files: DriveFileResult[];
  totalResults: number;
};

type SearchInput = {
  query?: string;
  folderId?: string;
  maxResults?: number;
};

export const GDriveSearchTool = memo(function GDriveSearchTool({
  part,
}: RendererProps) {
  const { open } = useRightSidebar();
  const toolName = getToolName(part as ToolPart);
  const isListMode = toolName === "gdrive_list_files";

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const hasOutput = part.state === "output-available";

  const output =
    hasOutput && "output" in part ? (part.output as SearchOutput) : null;
  const input = "input" in part ? (part.input as SearchInput) : null;

  const canOpen = Boolean(output && output.files.length > 0);

  const handleOpenSidebar = useCallback(() => {
    if (!output || output.files.length === 0) return;
    open(
      <GDriveSearchSidebar
        query={isListMode ? undefined : input?.query}
        files={output.files}
        totalResults={output.totalResults}
        isListMode={isListMode}
      />,
    );
  }, [open, output, input?.query, isListMode]);

  const label = (() => {
    if (isError)
      return isListMode ? "Failed to list Drive files" : "Drive search failed";
    if (isRunning) {
      if (isListMode) return "Listing Drive files\u2026";
      return input?.query
        ? `Searching Drive for \u201c${input.query}\u201d`
        : "Searching Drive\u2026";
    }
    if (output) {
      const count = output.totalResults;
      if (isListMode) {
        return `${count} file${count !== 1 ? "s" : ""} in folder`;
      }
      return `Found ${count} file${count !== 1 ? "s" : ""} for \u201c${input?.query ?? ""}\u201d`;
    }
    return isListMode ? "Listing Drive files\u2026" : "Searching Drive\u2026";
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
        provider="google_drive"
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
