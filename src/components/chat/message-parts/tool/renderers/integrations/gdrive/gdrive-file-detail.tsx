"use client";

import { memo, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type FileOutput = {
  file: {
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
  textContent: string | null;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function humanizeMimeType(mimeType: string): string {
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    const type = mimeType.replace("application/vnd.google-apps.", "");
    return `Google ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  }
  return mimeType;
}

export const GDriveFileDetailTool = memo(function GDriveFileDetailTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  const output =
    state.hasOutput && "output" in part
      ? (part.output as FileOutput)
      : null;

  const summary = state.isRunning
    ? "Getting file details…"
    : state.hasOutput && output
      ? output.file.name
      : state.isError
        ? "Failed to get file"
        : "Getting file…";

  return (
    <IntegrationToolLayout
      provider="Google Drive"
      providerIcon={
        <IntegrationProviderIcon provider="google_drive" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      errorText={state.isError ? state.errorText : undefined}
      footer={
        output?.file.webViewLink ? (
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href={output.file.webViewLink}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon
              icon="solar:square-arrow-right-up-linear"
              className="h-3 w-3"
            />
            Open in Drive
          </a>
        ) : undefined
      }
    >
      {output ? (
        <div className="space-y-2 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="min-w-[72px] shrink-0 text-foreground/40">
                Type
              </span>
              <span className="text-foreground/70">
                {humanizeMimeType(output.file.mimeType)}
              </span>
            </div>
            {output.file.size > 0 ? (
              <div className="flex items-start gap-2">
                <span className="min-w-[72px] shrink-0 text-foreground/40">
                  Size
                </span>
                <span className="text-foreground/70">
                  {formatFileSize(output.file.size)}
                </span>
              </div>
            ) : null}
            {output.file.modifiedTime ? (
              <div className="flex items-start gap-2">
                <span className="min-w-[72px] shrink-0 text-foreground/40">
                  Modified
                </span>
                <span className="text-foreground/70">
                  {new Date(output.file.modifiedTime).toLocaleString()}
                </span>
              </div>
            ) : null}
            {output.file.owners.length > 0 ? (
              <div className="flex items-start gap-2">
                <span className="min-w-[72px] shrink-0 text-foreground/40">
                  Owner
                </span>
                <span className="text-foreground/70">
                  {output.file.owners.join(", ")}
                </span>
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              <span className="min-w-[72px] shrink-0 text-foreground/40">
                Shared
              </span>
              <span className="text-foreground/70">
                {output.file.shared ? "Yes" : "No"}
              </span>
            </div>
          </div>
          {output.textContent ? (
            <div className="border-t border-border/30 pt-2">
              <div className="mb-1 text-[10px] font-medium text-foreground/40">
                Content Preview
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-foreground/5 p-2 text-[11px] text-foreground/70">
                {output.textContent.length > 2000
                  ? output.textContent.slice(0, 2000) + "\n…[truncated]"
                  : output.textContent}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
