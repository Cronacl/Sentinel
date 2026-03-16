"use client";

import { Button } from "@heroui/react";
import { memo, useEffect, useState } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import { IntegrationToolLayout } from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type DownloadInput = {
  fileId: string;
  localPath?: string;
};

type DownloadOutput = {
  fileName: string;
  localPath: string;
  sizeBytes: number;
  mimeType: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const GDriveDownloadTool = memo(function GDriveDownloadTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useState(state.needsApproval);

  useEffect(() => {
    setIsExpanded(state.needsApproval);
  }, [part.toolCallId, state.needsApproval]);

  const input = "input" in part ? (part.input as DownloadInput) : null;
  const output =
    state.hasOutput && "output" in part
      ? (part.output as DownloadOutput)
      : null;

  const summary = state.needsApproval
    ? "Download file — awaiting approval"
    : state.isRunning
      ? "Downloading file…"
      : state.hasOutput && output
        ? `Downloaded "${output.fileName}" (${formatFileSize(output.sizeBytes)})`
        : state.isError
          ? "Download failed"
          : "Downloading file…";

  return (
    <IntegrationToolLayout
      actions={
        state.showApprovalActions ? (
          <div className="flex items-center gap-2">
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onApprove?.(state.approvalId)}
              size="sm"
            >
              Allow
            </Button>
            <Button
              className="h-7 min-w-0 px-3 text-[11px]"
              onPress={() => state.approvalId && onDeny?.(state.approvalId)}
              size="sm"
              variant="ghost"
            >
              Deny
            </Button>
          </div>
        ) : undefined
      }
      errorText={state.isError ? state.errorText : undefined}
      provider="Google Drive"
      providerIcon={
        <IntegrationProviderIcon provider="google_drive" className="h-4 w-4" />
      }
      summary={summary}
      isRunning={state.isRunning}
      isError={state.isError}
      isExpandable={Boolean(input || output)}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {input || output ? (
        <div className="space-y-1.5 text-xs">
          {output ? (
            <>
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:download-minimalistic-linear"
                  className="h-3.5 w-3.5 shrink-0 text-success"
                />
                <span className="text-foreground">{output.fileName}</span>
                <span className="text-foreground/35">
                  {formatFileSize(output.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:folder-path-connect-linear"
                  className="h-3.5 w-3.5 shrink-0 text-foreground/40"
                />
                <code className="truncate rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] text-foreground/70">
                  {output.localPath}
                </code>
              </div>
            </>
          ) : input ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:download-minimalistic-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <span className="text-foreground/70">
                File ID: <code className="rounded bg-foreground/5 px-1 py-0.5 text-[10px]">{input.fileId}</code>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
