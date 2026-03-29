"use client";

import { Button } from "@heroui/react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../../renderer";
import type { ToolPart } from "../../../../types";
import {
  IntegrationToolLayout,
  useToolExpansionState,
} from "../shared/integration-tool-layout";
import { getIntegrationToolInteractionState } from "../shared/state";
import { IntegrationProviderIcon } from "@/components/icons/integration-provider-icon";

type UploadInput = {
  localPath: string;
  name?: string;
  parentFolderId?: string;
};

type UploadOutput = {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  webViewLink: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const GDriveUploadTool = memo(function GDriveUploadTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const state = getIntegrationToolInteractionState(part as ToolPart, {
    onApprove,
    onDeny,
  });
  const [isExpanded, setIsExpanded] = useToolExpansionState({
    toolCallId: part.toolCallId,
    defaultExpanded: state.needsApproval,
    autoExpand: state.needsApproval,
  });

  const input = "input" in part ? (part.input as UploadInput) : null;
  const output =
    state.hasOutput && "output" in part ? (part.output as UploadOutput) : null;

  const fileName = output?.name ?? input?.name ?? input?.localPath ?? "";

  const summary = state.needsApproval
    ? `Upload "${fileName}" — awaiting approval`
    : state.isRunning
      ? `Uploading "${fileName}"…`
      : state.hasOutput && output
        ? `Uploaded "${output.name}" (${formatFileSize(output.sizeBytes)})`
        : state.isError
          ? "Upload failed"
          : `Uploading "${fileName}"…`;

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
      footer={
        output?.webViewLink ? (
          <a
            className="inline-flex items-center gap-1 text-primary hover:underline"
            href={output.webViewLink}
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
      {input || output ? (
        <div className="space-y-1.5 text-xs">
          {input?.localPath ? (
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:upload-minimalistic-linear"
                className="h-3.5 w-3.5 shrink-0 text-foreground/40"
              />
              <code className="truncate rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] text-foreground/70">
                {input.localPath}
              </code>
            </div>
          ) : null}
          {output ? (
            <>
              <div className="flex items-center gap-2">
                <Icon
                  icon="solar:file-check-linear"
                  className="h-3.5 w-3.5 shrink-0 text-success"
                />
                <span className="text-foreground">{output.name}</span>
                <span className="text-foreground/35">
                  {formatFileSize(output.sizeBytes)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </IntegrationToolLayout>
  );
});
